const fs = require("fs")
const vscode = require("vscode")
const path = require("path")
const parseMplSource = require("./mpl_source_parser")
const mplstyleParser = require("./mplstyle_parser")
const json5 = require('json5')

const json5Parse = (/** @type {string} */text) => {
    try {
        return json5.parse(text)
    } catch (err) {
        return err
    }
}

/**
 * https://github.com/matplotlib/matplotlib/blob/main/lib/matplotlib/colors.py#L195
 * @returns {readonly [number, number, number, number] | null}
 */
const toRGBA = (/** @type {string} */value, /** @type {Map<string, readonly [number, number, number, number]>} */colorMap) => {
    // none
    if (value.toLowerCase() === "none") {
        return [0, 0, 0, 0]
    }

    // red, blue, etc.
    const color = colorMap.get(value)
    if (color !== undefined) {
        return [...color]
    }

    // FFFFFF
    if (/^[a-f0-9]{6}$/i.test(value)) {
        return [
            parseInt(value.slice(0, 2), 16) / 256,
            parseInt(value.slice(2, 4), 16) / 256,
            parseInt(value.slice(4, 6), 16) / 256,
            1.0,
        ]
    }

    // FFFFFFFF
    if (/^[a-f0-9]{8}$/i.test(value)) {
        return [
            parseInt(value.slice(0, 2), 16) / 256,
            parseInt(value.slice(2, 4), 16) / 256,
            parseInt(value.slice(4, 6), 16) / 256,
            parseInt(value.slice(6, 8), 16) / 256,
        ]
    }

    // 0.0 = black, 1.0 = white
    const x = json5Parse(value)
    if (typeof x === "number") {
        return [x, x, x, 1.0]
    }

    return null
}

const toHex = (/** @type {readonly [number, number, number, number]} */color) => {
    return ("00" + Math.floor(color[0] * 255).toString(16).toUpperCase()).slice(-2) +
        ("00" + Math.floor(color[1] * 255).toString(16).toUpperCase()).slice(-2) +
        ("00" + Math.floor(color[2] * 255).toString(16).toUpperCase()).slice(-2) +
        (color[3] === 1 ? "" : ("00" + Math.floor(color[3] * 255).toString(16).toUpperCase()).slice(-2))
}

exports.activate = async (/** @type {vscode.ExtensionContext} */context) => {
    let mpl = parseMplSource(context.extensionPath, vscode.workspace.getConfiguration("mplstyle").get("matplotlibPath"))
    for (const err of mpl.errors) {
        vscode.window.showErrorMessage(`mplstyle: ${err}.`)
    }

    const documentations = {
        key: (/** @type {string} */text, /** @type {parseMplSource.Type} */type, /** @type {boolean} */showComparisonImage, /** @type {Map<string, string>} */images, /** @type {ReturnType<typeof parseMplSource>} */mpl) => {
            const documentation = new vscode.MarkdownString()
            const image = images.get(text)
            if (showComparisonImage && image !== undefined) {
                documentation.appendMarkdown(`![${text}](${image}|height=150)\n\n`)
            }
            documentation.appendMarkdown("---\n" + (mpl.documentation.get(text)?.comment ?? "") + "\n\n---\n#### Example")
            documentation.appendCodeblock(`${text}: ${mpl.documentation.get(text)?.exampleValue ?? ""}`, "mplstyle")
            return {
                detail: {
                    plaintext: `${text}: ${type.label}`,
                    md: new vscode.MarkdownString().appendCodeblock(`${text}: ${type.label}`, "python"),
                },
                documentation,
            }
        },
        cycler: () => ({
            detail: {
                form2: {
                    param1: `label: ${Array.from(mpl.cyclerProps.keys()).map((v) => JSON.stringify(v)).join(" | ")}`,
                    param2: `values: list`,
                },
                form3: {
                    kwargs: Array.from(mpl.cyclerProps.entries()).map(([k, v]) => `${k}: ${v.shortLabel}`),
                }
            },
            documentation: new vscode.MarkdownString("Creates a `cycler.Cycler` which cycles over one or more colors simultaneously."),
        })
    }
    
    const diagnosticCollection = vscode.languages.createDiagnosticCollection("mplstyle")
    const colorMap = new Map(Object.entries(/** @type {Record<string, readonly [number, number, number, number]>} */(JSON.parse(fs.readFileSync(path.join(context.extensionPath, "color_map.json")).toString()))))

    const imageDir = path.join(context.extensionPath, "example")
    const images = new Map(fs.readdirSync(imageDir)
        .filter((v) => v.endsWith(".png"))
        .map((v) => [v.slice(0, -".png".length), vscode.Uri.file(path.join(imageDir, v)).toString()]))

    const diagnose = () => {
        const editor = vscode.window.activeTextEditor
        if (editor?.document.languageId !== "mplstyle") {
            return
        }
        const { rc, errors } = mplstyleParser.parseAll(editor.document.getText())
        errors.push(...Array.from(rc.values()).flatMap(/** @returns {{ error: string, severity: import("./mplstyle_parser").Severity, line: number, columnStart: number, columnEnd: number }[]} */({ pair, line }) => {
            if (pair.value === null) { return [] }  // missing semicolon
            const type = mpl.params.get(pair.key.text)
            if (type === undefined) { return [{ error: `Property ${pair.key.text} is not defined`, severity: "Error", line, columnStart: pair.key.start, columnEnd: pair.key.end }] }
            if (type.check(pair.value.text) === false) {
                return [{ error: `${pair.value.text} is not assignable to ${type.label}`, severity: "Error", line, columnStart: pair.value.start, columnEnd: pair.value.end }]
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
                mpl = parseMplSource(context.extensionPath, vscode.workspace.getConfiguration("mplstyle").get("matplotlibPath"))
                for (const err of mpl.errors) {
                    vscode.window.showErrorMessage(`mplstyle: ${err}.`)
                }
            }
        }),

        vscode.languages.registerHoverProvider({ language: "mplstyle" }, {
            provideHover(document, position) {
                try {
                    const line = mplstyleParser.parseLine(document.lineAt(position.line).text)
                    if (line === null) { return }

                    if (line.key.start <= position.character && position.character < line.key.end) {
                        // Key
                        const type = mpl.params.get(line.key.text)
                        if (type == undefined) { return }
                        const { detail, documentation } = documentations.key(line.key.text, type, vscode.workspace.getConfiguration("mplstyle").get("showComparisonImage") ?? true, images, mpl)
                        return new vscode.Hover(detail.md.appendMarkdown(documentation.value), new vscode.Range(position.line, line.key.start, position.line, line.key.end))
                    } else if (line.value !== null && line.value.start <= position.character && position.character < line.value.end) {
                        // Value
                        const matches = /^\s*cycler\b/.exec(line.value.text)
                        if (matches !== null && line.value.start + matches.index <= position.character && position.character < line.value.start + matches.index + 'cycler'.length) {
                            const cycler = documentations.cycler()
                            return new vscode.Hover(
                                new vscode.MarkdownString()
                                    .appendCodeblock(`cycler(${cycler.detail.form2.param1}, ${cycler.detail.form2.param2})\ncycler(*, ${cycler.detail.form3.kwargs.join(", ")})`, 'python')
                                    .appendMarkdown("---\n")
                                    .appendMarkdown(cycler.documentation.value),
                                new vscode.Range(position.line, line.value.start + matches.index, position.line, line.value.start + matches.index + 'cycler'.length),
                            )
                        }
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
                    const textLine = document.lineAt(position.line)
                    if (textLine.text.slice(0, position.character).includes(":")) {
                        // Value
                        const line = mplstyleParser.parseLine(textLine.text)
                        if (line === null || line.value === null) { return }
                        const type = mpl.params.get(line.key.text)
                        if (type === undefined) { return }
                        const items = type.constants.map((v) => {
                            const item = new vscode.CompletionItem(v, vscode.CompletionItemKind.Constant)
                            item.detail = "constant"
                            return item
                        })
                        const colors = (/** @type {string} */quotation) => Array.from(colorMap.entries()).map(([k, v]) => {
                            const item = new vscode.CompletionItem(quotation + k + quotation, vscode.CompletionItemKind.Color)
                            item.detail = "#" + toHex(v)
                            return item
                        })
                        if (type.color) {
                            items.push(...colors(''))
                        } else if (type.label === "cycler") {
                            if (textLine.text.slice(line.value.start, position.character).trim() === "") {
                                // Function name
                                const item = new vscode.CompletionItem('cycler', vscode.CompletionItemKind.Function)
                                item.insertText = new vscode.SnippetString("cycler(color=[${1}])")
                                item.command = { title: "Trigger Parameter Hints", command: "editor.action.triggerParameterHints" }
                                item.documentation = documentations.cycler().documentation
                                items.push(item)
                            } else {
                                items.push(...colors("'"))
                            }
                        }
                        return items
                    } else {
                        // Key
                        /** @type {boolean} */
                        const showComparisonImage = vscode.workspace.getConfiguration("mplstyle").get("showComparisonImage") ?? true
                        return Array.from(mpl.params.entries()).map(([key, type]) => {
                            const item = new vscode.CompletionItem(key, vscode.CompletionItemKind.Property)
                            const { detail, documentation } = documentations.key(key, type, showComparisonImage, images, mpl)
                            item.detail = detail.plaintext
                            item.documentation = documentation
                            const colon = textLine.text.indexOf(":")
                            if (colon === -1) {
                                // Replace the entire line
                                item.range = textLine.range
                                item.insertText = new vscode.SnippetString(`${key}: \${1}`)
                                if (type.color || type.constants.length > 0 || type.label === "cycler") {
                                    item.command = { title: "Trigger Suggest", command: "editor.action.triggerSuggest" }
                                }
                            } else {
                                // Replace the key
                                item.range = new vscode.Range(position.line, 0, position.line, colon)
                            }
                            return item
                        })
                    }
                } catch (err) {
                    vscode.window.showErrorMessage(`mplstyle: ${err}`)
                    console.error(err)
                }
            }
        }),
        vscode.languages.registerSignatureHelpProvider({ language: 'mplstyle' }, {
            provideSignatureHelp(document, position) {
                try {
                    const textLine = document.lineAt(position.line)
                    const pair = mplstyleParser.parseLine(textLine.text)
                    if (pair === null || pair.value === null) { return }
                    if (/^\s*cycler\b/.test(pair.value.text)) {
                        // https://github.com/matplotlib/matplotlib/blob/b09aad279b5dcfc49dcf43e0b064eee664ddaf68/lib/matplotlib/rcsetup.py#L618-L618
                        const cycler = documentations.cycler()
                        const form2 = new vscode.SignatureInformation(`cycler(${cycler.detail.form2.param1}, ${cycler.detail.form2.param2})`)
                        form2.parameters = [new vscode.ParameterInformation(cycler.detail.form2.param1), new vscode.ParameterInformation(cycler.detail.form2.param2)]
                        const form3 = new vscode.SignatureInformation(`cycler(*, ${cycler.detail.form3.kwargs.join(", ")})`)
                        form3.parameters = cycler.detail.form3.kwargs.map((v) => new vscode.ParameterInformation(v))
                        
                        form2.documentation = form3.documentation = cycler.documentation

                        const h = new vscode.SignatureHelp()
                        h.signatures = [form2, form3]
                        if (/^\s*cycler\(\w+=/.test(pair.value.text)) {
                            // keyword arguments
                            h.activeSignature = 1
                            const pattern = /[(,]\s*(\w+)\s*=/g
                            /** @type {RegExpExecArray | null} */
                            let matches = null
                            /** @type {string | null} */
                            let last = null
                            while (matches = pattern.exec(textLine.text)) {
                                if (matches.index >= position.character) {
                                    break
                                }
                                last = matches[1]
                            }
                            if (last !== null) {
                                const index = Array.from(mpl.cyclerProps.keys()).indexOf(last)
                                if (index === -1) { return h }
                                h.activeParameter = index
                            }
                        } else {
                            // positional arguments
                            h.activeSignature = 0
                            h.activeParameter = pair.value.text.split(",").length - 1
                        }
                        return h
                    }
                } catch (err) {
                    vscode.window.showErrorMessage(`mplstyle: ${err}`)
                    console.error(err)
                }
            }
        }, "(", ",", "="),
        vscode.languages.registerColorProvider({ language: "mplstyle" }, {
            provideDocumentColors(document) {
                try {
                    /** @type {vscode.ColorInformation[]} */
                    const result = []
                    for (const { pair, line } of mplstyleParser.parseAll(document.getText()).rc.values()) {
                        const type = mpl.params.get(pair.key.text)
                        if (type === undefined || pair.value === null) { continue }
                        if (type.color) {
                            const color = toRGBA(pair.value.text, colorMap)
                            if (color !== null) {
                                result.push(new vscode.ColorInformation(new vscode.Range(line, pair.value.start, line, pair.value.end), new vscode.Color(...color)))
                            }
                        } else if (type.label === "cycler") {
                            /** @type {RegExpExecArray | null} */
                            let matches = null
                            // '0.40', 'E24A33', etc.
                            const pattern = /'(?:\w|\d|-|[.])*'|"(?:\w|\d|-|[.])*"/gi
                            while ((matches = pattern.exec(pair.value.text)) !== null) {
                                const color = toRGBA(pair.value.text.slice(matches.index + 1, matches.index + matches[0].length - 1), colorMap)
                                if (color !== null) {
                                    result.push(new vscode.ColorInformation(
                                        new vscode.Range(line, pair.value.start + matches.index + 1, line, pair.value.start + matches.index + matches[0].length - 1),
                                        new vscode.Color(...color),
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
                return [new vscode.ColorPresentation(toHex([color.red, color.green, color.blue, color.alpha]))]
            }
        }),
    )
}

exports.deactivate = () => { }
