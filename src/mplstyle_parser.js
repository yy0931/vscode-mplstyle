/** @typedef {{
 *      key: { text: string, start: number, end: number },
 *      value: { text: string, start: number, end: number } | null,
 *      commentStart: number | null,
 *  }} Pair
 */
/** @typedef {"Error" | "Warning"} Severity */

const testing = typeof globalThis.it === 'function' && typeof globalThis.describe === 'function'

/** https://github.com/matplotlib/matplotlib/blob/3a265b33fdba148bb340e743667c4ba816ced928/lib/matplotlib/__init__.py#L724-L724 */
const parseAll = (/** @type {string} */content) => {
    /** @type {Map<string, { readonly pair: Pair, readonly line: number }>} */
    const rc = new Map()

    /** @type {{ error: string, severity: Severity, line: number, columnStart: number, columnEnd: number }[]} */
    const errors = []

    for (const [lineNumber, line] of content.replaceAll('\r', '').split('\n').entries()) {
        const pair = parseLine(line)
        if (pair === null) { continue }
        if (pair.value === null) {
            errors.push({ error: "Missing colon", severity: "Error", line: lineNumber, columnStart: 0, columnEnd: line.length })
        }
        if (rc.has(pair.key.text)) {
            errors.push({ error: `duplicate key "${pair.key.text}"`, severity: "Error", line: lineNumber, columnStart: pair.key.start, columnEnd: pair.key.end })
        }
        rc.set(pair.key.text, { pair, line: lineNumber })
    }

    return { rc, errors }
}

/** @returns {Pair | null} */
const parseLine = (/** @type {string} */line) => {
    const commentStart = line.indexOf("#")
    line = (commentStart === -1 ? line : line.slice(0, commentStart)).trimEnd()
    const start = line.length - line.trimStart().length
    line = line.trimStart()
    if (line === '') {
        return null
    }

    const colon = line.indexOf(":")
    if (colon === -1) {
        return { key: { text: line, start, end: start + line.length }, value: null, commentStart: null }
    }

    const key = line.slice(0, colon).trimEnd()
    const value = line.slice(colon + 1)
    return {
        key: { text: key, start, end: start + key.length },
        value: { text: value.trimStart(), start: start + colon + 1 + (value.length - value.trimStart().length), end: start + line.length },
        commentStart: commentStart === -1 ? null : commentStart,
    }
}

module.exports = { parseAll, parseLine }

if (testing) {
    const { assert: { deepStrictEqual } } = require("chai")

    describe("parseLine", () => {
        it("with a comment", () => {
            deepStrictEqual(parseLine("  a:  b  # c"), { key: { text: "a", start: 2, end: 3 }, value: { text: "b", start: 6, end: 7 }, commentStart: 9 })
        })
        it("without comments", () => {
            deepStrictEqual(parseLine("  a:  b"), { key: { text: "a", start: 2, end: 3 }, value: { text: "b", start: 6, end: 7 }, commentStart: null })
        })
        it('comment line', () => {
            deepStrictEqual(parseLine("#### MATPLOTLIBRC FORMAT"), null)
        })
        it("empty line", () => {
            deepStrictEqual(parseLine(" "), null)
        })
        it("without a value", () => {
            const pair = parseLine("key")
            deepStrictEqual(pair?.key.text, "key")
            deepStrictEqual(pair?.value, null)
        })
    })

    describe('parseAll', () => {
        it("key-value pairs", () => {
            const { rc, errors } = parseAll(`key1: value1 # comment1\n\nkey2: value2 # comment2`)
            deepStrictEqual(errors, [])
            deepStrictEqual(rc.get("key1")?.pair.value?.text, "value1")
            deepStrictEqual(rc.get("key2")?.pair.value?.text, "value2")
        })
        it("missing colon", () => {
            deepStrictEqual(parseAll(`key1 value1`).errors, [{ error: "Missing colon", severity: "Error", line: 0, columnStart: 0, columnEnd: 11 }])
        })
        it("duplicate key", () => {
            deepStrictEqual(parseAll(`key1: value1\nkey1: value2`).errors, [{ error: `duplicate key "key1"`, severity: "Error", line: 1, columnStart: 0, columnEnd: 4 }])
        })
    })
}