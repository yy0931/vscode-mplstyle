jest.mock("vscode", () => ({}), { virtual: true })

const { _testing: { formatLine, toHex } } = require("../src/extension")

describe("formatLine", () => {
    const testFormatLine = (/** @type {string} */l, /** @type {ReturnType<typeof formatLine>} */r) =>
        test(l, () => { expect(formatLine(l)).toEqual(r) })
    testFormatLine("a: b", [])
    testFormatLine("a: b  # aa", [])
    testFormatLine("a:  # aa", [])
    testFormatLine("a:  #   aa", [])
    testFormatLine("a:# aa", [])
    testFormatLine("a:  b", [{ edit: "replace", start: 1, end: 4, replacement: ": " }])
    testFormatLine("a:  b  # foo", [{ edit: "replace", start: 1, end: 4, replacement: ": " }])
    testFormatLine("  a  :  b  # foo", [
        { edit: "delete", start: 0, end: 2 },
        { edit: "replace", start: 3, end: 8, replacement: ": " },
    ])
})

describe("toHex", () => {
    test("black", () => { expect(toHex([0, 0, 0, 1])).toEqual("000000") })
    test("white", () => { expect(toHex([1, 1, 1, 1])).toEqual("FFFFFF") })
    test("rgb", () => { expect(toHex([1, 0, 0, 1])).toEqual("FF0000") })
    test("opacity", () => { expect(toHex([1, 0, 0, 0.5])).toEqual("FF00007F") })
})
