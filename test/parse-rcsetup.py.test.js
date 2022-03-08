const { spawnSync } = require("child_process")
const fs = require("fs")
const path = require("path")
const p = require("../src/documentation-generator/parse-rcsetup.py")

describe("trimLineComment", () => {
    const testTrimLineComment = (/** @type {string} */l, /** @type {string} */r) =>
        test(l, () => { expect(p.trimLineComment(l)).toEqual(r) })

    testTrimLineComment(
        "a # b",
        "a",
    )
    testTrimLineComment(
        "a",
        "a",
    )
    testTrimLineComment(
        "'#' # b",
        "'#'",
    )
    testTrimLineComment(
        `"#" # b`,
        `"#"`,
    )
    testTrimLineComment(
        `'''#''' # b`,
        `'''#'''`,
    )
    testTrimLineComment(
        `"""#""" # b`,
        `"""#"""`,
    )
    testTrimLineComment(
        String.raw`"'#\"#" # b`,
        String.raw`"'#\"#"`,
    )
    testTrimLineComment(
        `"""'#"#""" # b`,
        `"""'#"#"""`,
    )
})

describe("parseDict", () => {
    test("key-value pairs", () => {
        expect(p.parseDict(`
dict_name = {
    "key1": value1,
    "key2": value2
}
`, 'dict_name')).toEqual({
            result: [
                { key: "key1", value: "value1" },
                { key: "key2", value: "value2" },
            ],
            err: [],
        })
    })

    test("ignore comments", () => {
        expect(p.parseDict(`
dict_name = {
    "key1": value1,  # comment
}
`, 'dict_name')).toEqual({
            result: [{ key: "key1", value: "value1" }],
            err: [],
        })
    })

    test("ignore whitespace around last comma", () => {
        expect(p.parseDict(`
dict_name = {
    "key1": value1  ,  # comment
}
`, 'dict_name')).toEqual({
            result: [{ key: "key1", value: "value1" }],
            err: [],
        })
    })

    test("multi-line list literals", () => {
        expect(p.parseDict(`
dict_name = {
    "key1": [  # comment
        "a",   # comment
        "b"    # comment
    ],         # comment
}
`, 'dict_name')).toEqual({
            result: [{ key: "key1", value: `["a","b"]` }],
            err: [],
        })
    })

    test("function calls", () => {
        expect(p.parseDict(`
dict_name = {
    "key1": func("a", "b") # comment
}
`, 'dict_name')).toEqual({
            result: [{ key: "key1", value: `func("a", "b")` }],
            err: [],
        })
    })

    test("multi-line function calls", () => {
        expect(p.parseDict(`
dict_name = {
    "key1": func(  # comment
        "a",   # comment
        "b"    # comment
    ),         # comment
}
`, 'dict_name')).toEqual({
            result: [{ key: "key1", value: `func("a","b")` }],
            err: [],
        })
    })

    test("comments containing double quotes", () => {
        expect(p.parseDict(`
dict_name = {
    "key": value,  # "foo" 'bar'
}
`, 'dict_name')).toEqual({
            result: [{ key: "key", value: `value` }],
            err: [],
        })
    })

    test("hash sign in a string literal", () => {
        expect(p.parseDict(`
dict_name = {
    "value": "#000000",
}
`, 'dict_name')).toEqual({
            result: [{ key: "value", value: `"#000000"` }],
            err: [],
        })
    })

    test("parse error 1", () => {
        expect(p.parseDict(`
dict_name = {
    "a": "b",
}
`, 'aa')).toEqual({
            result: [],
            err: [`Parse error: "aa" does not exist`],
        })
    })

    test("parse error 2", () => {
        expect(p.parseDict(`
dict_name = {
    test
}
`, 'dict_name')).toEqual({
            result: [],
            err: [`Parse error: "test"`],
        })
    })
})

describe('parseValidator', () => {
    describe("type checking", () => {
        const accept = (/** @type {string} */type, /** @type {string} */value) => {
            test(`accept ${value}: ${type}`, () => { expect(p.parseValidator(type).check(value)).toEqual(true) })
        }
        const reject = (/** @type {string} */type, /** @type {string} */value) => {
            test(`reject ${value}: ${type}`, () => { expect(p.parseValidator(type).check(value)).toEqual(false) })
        }

        accept("validate_floatlist", "1, 2.3, 4")
        accept("validate_floatlist", "")
        reject("validate_floatlist", "a, b")
        reject("validate_floatlist", "a")

        accept("['a', 'bc']", "a")
        accept("['a', 'bc']", "bc")
        reject("['a', 'bc']", "")
        reject("['a', 'bc']", "b")

        accept("validate_float_or_None", "none")
        accept("validate_float_or_None", "None")
        accept("validate_float_or_None", "2.5")
        reject("validate_float_or_None", "")
        reject("validate_float_or_None", "aa")

        accept("validate_int", "20")
        accept("validate_int", "-100")
        accept("validate_int", "0")
        reject("validate_int", "20.5")
        reject("validate_int", "a")
        reject("validate_int", "")

        accept(`_range_validators["0 <= x <= 1"]`, "0")
        accept(`_range_validators["0 <= x <= 1"]`, "0.5")
        accept(`_range_validators["0 <= x <= 1"]`, "1")
        reject(`_range_validators["0 <= x <= 1"]`, "a")
        reject(`_range_validators["0 <= x <= 1"]`, "")

        accept(`_range_validators["0 <= x < 1"]`, "0")
        accept(`_range_validators["0 <= x < 1"]`, "0.5")
        reject(`_range_validators["0 <= x < 1"]`, "1")
        reject(`_range_validators["0 <= x < 1"]`, "a")
        reject(`_range_validators["0 <= x < 1"]`, "")
    })
    describe("color", () => {
        const testIsColor = (/** @type {string} */type) => {
            test(`${type} is not a subset of color`, () => { expect(p.parseValidator(type).color).toEqual(true) })
        }
        const testIsNotColor = (/** @type {string} */type) => {
            test(`${type} is not a subset of color`, () => { expect(p.parseValidator(type).color).toEqual(false) })
        }
        testIsNotColor("validate_float")
        testIsNotColor(`_range_validators["0 <= x < 1"]`)
        testIsColor("validate_color")
        testIsColor("validate_color_or_auto")
    })
    describe("label", () => {
        const testLabel = (/** @type {string} */type, /** @type {string} */text) => {
            test(type, () => { expect(p.parseValidator(type).label).toEqual(text) })
        }
        testLabel(`["a", "bc"]`, `"a" | "bc"`)
        testLabel("validate_string", `str`)
        testLabel("validate_int", `int`)
        testLabel(`_range_validators["0 <= x <= 1"]`, `float (0 <= x <= 1)`)
        testLabel("validate_floatlist", `list[float]`)
        testLabel("validate_undefinedtype", `undefinedtype (any)`)
        testLabel("validate_foo", `foo (any)`)
        testLabel("foo", `foo (any)`)
        testLabel(`_listify_validator(validate_int, n=3)`, `list[int] (len=3)`)
        testLabel(`_listify_validator(validate_int, allow_stringlist=True)`, `str | list[int]`)
    })
})

const readFile = async (/** @type {string} */ filepath) => fs.promises.readFile(filepath).then((v) => v.toString())
const isNOENT = (/** @type {any} */ err) => err.code == "ENOENT"

describe("parseMplSource", () => {
    test("test", async () => {
        const data = await p.parseMplSource(path.join(__dirname, ".."), undefined, (a, b) => path.join(a, b), readFile, isNOENT)
        expect(data.errors).toEqual([])
        expect(data.documentation.get("backend")?.exampleValue).toContain("Agg")
        expect(data.documentation.get("figure.subplot.right")?.comment).toContain('the right side of the subplots of the figure')
        expect(data.params.has('font.family')).toEqual(true)
        expect(data.params.get('legend.fontsize')?.label).toEqual(`"xx-small" | "x-small" | "small" | "medium" | "large" | "x-large" | "xx-large" | "smaller" | "larger" | float`)
    })

    test("custom path", async () => {
        const { status, stdout, stderr, error } = spawnSync(`pip3 show matplotlib`, { shell: true })
        if (error !== undefined) {
            fail(error.toString())
        }
        if (status !== 0) {
            fail(stderr.toString())
        }
        const matches = /Location: (.*)$/m.exec(stdout.toString())
        if (matches === null) {
            fail(stdout.toString())
        }
        try {
            const { documentation, params: signatures, errors } = await p.parseMplSource('err', path.join(matches[1], "matplotlib"), (a, b) => path.join(a, b), readFile, isNOENT)
            expect(errors).toEqual([])
            expect(documentation.get("figure.subplot.right")?.comment).toContain('the right side of the subplots of the figure')
            expect(signatures.has('font.family')).toEqual(true)
        } catch (err) {
            console.log(`stdout: ${stdout.toString()}`)
            console.log(`stderr: ${stderr.toString()}`)
            throw err
        }
    }, 20 * 1000)

    test("NOENT", async () => {
        expect((await p.parseMplSource(/** @type {string} */("noent"), undefined, (a, b) => path.join(a, b), readFile, isNOENT)).errors[0]).toContain('does not exist')
    })
})
