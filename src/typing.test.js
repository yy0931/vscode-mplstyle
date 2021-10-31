const getType = require('./typing')
const { assert: { deepStrictEqual } } = require("chai")

describe('typing', () => {
    describe("type checking", () => {
        it("floatlist", () => {
            const type = getType({ kind: 'validate_', type: 'floatlist' })

            deepStrictEqual(type.check('1, 2.3, 4'), true)
            deepStrictEqual(type.check(''), true)

            deepStrictEqual(type.check('a, b'), false)
            deepStrictEqual(type.check('a'), false)
        })
        it("enum", () => {
            const type = getType({ kind: "enum", values: ["a", "bc"] })

            deepStrictEqual(type.check('a'), true)
            deepStrictEqual(type.check('bc'), true)

            deepStrictEqual(type.check(''), false)
            deepStrictEqual(type.check('b'), false)
        })
    })
    it("checks if it accepts colors", () => {
        deepStrictEqual(getType({ kind: 'validate_', type: 'float' }).color, false)
        deepStrictEqual(getType({ kind: '0 <= x < 1' }).color, false)

        deepStrictEqual(getType({ kind: 'validate_', type: 'color' }).color, true)
        deepStrictEqual(getType({ kind: 'validate_', type: 'color_or_auto' }).color, true)
    })
    describe("label", () => {
        it("enum", () => {
            deepStrictEqual(getType({ kind: 'enum', values: ["a", "bc"] }).label, `"a" | "bc"`)
        })
        it("str", () => {
            deepStrictEqual(getType({ kind: "validate_", type: "string" }).label, `str`)
        })
        it("int", () => {
            deepStrictEqual(getType({ kind: "validate_", type: "int" }).label, `int`)
        })
        it("range", () => {
            deepStrictEqual(getType({ kind: "0 <= x <= 1" }).label, `float (0 <= x <= 1)`)
        })
        it("floatlist", () => {
            deepStrictEqual(getType({ kind: "validate_", type: "floatlist" }).label, `List[float]`)
        })
        it("unknown", () => {
            deepStrictEqual(getType({ kind: "validate_", type: "undefinedtype" }).label, `undefinedtype (any)`)
        })
        it("untyped", () => {
            deepStrictEqual(getType({ kind: "untyped", type: "foo" }).label, `foo (any)`)
        })
        it("fixed length list", () => {
            deepStrictEqual(getType({ kind: "fixed_length_list", len: 3, child: { kind: "validate_", type: "int" } }).label, `List[int] (len=3)`)
        })
    })
})