import vscode from "vscode"
import Logger from "./logger"
import * as mplstyleParser from "./mplstyle-parser"
import { CompletionOptions, parseMplSource } from "./rcsetup-parser"

const formatLine = (line: string) => {
    const pair = mplstyleParser.parseLine(line)
    if (pair === null) { return [] }

    const edits: ({ edit: "delete"; start: number; end: number } | { edit: "replace"; start: number; end: number; replacement: string })[] = []

    // `  a: b` -> `a: b`
    if (pair.key.start > 0) {
        edits.push({ edit: "delete", start: 0, end: pair.key.start })
    }

    // `a : b` -> `a: b`, `a:  b` -> `a: b`, `a:b` -> `a: b`
    if (pair.value !== null && pair.value.text !== "" && (line[pair.key.end] !== ":" || pair.key.end + 2 !== pair.value.start)) {
        edits.push({ edit: "replace", start: pair.key.end, end: pair.value.start, replacement: ": " })
    }

    return edits
}

const toHex = (color: readonly [number, number, number, number]) => {
    return ("00" + Math.floor(color[0] * 255).toString(16).toUpperCase()).slice(-2) +
        ("00" + Math.floor(color[1] * 255).toString(16).toUpperCase()).slice(-2) +
        ("00" + Math.floor(color[2] * 255).toString(16).toUpperCase()).slice(-2) +
        (color[3] === 1 ? "" : ("00" + Math.floor(color[3] * 255).toString(16).toUpperCase()).slice(-2))
}

const findDocumentColorRanges = (
    mpl: Pick<Awaited<ReturnType<typeof parseMplSource>>, "params">,
    colorMap: ReadonlyMap<string, readonly [number, number, number, number]>,
    pair: mplstyleParser.Pair,
) => {
    const type = mpl.params.get(pair.key.text)
    if (type === undefined || pair.value === null) { return [] }
    const result: [start: number, end: number, color: readonly [r: number, g: number, b: number, a: number]][] = []
    const pushRange = (start: number, end: number) => {
        const color = mplstyleParser.parseColor(pair.value!.text.slice(start - pair.value!.start, end - pair.value!.start), colorMap)
        if (color !== null) {
            result.push([start, end, color])
        }
    }

    if (type.color) {
        pushRange(pair.value.start, pair.value.end)
    } else if (type.label === "cycler") {
        // '0.40', 'E24A33', 'xkcd:acid green', etc.
        for (const matches of pair.value.text.matchAll(/'[\w\d\-:. ]*'|"#?[\w\d\-:. ]*"/gi)) {
            if (matches.index === undefined) { continue }
            pushRange(pair.value.start + matches.index + 1, pair.value.start + matches.index + matches[0].length - 1)
        }
    }

    return result
}

/**
 * Generate a documentation for a runtime configuration parameter name
 */
const generateDocumentationForKey = (key: string, options: {
    mpl: Pick<Awaited<ReturnType<typeof parseMplSource>>, "params" | "documentation">
    images: Map<string, string>
    showImage: boolean
}) => {
    const type = options.mpl.params.get(key)
    if (type === undefined) {
        return null
    }

    let documentation = ''
    const image = options.images.get(key)
    if (options.showImage && image !== undefined) {
        documentation += `![${key}](${image}|height=150)\n\n---\n`
    }
    documentation += (options.mpl.documentation.get(key)?.comment ?? "") + "\n\n---\n#### Example\n"
    documentation += '```mplstyle\n' + `${key}: ${options.mpl.documentation.get(key)?.exampleValue ?? ""}\n` + '```\n'
    return {
        detail: {
            plaintext: `${key}: ${type.label}`,
            md: '```python\n' + `${key}: ${type.label}\n` + '```\n'
        },
        documentation,
    }
}

/**
 * Generate a documentation for `cycler()`
 */
const generateDocumentationForCycler = (mpl: Pick<Awaited<ReturnType<typeof parseMplSource>>, "cyclerProps">) => ({
    detail: {
        form2: {
            param1: `label: ${Array.from(mpl.cyclerProps.keys()).map((v) => JSON.stringify(v)).join(" | ")}`,
            param2: `values: list`,
        },
        form3: {
            kwargs: Array.from(mpl.cyclerProps.entries()).map(([k, v]) => `${k}: ${v.shortLabel}`),
        }
    },
    documentation: "Creates a `cycler.Cycler` which cycles over one or more colors simultaneously.",
})

export const _testing = { formatLine, toHex, generateDocumentationForKey, generateDocumentationForCycler, findDocumentColorRanges }

const readFile = async (filepath: vscode.Uri) => vscode.workspace.fs.readFile(filepath).then((v) => new TextDecoder().decode(v))
const isNOENT = (err: unknown) => err instanceof vscode.FileSystemError && ["FileNotFound", "FileIsADirectory", "NoPermissions"].includes(err.code)

const getMatplotlibPathConfig = () => {
    const value = vscode.workspace.getConfiguration("mplstyle").get("hover.matplotlibPath")
    if (value === undefined || typeof value !== "string" || value === "") {
        return undefined
    }
    return vscode.Uri.file(value)
}

const getKeywords = (cm: CompletionOptions["cm"]): CompletionOptions => {
    const none = vscode.workspace.getConfiguration("mplstyle").get<string>("completion.keywords.none")!
    const bool = vscode.workspace.getConfiguration("mplstyle").get<string[]>("completion.keywords.bool")!
    return { none, bool, cm }
}

export const activate = async (context: vscode.ExtensionContext) => {
    const logger = new Logger()
    logger.info(`${context.extension.packageJSON.publisher}.${context.extension.packageJSON.name} ${context.extension.packageJSON.version} running on VSCode ${vscode.version}`)
    logger.info(`extensionUri: ${context.extensionUri}`)

    const cm = JSON.parse(await readFile(vscode.Uri.joinPath(context.extensionUri, "matplotlib", "cm.json"))) as string[]
    let mpl = await parseMplSource(context.extensionUri, getMatplotlibPathConfig(), vscode.Uri.joinPath, readFile, isNOENT, getKeywords(cm))
    for (const err of mpl.errors) {
        logger.error(err)
    }

    const diagnosticCollection = vscode.languages.createDiagnosticCollection("mplstyle")
    const colors = new Map(Object.entries(JSON.parse(await readFile(vscode.Uri.joinPath(context.extensionUri, "matplotlib", "colors.json"))) as Record<string, readonly [number, number, number, number]>))
    logger.info(`The number of color names: ${colors.size}`)

    const imageDir = vscode.Uri.joinPath(context.extensionUri, "example")
    // NOTE: vscode.workspace.fs.readDirectory() does not work on browsers
    const images = new Map(new TextDecoder().decode(await vscode.workspace.fs.readFile(vscode.Uri.joinPath(imageDir, "index.txt"))).split("\n")
        .map((filename) => [filename.slice(0, -".png".length), vscode.Uri.joinPath(imageDir, filename).toString()]))

    const diagnose = () => {
        const editor = vscode.window.activeTextEditor
        if (editor?.document.languageId !== "mplstyle") {
            return
        }

        const ignoredKeys = new Set(vscode.workspace.getConfiguration("mplstyle.diagnostics").get<string[]>("ignoredKeys", []))

        const { rc, errors } = mplstyleParser.parseAll(editor.document.getText())
        errors.push(...Array.from(rc.values()).flat().flatMap(({ pair, line }): { error: string; severity: mplstyleParser.Severity; line: number; columnStart: number; columnEnd: number, key: string }[] => {
            if (pair.value === null) { return [] }  // missing semicolon
            const type = mpl.params.get(pair.key.text)
            if (type === undefined) { return [{ error: `Property ${pair.key.text} is not defined`, severity: "Error", line, columnStart: pair.key.start, columnEnd: pair.key.end, key: pair.key.text }] }
            if (type.check(pair.value.text) === false) {
                return [{ error: `${pair.value.text} is not assignable to ${type.label}`, severity: "Error", line, columnStart: pair.value.start, columnEnd: pair.value.end, key: pair.key.text }]
            }
            return []
        }))

        diagnosticCollection.set(
            editor.document.uri,
            errors
                .filter((err) => !ignoredKeys.has(err.key))
                .map((err) => {
                    const d = new vscode.Diagnostic(
                        new vscode.Range(err.line, err.columnStart, err.line, err.columnEnd), err.error,
                        vscode.DiagnosticSeverity[err.severity]
                    )
                    d.code = `mplstyle-key-${err.key}`
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
            mpl = await parseMplSource(context.extensionUri, getMatplotlibPathConfig(), vscode.Uri.joinPath, readFile, isNOENT, getKeywords(cm))
            for (const err of mpl.errors) {
                logger.error(err)
            }
        }
    })))

    context.subscriptions.push(vscode.languages.registerCodeActionsProvider({ language: "mplstyle" }, {
        provideCodeActions(document, range, context, token) {
            return context.diagnostics
                .filter(d => typeof d.code === "string" && d.code.startsWith("mplstyle-key-"))
                .map((d) => {
                    const key = (d.code as string).slice("mplstyle-key-".length)
                    const action = new vscode.CodeAction(`Ignore errors on key "${key}"`, vscode.CodeActionKind.QuickFix)
                    action.diagnostics = [d]
                    action.command = {
                        title: "Ignore property",
                        command: "mplstyle.ignoreKey",
                        arguments: [key],
                    }
                    return action
                })
        },
    }))

    context.subscriptions.push(vscode.commands.registerCommand("mplstyle.ignoreKey", async (key: string) => {
        if (typeof key !== "string") { return }
        const cfg = vscode.workspace.getConfiguration("mplstyle.diagnostics")
        await cfg.update("ignoredKeys", [...cfg.get<string[]>("ignoredKeys", []), key], vscode.ConfigurationTarget.Global)
    }))

    context.subscriptions.push(vscode.languages.registerHoverProvider({ language: "python" }, {
        provideHover(document, position) {
            return logger.trySync(() => {
                for (const { index, key } of mplstyleParser.findRcParamsInPythonFiles(document.lineAt(position.line).text)) {
                    if (index <= position.character && position.character < index + key.length) {
                        const docs = generateDocumentationForKey(key, { showImage: vscode.workspace.getConfiguration("mplstyle").get("hover.showImages") ?? true, images, mpl })
                        if (docs === null) { return undefined }
                        return new vscode.Hover(new vscode.MarkdownString(docs.detail.md + "---\n" + docs.documentation), new vscode.Range(position.line, index, position.line, index + key.length))
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
                    const docs = generateDocumentationForKey(line.key.text, { showImage: vscode.workspace.getConfiguration("mplstyle").get("hover.showImages") ?? true, images, mpl })
                    if (docs === null) { return undefined }
                    return new vscode.Hover(new vscode.MarkdownString(docs.detail.md + "---\n" + docs.documentation), new vscode.Range(position.line, line.key.start, position.line, line.key.end))
                } else if (line.value !== null && line.value.start <= position.character && position.character < line.value.end) {
                    // Value
                    const matches = /^\s*cycler\b/.exec(line.value.text)
                    if (matches !== null && line.value.start + matches.index <= position.character && position.character < line.value.start + matches.index + matches[0].length) {
                        const cycler = generateDocumentationForCycler(mpl)
                        return new vscode.Hover(
                            new vscode.MarkdownString()
                                .appendCodeblock(`cycler(${cycler.detail.form2.param1}, ${cycler.detail.form2.param2})\ncycler(*, ${cycler.detail.form3.kwargs.join(", ")})`, 'python')
                                .appendMarkdown("---\n")
                                .appendMarkdown(cycler.documentation),
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
                    const showComparisonImage = vscode.workspace.getConfiguration("mplstyle").get<boolean>("hover.showImages") ?? true
                    return Array.from(mpl.params.keys()).flatMap((key) => {
                        const item = new vscode.CompletionItem(key, vscode.CompletionItemKind.Property)
                        const docs = generateDocumentationForKey(key, { showImage: showComparisonImage, images, mpl })
                        if (docs === null) { return [] }
                        item.detail = `${docs.detail.plaintext} (mplstyle)`
                        item.documentation = new vscode.MarkdownString(docs.documentation)
                        item.range = new vscode.Range(position.line, match.index, position.line, match.index + match.key.length)
                        return [item]
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
                    const colorNameCompletionItems = (quotation: string, range?: vscode.Range) => Array.from(colors.entries()).map(([k, v]) => {
                        const item = new vscode.CompletionItem(quotation + k + quotation, vscode.CompletionItemKind.Color)
                        item.detail = "#" + toHex(v)
                        if (range !== undefined) { item.range = range }
                        return item
                    })
                    if (type.color) {
                        items.push(...colorNameCompletionItems(''))
                    } else if (type.label === "cycler") {
                        if (textLine.text.slice(line.value.start, position.character).trim() === "") {
                            // Function name
                            const item = new vscode.CompletionItem('cycler', vscode.CompletionItemKind.Function)
                            item.insertText = new vscode.SnippetString("cycler(color=[${1}])")
                            item.command = { title: "Trigger Parameter Hints", command: "editor.action.triggerParameterHints" }
                            item.documentation = new vscode.MarkdownString(generateDocumentationForCycler(mpl).documentation)
                            items.push(item)
                        } else {
                            const m = /['"][\w :]*$/.exec(textLine.text.slice(0, position.character))
                            if (m === null) {
                                items.push(...colorNameCompletionItems("'"))
                            } else {
                                items.push(...colorNameCompletionItems('', new vscode.Range(position.line, m.index + 1, position.line, position.character)))
                            }
                        }
                    }
                    return items
                } else {
                    // Key
                    const showComparisonImage: boolean = vscode.workspace.getConfiguration("mplstyle").get("hover.showImages") ?? true
                    return Array.from(mpl.params.entries()).flatMap(([key, type]) => {
                        const docs = generateDocumentationForKey(key, { showImage: showComparisonImage, images, mpl })
                        if (docs === null) { return [] }
                        const item = new vscode.CompletionItem(key, vscode.CompletionItemKind.Property)
                        item.detail = docs.detail.plaintext
                        item.documentation = new vscode.MarkdownString(docs.documentation)
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
                        return [item]
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
                    const cycler = generateDocumentationForCycler(mpl)
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
                        let keywordArgName: string | null = null
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
                const result: vscode.ColorInformation[] = []
                for (const { pair, line } of Array.from(mplstyleParser.parseAll(document.getText()).rc.values()).flat()) {
                    for (const [start, end, color] of findDocumentColorRanges(mpl, colors, pair)) {
                        result.push(new vscode.ColorInformation(new vscode.Range(line, start, line, end), new vscode.Color(...color)))
                    }
                }
                return result
            })
        },
        provideColorPresentations(color) {
            return logger.trySync(() => [new vscode.ColorPresentation(toHex([color.red, color.green, color.blue, color.alpha]))])
        }
    }))

    const mapEdits = (edits: ReturnType<typeof formatLine>, line: number) => edits.map((v) => v.edit === "delete" ? vscode.TextEdit.delete(new vscode.Range(line, v.start, line, v.end)) : vscode.TextEdit.replace(new vscode.Range(line, v.start, line, v.end), v.replacement))
    context.subscriptions.push(vscode.languages.registerDocumentRangeFormattingEditProvider({ language: "mplstyle" }, {
        provideDocumentRangeFormattingEdits(document, range) {
            const edits = []
            for (let i = range.start.line; i <= range.end.line; i++) {
                edits.push(...mapEdits(formatLine(document.lineAt(i).text), i))
            }
            return edits
        }
    }))
    context.subscriptions.push(vscode.languages.registerDocumentFormattingEditProvider({ language: "mplstyle" }, {
        provideDocumentFormattingEdits(document) {
            const edits: vscode.TextEdit[] = []
            for (let i = 0; i < document.lineCount; i++) {
                edits.push(...mapEdits(formatLine(document.lineAt(i).text), i))
            }
            return edits
        }
    }))
}

export const deactivate = () => { }
