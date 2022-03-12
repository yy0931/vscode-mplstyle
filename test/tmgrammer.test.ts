import * as vscodeTextmate from "vscode-textmate"
import * as oniguruma from "vscode-oniguruma"
import fs from "fs"
import path from "path"

let textmateRegistry: vscodeTextmate.Registry | null = null

const tokenize = async (source: string) => {
    if (textmateRegistry === null) {
        textmateRegistry = new vscodeTextmate.Registry({
            onigLib: oniguruma.loadWASM((await fs.promises.readFile(path.join(__dirname, "../node_modules/vscode-oniguruma/release/onig.wasm"))).buffer).then(() => ({
                createOnigScanner(/** @type {string[]} */ patterns: string[]) { return new oniguruma.OnigScanner(patterns) },
                createOnigString(s) { return new oniguruma.OnigString(s) }
            })),
            loadGrammar: async (scopeName) => {
                if (scopeName === "source.mplstyle") {
                    const filepath = path.join(__dirname, "../mplstyle.tmLanguage.json")
                    return vscodeTextmate.parseRawGrammar((await fs.promises.readFile(filepath)).toString(), filepath)
                }
                return null
            }
        })
    }
    const grammar = await textmateRegistry.loadGrammar("source.mplstyle")
    if (grammar === null) { fail() }
    /** @type {{ token: string, scopes: string[] }[]} */
    const result: { token: string; scopes: string[] }[] = []
    let ruleStack = vscodeTextmate.INITIAL
    for (const [lineNumber, line] of source.split("\n").entries()) {
        const lineTokens = grammar.tokenizeLine(line, ruleStack)
        for (const token of lineTokens.tokens) {
            result.push({ token: line.slice(token.startIndex, token.endIndex), scopes: token.scopes })
        }
        ruleStack = lineTokens.ruleStack
    }
    return result
}

test("key, value and comment", async () => {
    expect(await tokenize("foo.bar: baz  # comment")).toMatchSnapshot()
})

test("key only", async () => {
    expect(await tokenize("foo.bar")).toMatchSnapshot()
})

test("key and colon", async () => {
    expect(await tokenize("foo.bar:")).toMatchSnapshot()
})

test("comment only", async () => {
    expect(await tokenize("  # comment")).toMatchSnapshot()
})

test("quotation", async () => {
    expect(await tokenize(`foo.bar: "#ff0000" # comment`)).toEqual([
        {
            token: "foo.bar",
            scopes: ["source.mplstyle", "entity.name.label.mplstyle"],
        },
        {
            token: ":",
            scopes: ["source.mplstyle", "punctuation.separator.key-value.mapping.mplstyle"],
        },
        {
            token: " ",
            scopes: ["source.mplstyle"],
        },
        {
            token: `"#ff0000"`,
            scopes: ["source.mplstyle", "support.constant.property-value.mplstyle", "meta.property-value.mplstyle"],
        },
        {
            token: " ",
            scopes: ["source.mplstyle"],
        },
        {
            token: "#",
            scopes: ["source.mplstyle", "comment.line.number-sign.mplstyle", "punctuation.definition.comment.mplstyle"],
        },
        {
            token: " comment",
            scopes: ["source.mplstyle", "comment.line.number-sign.mplstyle"],
        },
    ])
})
