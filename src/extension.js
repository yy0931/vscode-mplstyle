const vscode = require("vscode")
const { parseMplSource } = require("./documentation-generator/parse-rcsetup.py")
const mplstyleParser = require("./parser")
const Logger = require("./logger")

const toHex = (/** @type {readonly [number, number, number, number]} */color) => {
    return ("00" + Math.floor(color[0] * 255).toString(16).toUpperCase()).slice(-2) +
        ("00" + Math.floor(color[1] * 255).toString(16).toUpperCase()).slice(-2) +
        ("00" + Math.floor(color[2] * 255).toString(16).toUpperCase()).slice(-2) +
        (color[3] === 1 ? "" : ("00" + Math.floor(color[3] * 255).toString(16).toUpperCase()).slice(-2))
}

const readFile = async (/** @type {vscode.Uri} */ filepath) => vscode.workspace.fs.readFile(filepath).then((v) => new TextDecoder().decode(v))
const isNOENT = (/** @type {unknown} */ err) => err instanceof vscode.FileSystemError && ["FileNotFound", "FileIsADirectory", "NoPermissions"].includes(err.code)

const getMatplotlibPathConfig = () => {
    const value = vscode.workspace.getConfiguration("mplstyle").get("hover.matplotlibPath")
    if (value === undefined || value === "") {
        return undefined
    }
    return vscode.Uri.file(value)
}

/** @returns {{ none: string, bool: string[] }} */
const getKeywords = () => {
    const none = vscode.workspace.getConfiguration("mplstyle").get("completion.keywords.none")
    const bool = vscode.workspace.getConfiguration("mplstyle").get("completion.keywords.bool")
    return { none, bool }
}

exports.activate = async (/** @type {vscode.ExtensionContext} */context) => {
    const logger = new Logger()
    logger.info(`${context.extension.packageJSON.publisher}.${context.extension.packageJSON.name} ${context.extension.packageJSON.version} running on VSCode ${vscode.version}`)
    logger.info(`extensionUri: ${context.extensionUri}`)

    if (!process.env.WEBPACKED) {
        logger.info(`platform: Node.js`)
        context.subscriptions.push(new (require("./preview/main_process").Previewer)(context.extensionUri, context.extensionPath, logger))
    } else {
        logger.info(`platform: browser`)
        context.subscriptions.push(vscode.commands.registerCommand("mplstyle.preview", () => logger.try(async () => {
            vscode.window.showInformationMessage(`mplstyle.preview is not supported on browsers`)
        })))
    }

    let mpl = await parseMplSource(context.extensionUri, getMatplotlibPathConfig(), vscode.Uri.joinPath, readFile, isNOENT, getKeywords())
    for (const err of mpl.errors) {
        logger.error(err)
    }

    const buildDocumentationOf = {
        key: (/** @type {string} */text, /** @type {import("./documentation-generator/parse-rcsetup.py").Type} */type, /** @type {boolean} */showComparisonImage, /** @type {Map<string, string>} */images, /** @type {Awaited<ReturnType<typeof parseMplSource>>} */mpl) => {
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
    const colorMap = new Map(Object.entries(/** @type {Record<string, readonly [number, number, number, number]>} */(JSON.parse(await readFile(vscode.Uri.joinPath(context.extensionUri, "matplotlib", "color_map.json"))))))
    logger.info(`The number of color names: ${colorMap.size}`)

    const imageDir = vscode.Uri.joinPath(context.extensionUri, "example")
    // NOTE: vscode.workspace.fs.readDirectory() does not work on browsers
    const images = new Map(new TextDecoder().decode(await vscode.workspace.fs.readFile(vscode.Uri.joinPath(imageDir, "index.txt"))).split("\n")
        .map((filename) => [filename.slice(0, -".png".length), vscode.Uri.joinPath(imageDir, filename).toString()]))

    const diagnose = () => {
        const editor = vscode.window.activeTextEditor
        if (editor?.document.languageId !== "mplstyle") {
            return
        }
        const { rc, errors } = mplstyleParser.parseAll(editor.document.getText())
        errors.push(...Array.from(rc.values()).flat().flatMap(/** @returns {{ error: string, severity: import("./parser").Severity, line: number, columnStart: number, columnEnd: number }[]} */({ pair, line }) => {
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
            errors.map((err) => {
                const d = new vscode.Diagnostic(
                    new vscode.Range(err.line, err.columnStart, err.line, err.columnEnd), err.error,
                    vscode.DiagnosticSeverity[err.severity]
                )
                d.source = "mplstyle"
                return d
            }),
        )
    }

    context.subscriptions.push(
        logger,
        diagnosticCollection,
        vscode.window.onDidChangeActiveTextEditor(() => logger.trySync(() => { diagnose() })),
        vscode.window.onDidChangeTextEditorOptions(() => logger.trySync(() => { diagnose() })),
        vscode.workspace.onDidOpenTextDocument(() => logger.trySync(() => { diagnose() })),
        vscode.workspace.onDidChangeConfiguration(() => logger.trySync(() => { diagnose() })),
        vscode.workspace.onDidChangeTextDocument(() => logger.trySync(() => { diagnose() })),
        vscode.workspace.onDidCloseTextDocument((document) => logger.trySync(() => { diagnosticCollection.delete(document.uri) })),
    )

    context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(async (ev) => logger.try(async () => {
        if (ev.affectsConfiguration("mplstyle.hover.matplotlibPath") || ev.affectsConfiguration("mplstyle.completion.keywords")) {

            mpl = await parseMplSource(context.extensionUri, getMatplotlibPathConfig(), vscode.Uri.joinPath, readFile, isNOENT, getKeywords())
            for (const err of mpl.errors) {
                logger.error(err)
            }
        }
    })))

    context.subscriptions.push(vscode.languages.registerHoverProvider({ language: "python" }, {
        provideHover(document, position) {
            return logger.trySync(() => {
                for (const { index, key } of mplstyleParser.findRcParamsInPythonFiles(document.lineAt(position.line).text)) {
                    if (index <= position.character && position.character < index + key.length) {
                        const type = mpl.params.get(key)
                        if (type === undefined) { break }
                        const { detail, documentation } = buildDocumentationOf.key(key, type, vscode.workspace.getConfiguration("mplstyle").get("hover.showImages") ?? true, images, mpl)
                        return new vscode.Hover(detail.md.appendMarkdown(documentation.value), new vscode.Range(position.line, index, position.line, index + key.length))
                    }
                }
            })
        }
    }))

    context.subscriptions.push(vscode.languages.registerHoverProvider({ language: "mplstyle" }, {
        provideHover(document, position) {
            return logger.trySync(() => {
                const line = mplstyleParser.parseLine(document.lineAt(position.line).text)
                if (line === null) { return }

                if (line.key.start <= position.character && position.character < line.key.end) {
                    // Key
                    const type = mpl.params.get(line.key.text)
                    if (type == undefined) { return }
                    const { detail, documentation } = buildDocumentationOf.key(line.key.text, type, vscode.workspace.getConfiguration("mplstyle").get("hover.showImages") ?? true, images, mpl)
                    return new vscode.Hover(detail.md.appendMarkdown(documentation.value), new vscode.Range(position.line, line.key.start, position.line, line.key.end))
                } else if (line.value !== null && line.value.start <= position.character && position.character < line.value.end) {
                    // Value
                    const matches = /^\s*cycler\b/.exec(line.value.text)
                    if (matches !== null && line.value.start + matches.index <= position.character && position.character < line.value.start + matches.index + matches[0].length) {
                        const cycler = buildDocumentationOf.cycler()
                        return new vscode.Hover(
                            new vscode.MarkdownString()
                                .appendCodeblock(`cycler(${cycler.detail.form2.param1}, ${cycler.detail.form2.param2})\ncycler(*, ${cycler.detail.form3.kwargs.join(", ")})`, 'python')
                                .appendMarkdown("---\n")
                                .appendMarkdown(cycler.documentation.value),
                            new vscode.Range(position.line, line.value.start + matches.index, position.line, line.value.start + matches.index + matches[0].length),
                        )
                    }
                }
            })
        }
    }))

    context.subscriptions.push(vscode.languages.registerCompletionItemProvider({ language: "python" }, {
        provideCompletionItems(document, position) {
            return logger.trySync(() => {
                for (const match of mplstyleParser.findRcParamsInPythonFiles(document.lineAt(position.line).text)) {
                    if (!(match.index <= position.character && position.character <= match.index + match.key.length)) { continue }
                    const showComparisonImage = vscode.workspace.getConfiguration("mplstyle").get("hover.showImages") ?? true
                    return Array.from(mpl.params.entries()).map(([key, type]) => {
                        const item = new vscode.CompletionItem(key, vscode.CompletionItemKind.Property)
                        const { detail, documentation } = buildDocumentationOf.key(key, type, showComparisonImage, images, mpl)
                        item.detail = `${detail.plaintext} (mplstyle)`
                        item.documentation = documentation
                        item.range = new vscode.Range(position.line, match.index, position.line, match.index + match.key.length)
                        return item
                    })
                }
            })
        }
    }, `"`, `'`))

    context.subscriptions.push(vscode.languages.registerCompletionItemProvider({ language: "mplstyle" }, {
        provideCompletionItems(document, position) {
            return logger.trySync(() => {
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
                            item.documentation = buildDocumentationOf.cycler().documentation
                            items.push(item)
                        } else {
                            items.push(...colors("'"))
                        }
                    }
                    return items
                } else {
                    // Key
                    /** @type {boolean} */
                    const showComparisonImage = vscode.workspace.getConfiguration("mplstyle").get("hover.showImages") ?? true
                    return Array.from(mpl.params.entries()).map(([key, type]) => {
                        const item = new vscode.CompletionItem(key, vscode.CompletionItemKind.Property)
                        const { detail, documentation } = buildDocumentationOf.key(key, type, showComparisonImage, images, mpl)
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
            })
        }
    }))

    context.subscriptions.push(vscode.languages.registerSignatureHelpProvider({ language: 'mplstyle' }, {
        provideSignatureHelp(document, position) {
            return logger.trySync(() => {
                const textLine = document.lineAt(position.line)
                const pair = mplstyleParser.parseLine(textLine.text)
                if (pair === null || pair.value === null) { return }
                if (/^\s*cycler\b/.test(pair.value.text)) {
                    // https://github.com/matplotlib/matplotlib/blob/b09aad279b5dcfc49dcf43e0b064eee664ddaf68/lib/matplotlib/rcsetup.py#L618-L618
                    const cycler = buildDocumentationOf.cycler()
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
                        /** @type {string | null} */
                        let keywordArgName = null
                        for (const matches of textLine.text.matchAll(/[(,]\s*(\w+)\s*=/g)) {
                            if (matches.index === undefined || matches.index >= position.character) { break }
                            keywordArgName = matches[1]
                        }
                        if (keywordArgName !== null) {
                            const index = Array.from(mpl.cyclerProps.keys()).indexOf(keywordArgName)
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
            })
        }
    }, "(", ",", "="))

    context.subscriptions.push(vscode.languages.registerColorProvider({ language: "mplstyle" }, {
        provideDocumentColors(document) {
            return logger.trySync(() => {
                /** @type {vscode.ColorInformation[]} */
                const result = []
                for (const { pair, line } of Array.from(mplstyleParser.parseAll(document.getText()).rc.values()).flat()) {
                    const type = mpl.params.get(pair.key.text)
                    if (type === undefined || pair.value === null) { continue }
                    if (type.color) {
                        const color = mplstyleParser.parseColor(pair.value.text, colorMap)
                        if (color !== null) {
                            result.push(new vscode.ColorInformation(new vscode.Range(line, pair.value.start, line, pair.value.end), new vscode.Color(...color)))
                        }
                    } else if (type.label === "cycler") {
                        // '0.40', 'E24A33', etc.
                        const pattern = /'(?:\w|\d|-|[.])*'|"(?:\w|\d|-|[.])*"/gi
                        for (const matches of pair.value.text.matchAll(pattern)) {
                            if (matches.index === undefined) { continue }
                            const color = mplstyleParser.parseColor(pair.value.text.slice(matches.index + 1, matches.index + matches[0].length - 1), colorMap)
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
            })
        },
        provideColorPresentations(color, ctx) {
            return logger.trySync(() => [new vscode.ColorPresentation(toHex([color.red, color.green, color.blue, color.alpha]))])
        }
    }))
}

exports.deactivate = () => { }
