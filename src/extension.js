const fs = require("fs")
const vscode = require("vscode")
const path = require("path")
const parseMplSource = require("./parse_mpl_source")
const parseMplstyle = require("./parse_mplstyle")
const typeChecker = require('./type_checker')

const isNOENT = (/** @type {unknown} */ err) => err instanceof Error && /** @type {any} */(err).code == "ENOENT"

const loadDocs = (/** @type {string} */extensionPath) => {
    // Read and parse matplotlib/rcsetup.py
    const matplotlibPathConfig = /** @type {unknown} */(vscode.workspace.getConfiguration("mplstyle").get("matplotlibPath"))
    const useDefaultPath = matplotlibPathConfig === undefined || typeof matplotlibPathConfig !== "string" || matplotlibPathConfig === ""
    const matplotlibDirectory = useDefaultPath ? path.join(extensionPath, "matplotlib") : matplotlibPathConfig

    /** @returns {string} */
    const readMatplotlibFile = (/** @type {string[]} */filepaths) => {
        for (const filepath of filepaths) {
            try {
                return fs.readFileSync(path.join(matplotlibDirectory, filepath)).toString()
            } catch (err) {
                if (isNOENT(err)) {
                    continue
                }
                vscode.window.showErrorMessage(`mplstyle: ${err}.`)
                throw err
            }
        }
        vscode.window.showErrorMessage(`mplstyle: ${filepaths.length >= 2 ? "neither of " : ""}"${filepaths.map((v) => path.resolve(path.join(matplotlibDirectory, v))).join(" nor ")}" does not exist. ${useDefaultPath ? "Please reinstall the extension" : 'Please delete or modify the value of "mplstyle.matplotlibPath" in the settings'}.`)
        return ""
    }
    return {
        signatures: parseMplSource.rcsetupPy(readMatplotlibFile(["rcsetup.py"])),
        documentation: parseMplSource.matplotlibrc(readMatplotlibFile(["lib/matplotlib/mpl-data/matplotlibrc", "mpl-data/matplotlibrc"])),
    }
}

exports.activate = async (/** @type {vscode.ExtensionContext} */context) => {
    let { documentation, signatures } = loadDocs(context.extensionPath)
    const diagnosticCollection = vscode.languages.createDiagnosticCollection("mplstyle")

    const diagnose = () => {
        const editor = vscode.window.activeTextEditor
        if (editor?.document.languageId !== "mplstyle") {
            return
        }
        const { rc, errors } = parseMplstyle.parseAll(editor.document.getText())
        errors.push(...Array.from(rc.values()).flatMap(/** @returns {{ error: string, severity: import("./parse_mplstyle").Severity, line: number, columnStart: number, columnEnd: number }[]} */({ pair, line }) => {
            if (pair.value === null) { return [] }  // missing semicolon
            const signature = signatures.get(pair.key.text)
            if (signature === undefined) { return [] }
            if (typeChecker.checkType(signature, pair.value.text) === false) {
                return [{ error: `${pair.value.text} is not assignable to ${typeChecker.reprType(signature)}`, severity: "Error", line, columnStart: pair.value.start, columnEnd: pair.value.end }]
            }
            return []
        }))
        diagnosticCollection.set(
            editor.document.uri,
            errors.map((err) => new vscode.Diagnostic(
                new vscode.Range(err.line, err.columnStart, err.line, err.columnEnd), `${err.severity}: ${err.error}`,
                vscode.DiagnosticSeverity[err.severity]
            )),
        )
    }

    context.subscriptions.push(
        diagnosticCollection,
        vscode.window.onDidChangeActiveTextEditor(() => { diagnose() }),
        vscode.window.onDidChangeTextEditorOptions(() => { diagnose() }),
		vscode.workspace.onDidOpenTextDocument(() => { diagnose() }),
		vscode.workspace.onDidChangeConfiguration(() => { diagnose() }),
		vscode.workspace.onDidChangeTextDocument(() => { diagnose() }),
        vscode.workspace.onDidCloseTextDocument((doc) => { diagnosticCollection.delete(doc.uri) }),

        vscode.workspace.onDidChangeConfiguration((ev) => {
            if (ev.affectsConfiguration("mplstyle.matplotlibPath")) {
                const out = loadDocs(context.extensionPath)
                documentation = out.documentation
                signatures = out.signatures
            }
        }),

        vscode.languages.registerHoverProvider({ language: "mplstyle" }, {
            provideHover(document, position) {
                const line = parseMplstyle.parseLine(document.lineAt(position.line).text)
                if (line === null || "error" in line) { return }

                if (line.key.start <= position.character && position.character < line.key.end) {
                    const signature = signatures.get(line.key.text)
                    if (signature === undefined) { return }
                    return new vscode.Hover(
                        new vscode.MarkdownString()
                            .appendCodeblock(`${line.key.text}: ${typeChecker.reprType(signature)}`, "python")
                            .appendMarkdown("---\n" + (documentation.get(line.key.text)?.comment ?? "") + "\n\n#### Example")
                            .appendCodeblock(documentation.get(line.key.text)?.example ?? "", "mplstyle"),
                        new vscode.Range(position.line, line.key.start, position.line, line.key.end),
                    )
                } else {
                    return
                }
            }
        }),
        vscode.languages.registerCompletionItemProvider({ language: "mplstyle" }, {
            provideCompletionItems(document, position) {
                return Array.from(signatures.entries()).map(([key, value]) => {
                    const item = new vscode.CompletionItem(key, vscode.CompletionItemKind.Property)
                    item.detail = `${key}: ${typeChecker.reprType(value)}`
                    item.documentation = new vscode.MarkdownString()
                        .appendMarkdown((documentation.get(key)?.comment ?? "") + "\n\n#### Example")
                        .appendCodeblock(documentation.get(key)?.example ?? "", "mplstyle")
                    item.insertText = new vscode.SnippetString(`${key}: \${1}`)
                    return item
                })
            }
        }),
    )
}

exports.deactivate = () => {}
