const parseMplstyle = require("./mplstyle_parser")
const { assert: { deepStrictEqual } } = require("chai")

describe("parseLine", () => {
    it("with a comment", () => {
        deepStrictEqual(parseMplstyle.parseLine("  a:  b  # c"), { key: { text: "a", start: 2, end: 3 }, value: { text: "b", start: 6, end: 7 }, commentStart: 9 })
    })
    it("without comments", () => {
        deepStrictEqual(parseMplstyle.parseLine("  a:  b"), { key: { text: "a", start: 2, end: 3 }, value: { text: "b", start: 6, end: 7 }, commentStart: null })
    })
    it('comment line', () => {
        deepStrictEqual(parseMplstyle.parseLine("#### MATPLOTLIBRC FORMAT"), null)
    })
    it("empty line", () => {
        deepStrictEqual(parseMplstyle.parseLine(" "), null)
    })
    it("without a value", () => {
        const pair = parseMplstyle.parseLine("key")
        deepStrictEqual(pair?.key.text, "key")
        deepStrictEqual(pair?.value, null)
    })
})

describe('parseAll', () => {
    it("key-value pairs", () => {
        const { rc, errors } = parseMplstyle.parseAll(`key1: value1 # comment1\n\nkey2: value2 # comment2`)
        deepStrictEqual(errors, [])
        deepStrictEqual(rc.get("key1")?.pair.value?.text, "value1")
        deepStrictEqual(rc.get("key2")?.pair.value?.text, "value2")
    })
    it("missing colon", () => {
        const { errors } = parseMplstyle.parseAll(`key1 value1`)
        deepStrictEqual(errors, [{ error: "Missing colon", severity: "Error", line: 0, columnStart: 0, columnEnd: 11 }])
    })
    it("duplicate key", () => {
        const { errors } = parseMplstyle.parseAll(`key1: value1\nkey1: value2`)
        deepStrictEqual(errors, [{ error: `duplicate key "key1"`, severity: "Error", line: 1, columnStart: 0, columnEnd: 4 }])
    })
})