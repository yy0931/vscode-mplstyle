const fs = require("fs")
const path = require("path")
const vscode = require("vscode")
const which = require("which")
const tmp = require("tmp")
const { spawnSync } = require("child_process")
const Logger = require("../logger")

/** @returns {string | null} */
const findPythonExecutable = () => {
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

const listExamples = (/** @type {string} */extensionPath) =>
    fs.readdirSync(path.join(extensionPath, "matplotlib", "examples"))
        .filter((name) => name.endsWith(".py"))
        .map((name) => name.slice(0, -".py".length))

const jsonParse = (/** @type {string} */text) => {
    try {
        return JSON.parse(text)
    } catch (err) {
        console.error(JSON.stringify(text))
        return err
    }
}

/** @typedef {{ svg: string, error: string, version: string, examples: string[], example: string, uri: string }} WebviewState */
/** @typedef {{ example?: string, viewSource?: true, log?: string, loaded?: true }} WebviewMessage */
/** @typedef {{ panel: vscode.WebviewPanel, state: { example: string, uri: string } }} Panel */
class Previewer {
    /** @readonly @type {Map<string, Panel>} */#panels
    /** @readonly @type {{ dispose(): void }[]} */#subscriptions
    /** @readonly @type {vscode.Uri} */#extensionUri
    /** @readonly @type {string} */#extensionPath
    /** @readonly @type {Logger} */#logger

    constructor(/** @type {vscode.Uri} */extensionUri, /** @type {string} */extensionPath, /** @type {Logger} */ logger) {
        this.#extensionUri = extensionUri
        this.#extensionPath = extensionPath
        this.#panels = new Map()
        this.#logger = logger

        this.#subscriptions = [
            vscode.workspace.onDidSaveTextDocument((document) => logger.try(async () => {
                if (vscode.workspace.getConfiguration("mplstyle").get("previewOnSave") || this.#panels.has(document.uri.toString())) {
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
                    return fs.readFileSync(path.join(this.#extensionPath, "matplotlib", "examples", uri.path)).toString()
                })
            }),
            vscode.window.registerWebviewPanelSerializer("mplstylePreview", /** @type {vscode.WebviewPanelSerializer<WebviewState>} */({
                deserializeWebviewPanel: async (panel, state) => this.#logger.try(async () => {
                    this.#logger.info(`deserializeWebviewPanel (title = ${panel.title}, uri = ${state.uri})`)
                    const editor = vscode.window.visibleTextEditors.find((editor) => editor.document.uri.toString() === state.uri.toString())
                    if (editor === undefined) {
                        this.#logger.info(`The document "${state.uri}", which was connected to the panel "${panel.title}", was not found`)
                        panel.dispose()
                        return
                    }
                    await this.#initPanel({ panel, state: { example: state.example, uri: state.uri } }, editor.document)
                }),
            }))
        ]
    }
    /** @returns {Promise<Panel>} */
    async #initPanel(/** @type {Panel} */panel, /** @type {vscode.TextDocument} */document) {
        this.#panels.set(panel.state.uri.toString(), panel)
        panel.panel.onDidDispose(() => {
            this.#logger.info(`The panel for ${panel.state.uri} has been closed`)
            this.#panels.delete(panel.state.uri.toString())
        }, null, this.#subscriptions)
        return new Promise((resolve) => {
            panel.panel.webview.onDidReceiveMessage((/** @type {WebviewMessage} */data) => this.#logger.try(async () => {
                this.#logger.info(`Received a message (uri = ${panel.state.uri}): ${JSON.stringify(data)}`)
                if (data.example) {
                    panel.state.example = data.example
                    await this.render(document)
                }
                if (data.viewSource && panel.state.example !== "") {
                    await vscode.window.showTextDocument(vscode.Uri.parse("mplstyle.example:" + panel.state.example + ".py"), {})
                }
                if (data.loaded) {
                    resolve(panel)
                }
            }), null, this.#subscriptions)
            panel.panel.webview.html = fs.readFileSync(path.join(this.#extensionPath, "src", "preview", "webview.html")).toString()
                .replaceAll("{{cspSource}}", panel.panel.webview.cspSource)
                .replaceAll("{{webviewUIToolkit}}", panel.panel.webview.asWebviewUri(vscode.Uri.joinPath(this.#extensionUri, "src", "preview", "webview-ui-toolkit.min.js")).toString())
                .replaceAll("{{webview.js}}", panel.panel.webview.asWebviewUri(vscode.Uri.joinPath(this.#extensionUri, "src", "preview", "webview.js")).toString())
                .replaceAll("{{codicons}}", panel.panel.webview.asWebviewUri(vscode.Uri.joinPath(this.#extensionUri, 'node_modules', '@vscode', 'codicons', 'dist', 'codicon.css')).toString())
        })
    }
    async render(/** @type {vscode.TextDocument} */document) {
        this.#logger.info(`Previewer.render (uri = ${document.uri}, languageId = ${document.languageId})`)
        if (document.languageId !== "mplstyle") { return }

        // Get a python executable
        const python = /** @type {string | undefined} */(vscode.workspace.getConfiguration("mplstyle").get("pythonPath")) || findPythonExecutable()
        if (typeof python !== "string" || python === "") {
            this.#logger.error("Could not find a Python executable. Specify the path to it in the `mplstyle.pythonPath` configuration if you have a Python executable.")
            return
        }

        // Get the list of examples
        const examples = listExamples(this.#extensionPath)
        if (examples.length === 0) { throw new Error("No example scripts are found") }

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
                    example: examples[0],
                    uri: document.uri.toString(),
                },
            }, document)
        } else {
            this.#logger.info(`The panel for ${document.uri} was found`)
            panel.panel.reveal(vscode.ViewColumn.Beside, true)
            if (!examples.includes(panel.state.example)) {
                panel.state.example = examples[0]
            }
        }

        // Render the example
        // @ts-ignore
        const f = tmp.fileSync({ postfix: '.mplstyle' })
        fs.writeFileSync(f.fd, document.getText())
        const s = spawnSync(python, [path.join(this.#extensionPath, "src", "preview", "renderer.py"), JSON.stringify({ style: f.name, ...panel.state, baseDir: path.join(this.#extensionPath, "matplotlib") })])
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

        await panel.panel.webview.postMessage({ ...output, examples, ...panel.state })
    }
    dispose() {
        for (const s of this.#subscriptions) {
            s.dispose()
        }
        this.#subscriptions.length = 0
    }
}

exports.Previewer = Previewer
