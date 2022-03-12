import fs from "fs"
import path from "path"
import vscode from "vscode"
import which from "which"
import tmp from "tmp"
import { spawnSync } from "child_process"
import Logger from "../logger"

const findPythonExecutable = (): string | null => {
    for (const pythonPath of [
        which.sync("python3", { nothrow: true }),
        which.sync("py", { nothrow: true }),      // Windows
        which.sync("python", { nothrow: true }),  // May be Python 2
    ]) {
        if (pythonPath !== null) {
            return pythonPath
        }
    }
    return null
}

type Plot = { label: string; path: string }

const listPlots = (extensionPath: string): Plot[] => {
    const exampleDir = path.join(extensionPath, "matplotlib", "examples")
    return [
        ...(vscode.workspace.getConfiguration("mplstyle").get("preview.userPlots") as string[]).map((p) => ({ label: path.basename(p), path: p })),
        ...fs.readdirSync(exampleDir)
            .filter((name) => name.endsWith(".py"))
            .map((name) => ({ label: name.slice(0, -".py".length), path: path.join(exampleDir, name) })),
    ]
}

const jsonParse = (text: string) => {
    try {
        return JSON.parse(text)
    } catch (err) {
        console.error(JSON.stringify(text))
        return err
    }
}

export type WebviewState = { svg?: string, error: string, version?: string, plots: Plot[], activePlot: Plot, uri: string }
export type WebviewMessage = { activePlot?: Plot, viewSource?: true, log?: string, loaded?: true, edit?: true }
type Panel = { panel: vscode.WebviewPanel, state: { activePlot: Plot, uri: string } }

export class Previewer {
    #panels: Map<string, Panel>
    #subscriptions: { dispose(): void }[]
    #extensionUri: vscode.Uri
    #extensionPath: string
    #logger: Logger

    constructor(extensionUri: vscode.Uri, extensionPath: string, logger: Logger) {
        this.#extensionUri = extensionUri
        this.#extensionPath = extensionPath
        this.#panels = new Map()
        this.#logger = logger

        this.#subscriptions = [
            vscode.workspace.onDidSaveTextDocument((document) => logger.try(async () => {
                if (vscode.workspace.getConfiguration("mplstyle").get("preview.activateOnSave") || this.#panels.has(document.uri.toString())) {
                    await this.render(document)
                }
            })),
            vscode.commands.registerCommand("mplstyle.preview", () => logger.try(async () => {
                const editor = vscode.window.activeTextEditor
                if (editor === undefined) { return }
                await this.render(editor.document)
            })),
            vscode.workspace.registerTextDocumentContentProvider("mplstyle.example", {
                provideTextDocumentContent: (uri) => logger.trySync(() => {
                    return fs.readFileSync(uri.path).toString()
                })
            }),
            vscode.window.registerWebviewPanelSerializer("mplstylePreview", {
                deserializeWebviewPanel: async (panel, state) => this.#logger.try(async () => {
                    this.#logger.info(`deserializeWebviewPanel (title = ${panel.title}, uri = ${state.uri})`)
                    const editor = vscode.window.visibleTextEditors.find((editor) => editor.document.uri.toString() === state.uri.toString())
                    if (editor === undefined) {
                        this.#logger.info(`The document "${state.uri}", which was connected to the panel "${panel.title}", was not found`)
                        panel.dispose()
                        return
                    }
                    this.#initPanel({ panel, state: { activePlot: state.activePlot, uri: state.uri } }, editor.document)
                        .catch((err) => this.#logger.error(err))
                }),
            } as vscode.WebviewPanelSerializer<WebviewState>),
            vscode.languages.registerCodeLensProvider({ language: "mplstyle" }, {
                provideCodeLenses(document) {
                    return logger.trySync(() => {
                        if (vscode.workspace.getConfiguration("mplstyle").get("preview.codeLens.enabled")) {
                            return [new vscode.CodeLens(new vscode.Range(0, 0, 0, 0), { command: "mplstyle.preview", title: "mplstyle: Preview" })]
                        } else {
                            return []
                        }
                    })
                }
            }),
        ]
    }
    async #initPanel(panel: Panel, document: vscode.TextDocument): Promise<Panel> {
        this.#panels.set(panel.state.uri.toString(), panel)
        panel.panel.onDidDispose(() => {
            this.#logger.info(`The panel for ${panel.state.uri} has been closed`)
            this.#panels.delete(panel.state.uri.toString())
        }, null, this.#subscriptions)
        const p: Promise<Panel> = new Promise((resolve) => {
            panel.panel.webview.onDidReceiveMessage((data: WebviewMessage) => this.#logger.try(async () => {
                this.#logger.info(`Received a message (uri = ${panel.state.uri}): ${JSON.stringify(data)}`)
                if (data.activePlot) {
                    panel.state.activePlot = data.activePlot
                    await this.render(document)
                }
                if (data.viewSource && panel.state.activePlot) {
                    if (panel.state.activePlot.path.toString().startsWith(this.#extensionPath.toString())) {
                        await vscode.window.showTextDocument(vscode.Uri.parse("mplstyle.example:" + panel.state.activePlot.path), {})
                    } else {
                        await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(panel.state.activePlot.path))
                    }
                }
                if (data.loaded) {
                    resolve(panel)
                }
                if (data.edit) {
                    // https://github.com/microsoft/vscode/blob/66b1668b66768275b655cde14d96203915feca7b/src/vs/workbench/contrib/preferences/browser/preferences.contribution.ts#L178-L178
                    await vscode.commands.executeCommand("workbench.action.openSettings", { query: "mplstyle.preview.userPlots", openToSide: true })
                }
            }), null, this.#subscriptions)
        })
        panel.panel.webview.html = fs.readFileSync(path.join(this.#extensionPath, "src", "preview", "webview.html")).toString()
            .replaceAll("{{cspSource}}", panel.panel.webview.cspSource)
            .replaceAll("./", panel.panel.webview.asWebviewUri(vscode.Uri.joinPath(this.#extensionUri, "src", "preview")).toString() + "/")
        return p
    }
    async render(document: vscode.TextDocument) {
        this.#logger.info(`Previewer.render (uri = ${document.uri}, languageId = ${document.languageId})`)
        if (document.languageId !== "mplstyle") { return }

        // Get a python executable
        const python = (vscode.workspace.getConfiguration("mplstyle").get("preview.pythonPath")) || findPythonExecutable()
        if (typeof python !== "string" || python === "") {
            this.#logger.error("Could not find a Python executable. Specify the path to it in the `mplstyle.preview.pythonPath` configuration if you have a Python executable.")
            return
        }

        // Get the list of examples
        const plots = listPlots(this.#extensionPath)
        if (plots.length === 0) { throw new Error("No scripts are found") }

        // Open the panel
        let panel = this.#panels.get(document.uri.toString())
        if (panel === undefined) {
            this.#logger.info(`The panel for ${document.uri} was not found, creating one`)
            panel = await this.#initPanel({
                panel: vscode.window.createWebviewPanel("mplstylePreview", `Preview: ${path.basename(document.fileName)}`, {
                    viewColumn: vscode.ViewColumn.Beside,
                    preserveFocus: true,
                }, {
                    enableScripts: true,
                    localResourceRoots: [this.#extensionUri],
                }),
                state: {
                    activePlot: plots[0],
                    uri: document.uri.toString(),
                },
            }, document)
        } else {
            this.#logger.info(`The panel for ${document.uri} was found`)
            panel.panel.reveal(vscode.ViewColumn.Beside, true)
            if (!plots.map((v) => v.path).includes(panel.state.activePlot.path)) {
                panel.state.activePlot = plots[0]
            }
        }

        // Render the example
        // @ts-ignore
        const f = tmp.fileSync({ postfix: '.mplstyle' })
        fs.writeFileSync(f.fd, document.getText())
        const s = spawnSync(python, [path.join(this.#extensionPath, "src", "preview", "renderer.py"), JSON.stringify({ style: f.name, ...panel.state })])
        // @ts-ignore
        f.removeCallback()
        if (s.error) {
            this.#logger.error(`${s.error}`)
            return
        }
        if (s.status !== 0) {
            this.#logger.error(`status code ${s.status}: ${s.stderr}`)
            return
        }
        const output = jsonParse(s.stdout.toString())
        if (output instanceof Error || typeof output !== "object" || output === null) {
            this.#logger.error(`Parse error: ${s.stdout.toString()}`)
            return
        }

        await panel.panel.webview.postMessage({ ...output, plots, ...panel.state })
    }
    dispose() {
        for (const s of this.#subscriptions) {
            s.dispose()
        }
        this.#subscriptions.length = 0
    }
}
