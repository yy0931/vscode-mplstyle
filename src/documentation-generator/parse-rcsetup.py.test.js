const { assert: { strictEqual, deepStrictEqual, isTrue, isFalse, include, fail } } = require("chai")
const { spawnSync } = require("child_process")
const fs = require("fs")
const path = require("path")
const p = require("./parse-rcsetup.py")

describe("trimLineComment", () => {
    const test = (/** @type {string} */l, /** @type {string} */r) => {
        it(l, () => { strictEqual(p.trimLineComment(l), r) })
    }
    test(
        "a # b",
        "a",
    )
    test(
        "a",
        "a",
    )
    test(
        "'#' # b",
        "'#'",
    )
    test(
        `"#" # b`,
        `"#"`,
    )
    test(
        `'''#''' # b`,
        `'''#'''`,
    )
    test(
        `"""#""" # b`,
        `"""#"""`,
    )
    test(
        String.raw`"'#\"#" # b`,
        String.raw`"'#\"#"`,
    )
    test(
        `"""'#"#""" # b`,
        `"""'#"#"""`,
    )
})

describe("parseDict", () => {
    it("key-value pairs", () => {
        deepStrictEqual(p.parseDict(`
dict_name = {
    "key1": value1,
    "key2": value2
}
`, 'dict_name'), {
            result: [
                { key: "key1", value: "value1" },
                { key: "key2", value: "value2" },
            ],
            err: [],
        })
    })

    it("ignore comments", () => {
        deepStrictEqual(p.parseDict(`
dict_name = {
    "key1": value1,  # comment
}
`, 'dict_name'), {
            result: [{ key: "key1", value: "value1" }],
            err: [],
        })
    })

    it("ignore whitespace around last comma", () => {
        deepStrictEqual(p.parseDict(`
dict_name = {
    "key1": value1  ,  # comment
}
`, 'dict_name'), {
            result: [{ key: "key1", value: "value1" }],
            err: [],
        })
    })

    it("multi-line list literals", () => {
        deepStrictEqual(p.parseDict(`
dict_name = {
    "key1": [  # comment
        "a",   # comment
        "b"    # comment
    ],         # comment
}
`, 'dict_name'), {
            result: [{ key: "key1", value: `["a","b"]` }],
            err: [],
        })
    })

    it("function calls", () => {
        deepStrictEqual(p.parseDict(`
dict_name = {
    "key1": func("a", "b") # comment
}
`, 'dict_name'), {
            result: [{ key: "key1", value: `func("a", "b")` }],
            err: [],
        })
    })

    it("multi-line function calls", () => {
        deepStrictEqual(p.parseDict(`
dict_name = {
    "key1": func(  # comment
        "a",   # comment
        "b"    # comment
    ),         # comment
}
`, 'dict_name'), {
            result: [{ key: "key1", value: `func("a","b")` }],
            err: [],
        })
    })

    it("comments containing double quotes", () => {
        deepStrictEqual(p.parseDict(`
dict_name = {
    "key": value,  # "foo" 'bar'
}
`, 'dict_name'), {
            result: [{ key: "key", value: `value` }],
            err: [],
        })
    })

    it("hash sign in a string literal", () => {
        deepStrictEqual(p.parseDict(`
dict_name = {
    "value": "#000000",
}
`, 'dict_name'), {
            result: [{ key: "value", value: `"#000000"` }],
            err: [],
        })
    })

    it("parse error 1", () => {
        deepStrictEqual(p.parseDict(`
dict_name = {
    "a": "b",
}
`, 'aa'), {
            result: [],
            err: [`Parse error: "aa" does not exist`],
        })
    })

    it("parse error 2", () => {
        deepStrictEqual(p.parseDict(`
dict_name = {
    test
}
`, 'dict_name'), {
            result: [],
            err: [`Parse error: "test"`],
        })
    })
})

describe('parseValidator', () => {
    describe("type checking", () => {
        const allow = (/** @type {string} */type, /** @type {string} */value) => {
            it(`allow ${value}: ${type}`, () => { isTrue(p.parseValidator(type).check(value)) })
        }
        const deny = (/** @type {string} */type, /** @type {string} */value) => {
            it(`deny ${value}: ${type}`, () => { isFalse(p.parseValidator(type).check(value)) })
        }

        allow("validate_floatlist", "1, 2.3, 4")
        allow("validate_floatlist", "")
        deny("validate_floatlist", "a, b")
        deny("validate_floatlist", "a")

        allow("['a', 'bc']", "a")
        allow("['a', 'bc']", "bc")
        deny("['a', 'bc']", "")
        deny("['a', 'bc']", "b")

        allow("validate_float_or_None", "none")
        allow("validate_float_or_None", "None")
        allow("validate_float_or_None", "2.5")
        deny("validate_float_or_None", "")
        deny("validate_float_or_None", "aa")

        allow("validate_int", "20")
        allow("validate_int", "-100")
        allow("validate_int", "0")
        deny("validate_int", "20.5")
        deny("validate_int", "a")
        deny("validate_int", "")

        allow(`_range_validators["0 <= x <= 1"]`, "0")
        allow(`_range_validators["0 <= x <= 1"]`, "0.5")
        allow(`_range_validators["0 <= x <= 1"]`, "1")
        deny(`_range_validators["0 <= x <= 1"]`, "a")
        deny(`_range_validators["0 <= x <= 1"]`, "")

        allow(`_range_validators["0 <= x < 1"]`, "0")
        allow(`_range_validators["0 <= x < 1"]`, "0.5")
        deny(`_range_validators["0 <= x < 1"]`, "1")
        deny(`_range_validators["0 <= x < 1"]`, "a")
        deny(`_range_validators["0 <= x < 1"]`, "")
    })
    describe("color", () => {
        const isColor = (/** @type {string} */type) => {
            it(`${type} is not a subset of color`, () => { isTrue(p.parseValidator(type).color) })
        }
        const isNotColor = (/** @type {string} */type) => {
            it(`${type} is not a subset of color`, () => { isFalse(p.parseValidator(type).color) })
        }
        isNotColor("validate_float")
        isNotColor(`_range_validators["0 <= x < 1"]`)
        isColor("validate_color")
        isColor("validate_color_or_auto")
    })
    describe("label", () => {
        const test = (/** @type {string} */type, /** @type {string} */text) => {
            it(type, () => { strictEqual(p.parseValidator(type).label, text) })
        }
        test(`["a", "bc"]`, `"a" | "bc"`)
        test("validate_string", `str`)
        test("validate_int", `int`)
        test(`_range_validators["0 <= x <= 1"]`, `float (0 <= x <= 1)`)
        test("validate_floatlist", `list[float]`)
        test("validate_undefinedtype", `undefinedtype (any)`)
        test("validate_foo", `foo (any)`)
        test("foo", `foo (any)`)
        test(`_listify_validator(validate_int, n=3)`, `list[int] (len=3)`)
        test(`_listify_validator(validate_int, allow_stringlist=True)`, `str | list[int]`)
    })
})

const readFile = async (/** @type {string} */ filepath) => fs.promises.readFile(filepath).then((v) => v.toString())
const isNOENT = (/** @type {unknown} */ err) => err instanceof Error && /** @type {any} */(err).code == "ENOENT"

describe("parseMplSource", () => {
    /** @type {Awaited<ReturnType<typeof p.parseMplSource>>} */
    let data
    before(async () => {
        data = await p.parseMplSource(path.join(__dirname, "../.."), undefined, (a, b) => path.join(a, b), readFile, isNOENT)
    })

    it("no errors", () => {
        deepStrictEqual(data.errors, [])
    })
    it("backend: Agg", () => {
        include(data.documentation.get("backend")?.exampleValue, "Agg")
    })
    it("figure.subplot.right", () => {
        include(data.documentation.get("figure.subplot.right")?.comment, 'the right side of the subplots of the figure')
    })
    it("font.family", () => {
        strictEqual(data.params.has('font.family'), true)
    })
    it("legend.fontsize", () => {
        strictEqual(data.params.get('legend.fontsize')?.label, `"xx-small" | "x-small" | "small" | "medium" | "large" | "x-large" | "xx-large" | "smaller" | "larger" | float`)
    })

    it("custom path", async function () {
        this.timeout(20 * 1000)
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
            return
        }
        try {
            const { documentation, params: signatures, errors } = await p.parseMplSource('err', path.join(matches[1], "matplotlib"), (a, b) => path.join(a, b), readFile, isNOENT)
            deepStrictEqual(errors, [])
            include(documentation.get("figure.subplot.right")?.comment, 'the right side of the subplots of the figure')
            strictEqual(signatures.has('font.family'), true)
        } catch (err) {
            console.log(`stdout: ${stdout.toString()}`)
            console.log(`stderr: ${stderr.toString()}`)
            throw err
        }
    })
    it("NOENT", async () => {
        include((await p.parseMplSource(/** @type {string} */("noent"), undefined, (a, b) => path.join(a, b), readFile, isNOENT)).errors[0], 'does not exist')
    })
})
