const fs = require("fs")
const vscode = require("vscode")
const path = require("path")
const parseMplSource = require("./mpl_source_parser")
const parseMplstyle = require("./mplstyle_parser")
const getType = require('./typing')
const json5 = require('json5')
const isNOENT = (/** @type {unknown} */ err) => err instanceof Error && /** @type {any} */(err).code == "ENOENT"

const json5Parse = (/** @type {string} */text) => {
    try {
        return json5.parse(text)
    } catch (err) {
        return err
    }
}

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

/** https://github.com/matplotlib/matplotlib/blob/main/lib/matplotlib/colors.py#L195 */
const toRGBA = (/** @type {string} */value, /** @type {Map<string, readonly [number, number, number, number]>} */colorMap) => {
    // none
    if (value.toLowerCase() === "none") {
        return new vscode.Color(0, 0, 0, 0)
    }

    // red, blue, etc.
    const color = colorMap.get(value)
    if (color !== undefined) {
        return new vscode.Color(...color)
    }

    // FFFFFF
    if (/^[a-f0-9]{6}$/i.test(value)) {
        return new vscode.Color(
            parseInt(value.slice(0, 2), 16) / 256,
            parseInt(value.slice(2, 4), 16) / 256,
            parseInt(value.slice(4, 6), 16) / 256,
            1.0,
        )
    }

    // FFFFFFFF
    if (/^[a-f0-9]{8}$/i.test(value)) {
        return new vscode.Color(
            parseInt(value.slice(0, 2), 16) / 256,
            parseInt(value.slice(2, 4), 16) / 256,
            parseInt(value.slice(4, 6), 16) / 256,
            parseInt(value.slice(6, 8), 16) / 256,
        )
    }

    // 0.0 = black, 1.0 = white
    const x = json5Parse(value)
    if (typeof x === "number") {
        return new vscode.Color(x, x, x, 1.0)
    }

    return null
}

exports.activate = async (/** @type {vscode.ExtensionContext} */context) => {
    let { documentation, signatures } = loadDocs(context.extensionPath)
    const diagnosticCollection = vscode.languages.createDiagnosticCollection("mplstyle")
    const colorMap = new Map(Object.entries(/** @type {Record<string, readonly [number, number, number, number]>} */(JSON.parse(fs.readFileSync(path.join(context.extensionPath, "color_map.json")).toString()))))

    const diagnose = () => {
        const editor = vscode.window.activeTextEditor
        if (editor?.document.languageId !== "mplstyle") {
            return
        }
        const { rc, errors } = parseMplstyle.parseAll(editor.document.getText())
        errors.push(...Array.from(rc.values()).flatMap(/** @returns {{ error: string, severity: import("./mplstyle_parser").Severity, line: number, columnStart: number, columnEnd: number }[]} */({ pair, line }) => {
            if (pair.value === null) { return [] }  // missing semicolon
            const signature = signatures.get(pair.key.text)
            if (signature === undefined) { return [{ error: `Property ${pair.key.text} is not defined`, severity: "Error", line, columnStart: pair.key.start, columnEnd: pair.key.end }] }
            const typeChecker = getType(signature)
            if (typeChecker[1](pair.value.text) === false) {
                return [{ error: `${pair.value.text} is not assignable to ${typeChecker[0]}`, severity: "Error", line, columnStart: pair.value.start, columnEnd: pair.value.end }]
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
                try {
                    const line = parseMplstyle.parseLine(document.lineAt(position.line).text)
                    if (line === null) { return }

                    if (line.key.start <= position.character && position.character < line.key.end) {
                        const signature = signatures.get(line.key.text)
                        if (signature === undefined) { return }
                        return new vscode.Hover(
                            new vscode.MarkdownString()
                                .appendCodeblock(`${line.key.text}: ${getType(signature)[0]}`, "python")
                                .appendMarkdown("---\n" + (documentation.get(line.key.text)?.comment ?? "") + "\n\n#### Example")
                                .appendCodeblock(`${line.key.text}: ${documentation.get(line.key.text)?.exampleValue ?? ""}`, "mplstyle"),
                            new vscode.Range(position.line, line.key.start, position.line, line.key.end),
                        )
                    } else {
                        return
                    }
                } catch (err) {
                    vscode.window.showErrorMessage(`mplstyle: ${err}`)
                    console.error(err)
                }
            }
        }),
        vscode.languages.registerCompletionItemProvider({ language: "mplstyle" }, {
            provideCompletionItems(document, position) {
                try {
                    if (document.lineAt(position.line).text.slice(0, position.character).includes(":")) {
                        // Value
                        const line = parseMplstyle.parseLine(document.lineAt(position.line).text)
                        if (line === null) { return }
                        const signature = signatures.get(line.key.text)
                        if (signature === undefined) { return }
                        return getType(signature)[2].map((v) => new vscode.CompletionItem(v, vscode.CompletionItemKind.Constant))
                    } else {
                        // Key
                        return Array.from(signatures.entries()).map(([key, value]) => {
                            const item = new vscode.CompletionItem(key, vscode.CompletionItemKind.Property)
                            item.detail = `${key}: ${getType(value)[0]}`
                            item.documentation = new vscode.MarkdownString()
                                .appendMarkdown((documentation.get(key)?.comment ?? "") + "\n\n#### Example")
                                .appendCodeblock(`${key}: ${documentation.get(key)?.exampleValue ?? ""}`, "mplstyle")
                            item.insertText = new vscode.SnippetString(`${key}: \${1}`)
                            return item
                        })
                    }
                } catch (err) {
                    vscode.window.showErrorMessage(`mplstyle: ${err}`)
                    console.error(err)
                }
            }
        }),
        vscode.languages.registerColorProvider({ language: "mplstyle" }, {
            provideDocumentColors(document) {
                try {
                    /** @type {vscode.ColorInformation[]} */
                    const result = []
                    for (const { pair, line } of parseMplstyle.parseAll(document.getText()).rc.values()) {
                        const signature = signatures.get(pair.key.text)
                        if (signature === undefined || !("type" in signature) || pair.value === null) { continue }
                        if (signature.type.includes("color")) { // color or color_or_auto
                            const color = toRGBA(pair.value.text, colorMap)
                            if (color !== null) {
                                result.push(new vscode.ColorInformation(new vscode.Range(line, pair.value.start, line, pair.value.end), color))
                            }
                        } else if (signature.type === "cycler") {
                            /** @type {RegExpExecArray | null} */
                            let matches = null
                            const pattern = /'(?:\w|\d|-)*'|"(?:\w|\d|-)*"/gi
                            while ((matches = pattern.exec(pair.value.text)) !== null) {
                                const color = toRGBA(pair.value.text.slice(matches.index + 1, matches.index + matches[0].length - 1), colorMap)
                                if (color !== null) {
                                    result.push(new vscode.ColorInformation(
                                        new vscode.Range(line, pair.value.start + matches.index + 1, line, pair.value.start + matches.index + matches[0].length - 1),
                                        color,
                                    ))
                                }
                            }
                        }
                    }
                    return result
                } catch (err) {
                    vscode.window.showErrorMessage(`mplstyle: ${err}`)
                    console.error(err)
                }
            },
            provideColorPresentations(color, ctx) {
                return [new vscode.ColorPresentation(
                    ("00" + Math.floor(color.red * 255).toString(16).toUpperCase()).slice(-2) +
                    ("00" + Math.floor(color.green * 255).toString(16).toUpperCase()).slice(-2) +
                    ("00" + Math.floor(color.blue * 255).toString(16).toUpperCase()).slice(-2) +
                    (color.alpha === 1 ? "" : ("00" + Math.floor(color.alpha * 255).toString(16).toUpperCase()).slice(-2)),
                )]
            }
        })
    )
}

exports.deactivate = () => { }
