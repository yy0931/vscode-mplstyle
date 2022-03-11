const { spawnSync } = require("child_process")
const fs = require("fs")
const path = require("path")
const p = require("../src/rcsetup-parser")
const { testInputOutput, testInputOutputWithTitle } = require("./helper")

describe("trimLineComment", () => {
    testInputOutput(p._testing.trimLineComment)(
        [["a # b"], "a"],
        [["a"], "a"],
        [["'#' # b"], "'#'"],
        [[`"#" # b`], `"#"`],
        [[`'''#''' # b`], `'''#'''`],
        [[`"""#""" # b`], `"""#"""`],
        [[String.raw`"'#\"#" # b`], String.raw`"'#\"#"`],
        [[`"""'#"#""" # b`], `"""'#"#"""`],
    )
})

describe("parseDict", () => {
    testInputOutputWithTitle(p._testing.parseDict)({
        "key-value pairs": [[`
dict_name = {
    "key1": value1,
    "key2": value2
}
`, 'dict_name'], {
            result: [
                { key: "key1", value: "value1" },
                { key: "key2", value: "value2" },
            ],
            err: [],
        }],
        "ignore comments": [[`
dict_name = {
    "key1": value1,  # comment
}
`, 'dict_name'], {
            result: [{ key: "key1", value: "value1" }],
            err: [],
        }],
        "ignore whitespace around last comma": [[`
dict_name = {
    "key1": value1  ,  # comment
}
`, 'dict_name'], {
            result: [{ key: "key1", value: "value1" }],
            err: [],
        }],
        "multi-line list literals": [[`
dict_name = {
    "key1": [  # comment
        "a",   # comment
        "b"    # comment
    ],         # comment
}
`, 'dict_name'], {
            result: [{ key: "key1", value: `["a","b"]` }],
            err: [],
        }],
        "function calls": [[`
dict_name = {
    "key1": func("a", "b") # comment
}
`, 'dict_name'], {
            result: [{ key: "key1", value: `func("a", "b")` }],
            err: [],
        }],
        "multi-line function calls": [[`
dict_name = {
    "key1": func(  # comment
        "a",   # comment
        "b"    # comment
    ),         # comment
}
`, 'dict_name'], {
            result: [{ key: "key1", value: `func("a","b")` }],
            err: [],
        }],
        "comments containing double quotes": [[`
dict_name = {
    "key": value,  # "foo" 'bar'
}
`, 'dict_name'], {
            result: [{ key: "key", value: `value` }],
            err: [],
        }],
        "hash sign in a string literal": [[`
dict_name = {
    "value": "#000000",
}
`, 'dict_name'], {
            result: [{ key: "value", value: `"#000000"` }],
            err: [],
        }],
        "parse error 1": [[`
dict_name = {
    "a": "b",
}
`, 'aa'], {
            result: [],
            err: [`Parse error: "aa" does not exist`],
        }],
        "parse error 2": [[`
dict_name = {
    test
}
`, 'dict_name'], {
            result: [],
            err: [`Parse error: "test"`],
        }],
    })
})

describe('parseValidator', () => {
    describe("type checking", () => {
        const accepted = true
        const rejected = false
        testInputOutput((/** @type {string} */type, /** @type {string} */value) => p._testing.parseValidator(type).check(value))(
            [["validate_floatlist", "1, 2.3, 4"], accepted],
            [["validate_floatlist", ""], accepted],
            [["validate_floatlist", "a, b"], rejected],
            [["validate_floatlist", "a"], rejected],

            [["['a', 'bc']", "a"], accepted],
            [["['a', 'bc']", "bc"], accepted],
            [["['a', 'bc']", ""], rejected],
            [["['a', 'bc']", "b"], rejected],

            [["validate_float_or_None", "none"], accepted],
            [["validate_float_or_None", "None"], accepted],
            [["validate_float_or_None", "2.5"], accepted],
            [["validate_float_or_None", ""], rejected],
            [["validate_float_or_None", "aa"], rejected],

            [["validate_int", "20"], accepted],
            [["validate_int", "-100"], accepted],
            [["validate_int", "0"], accepted],
            [["validate_int", "20.5"], rejected],
            [["validate_int", "a"], rejected],
            [["validate_int", ""], rejected],

            [[`_range_validators["0 <= x <= 1"]`, "0"], accepted],
            [[`_range_validators["0 <= x <= 1"]`, "0.5"], accepted],
            [[`_range_validators["0 <= x <= 1"]`, "1"], accepted],
            [[`_range_validators["0 <= x <= 1"]`, "a"], rejected],
            [[`_range_validators["0 <= x <= 1"]`, ""], rejected],

            [[`_range_validators["0 <= x < 1"]`, "0"], accepted],
            [[`_range_validators["0 <= x < 1"]`, "0.5"], accepted],
            [[`_range_validators["0 <= x < 1"]`, "1"], rejected],
            [[`_range_validators["0 <= x < 1"]`, "a"], rejected],
            [[`_range_validators["0 <= x < 1"]`, ""], rejected],
        )
    })
    describe("color", () => {
        const isSupersetOfColorType = true
        const isNotSupersetOfColorType = false
        testInputOutput((/** @type {string} */type) => p._testing.parseValidator(type).color)(
            [["validate_color"], isSupersetOfColorType],
            [["validate_color_or_auto"], isSupersetOfColorType],
            [["validate_float"], isNotSupersetOfColorType],
            [[`_range_validators["0 <= x < 1"]`], isNotSupersetOfColorType],
        )
    })
    describe("label", () => {
        testInputOutput((/** @type {string} */type) => p._testing.parseValidator(type).label)(
            [[`["a", "bc"]`], `"a" | "bc"`],
            [["validate_string"], `str`],
            [["validate_int"], `int`],
            [[`_range_validators["0 <= x <= 1"]`], `float (0 <= x <= 1)`],
            [["validate_floatlist"], `list[float]`],
            [["validate_undefinedtype"], `undefinedtype (any)`],
            [["validate_foo"], `foo (any)`],
            [["foo"], `foo (any)`],
            [[`_listify_validator(validate_int, n=3)`], `list[int] (len=3)`],
            [[`_listify_validator(validate_int, allow_stringlist=True)`], `str | list[int]`],
        )
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
