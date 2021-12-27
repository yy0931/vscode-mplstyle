const { assert: { deepStrictEqual } } = require("chai")
const { formatLine } = require("./format")

describe("formatLine", () => {
    const test = (/** @type {string} */l, /** @type {ReturnType<typeof formatLine>} */r) => {
        it(l, () => {
            deepStrictEqual(formatLine(l), r)
        })
    }
    test("a: b", [])
    test("a: b  # aa", [])
    test("a:  # aa", [])
    test("a:  #   aa", [])
    test("a:# aa", [])
    test("a:  b", [{ edit: "replace", start: 1, end: 4, replacement: ": " }])
    test("a:  b  # foo", [{ edit: "replace", start: 1, end: 4, replacement: ": " }])
    test("  a  :  b  # foo", [
        { edit: "delete", start: 0, end: 2 },
        { edit: "replace", start: 3, end: 8, replacement: ": " },
    ])
})
