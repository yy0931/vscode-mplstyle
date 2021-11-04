const fs = require("fs")
const path = require("path")
const vscode = require("vscode")
const which = require("which")
const tmp = require("tmp")
const { spawnSync } = require("child_process")

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

const getHTML = (/** @type {vscode.WebviewPanel} */webviewPanel, /** @type {string} */extensionPath) => {
    return fs.readFileSync(path.join(extensionPath, "src", "preview", "webview.html")).toString()
        .replaceAll("{{cspSource}}", webviewPanel.webview.cspSource)
        .replaceAll("{{webviewUIToolkit}}", webviewPanel.webview.asWebviewUri(vscode.Uri.file(path.join(extensionPath, "node_modules", "@vscode", "webview-ui-toolkit", "dist", "toolkit.js"))).toString())
        .replaceAll("{{webview.js}}", webviewPanel.webview.asWebviewUri(vscode.Uri.file(path.join(extensionPath, "src", "preview", "webview.js"))).toString())
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

/** @type {<T>(f: () => Promise<T>) => Promise<T | undefined>} */
const showError = async (f) => {
    try {
        return f()
    } catch (err) {
        await vscode.window.showErrorMessage(`mplstyle: ${err}`)
        console.error(err)
    }
}

class Previewer {
    /** @readonly @type {Map<string, { panel: vscode.WebviewPanel, exampleSelected: string }>} */#panels
    /** @readonly @type {{ dispose(): void }[]} */#subscriptions
    /** @readonly @type {vscode.Uri} */#extensionUri
    /** @readonly @type {string} */#extensionPath

    constructor(/** @type {vscode.Uri} */extensionUri, /** @type {string} */extensionPath) {
        this.#extensionUri = extensionUri
        this.#extensionPath = extensionPath
        this.#panels = new Map()

        this.#subscriptions = [
            vscode.workspace.onDidSaveTextDocument((document) => showError(async () => {
                if (vscode.workspace.getConfiguration("mplstyle").get("previewOnSave") || this.#panels.has(document.uri.toString())) {
                    await this.reveal(document)
                }
            })),
            vscode.commands.registerCommand("mplstyle.preview", () => showError(async () => {
                const editor = vscode.window.activeTextEditor
                if (editor === undefined) { return }
                await this.reveal(editor.document)
            })),
            vscode.workspace.registerTextDocumentContentProvider("mplstyle.example", {
                provideTextDocumentContent: (uri) => {
                    return fs.readFileSync(path.join(this.#extensionPath, "matplotlib", "examples", uri.path)).toString()
                }
            })
        ]
    }
    async reveal(/** @type {vscode.TextDocument} */document) {
        if (document.languageId !== "mplstyle") { return }

        // Get a python executable
        const python = /** @type {string | undefined} */(vscode.workspace.getConfiguration("mplstyle").get("pythonPath")) || findPythonExecutable()
        if (typeof python !== "string" || python === "") {
            await vscode.window.showErrorMessage("mplstyle: Could not find a Python executable. Specify the path to it in the `mplstyle.pythonPath` configuration if you have a Python executable.")
            return
        }

        // Get the list of examples
        const examples = listExamples(this.#extensionPath)
        if (examples.length === 0) { throw new Error("No example scripts are found") }

        // Open the panel
        let panel = this.#panels.get(document.uri.toString())
        if (panel === undefined) {
            const newPanel = panel = {
                panel: vscode.window.createWebviewPanel("mplstylePreview", `Preview: ${path.basename(document.fileName)}`, {
                    viewColumn: vscode.ViewColumn.Beside,
                    preserveFocus: true,
                }, {
                    enableScripts: true,
                    localResourceRoots: [this.#extensionUri],
                }),
                exampleSelected: examples[0],
            }
            this.#panels.set(document.uri.toString(), newPanel)
            newPanel.panel.onDidDispose(() => {
                this.#panels.delete(document.uri.toString())
            }, null, this.#subscriptions)
            newPanel.panel.webview.onDidReceiveMessage((/** @type {{ exampleSelected?: string, viewSource?: true }} */data) => showError(async () => {
                if (data.viewSource && newPanel.exampleSelected !== "") {
                    await vscode.window.showTextDocument(vscode.Uri.parse("mplstyle.example:" + newPanel.exampleSelected + ".py"), { })
                }
                if (data.exampleSelected) {
                    newPanel.exampleSelected = data.exampleSelected
                    await this.reveal(document)
                }
            }), null, this.#subscriptions)
            panel.panel.webview.html = getHTML(panel.panel, this.#extensionPath)
        } else {
            panel.panel.reveal(vscode.ViewColumn.Beside, true)
            if (!examples.includes(panel.exampleSelected)) {
                panel.exampleSelected = examples[0]
            }
        }

        // Render the example
        const f = tmp.fileSync({ postfix: '.mplstyle' })
        fs.writeFileSync(f.fd, document.getText())
        const s = spawnSync(python, [path.join(this.#extensionPath, "src", "preview", "renderer.py"), f.name, panel.exampleSelected, path.join(this.#extensionPath, "matplotlib")])
        f.removeCallback()
        if (s.error) {
            await vscode.window.showErrorMessage(`mplstyle: ${s.error}`)
            return
        }
        if (s.status !== 0) {
            await vscode.window.showErrorMessage(`mplstyle: status code ${s.status}: ${s.stderr}`)
            return
        }
        const output = jsonParse(s.stdout)
        if (output instanceof Error || typeof output !== "object" || output === null) {
            await vscode.window.showErrorMessage(`mplstyle: Parse error: ${s.stdout}`)
            return
        }

        await panel.panel.webview.postMessage({ ...output, examples, exampleSelected: panel.exampleSelected })
    }
    dispose() {
        for (const s of this.#subscriptions) {
            s.dispose()
        }
        this.#subscriptions.length = 0
    }
}

exports.Previewer = Previewer
