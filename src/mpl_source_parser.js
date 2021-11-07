const json5 = require("json5")
const parseMatplotlibrc = require("./sample_matplotlibrc_parser")
const isNOENT = (/** @type {unknown} */ err) => err instanceof Error && /** @type {any} */(err).code == "ENOENT"

const json5Parse = (/** @type {string} */text) => {
    try {
        return json5.parse(text)
    } catch (err) {
        return err
    }
}

const testing = typeof globalThis.it === 'function' && typeof globalThis.describe === 'function'

/** https://stackoverflow.com/a/3561711/10710682 */
const escapeRegExp = (/** @type {string} */string) => string.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')

const trimLineComment = (/** @type {string} */source) => {
    /** @type {string} */
    let strLiteral = ""
    for (let i = 0; i < source.length; i++) {
        const char = source[i]
        if (strLiteral === "") {
            if (char === `"` || char === `'`) {
                strLiteral = char
                while (source[i + 1] === char) {
                    strLiteral += source[i + 1]
                    i++
                }
            } else if (char === `#`) {
                return source.slice(0, i).trimEnd()
            }
        } else {
            if (source.startsWith(strLiteral, i)) {
                i += strLiteral.length - 1
                strLiteral = ""
            } else if (char === '\\') {
                i++
            }
        }
    }

    return source
}

if (testing) {
    const { assert: { strictEqual } } = require("chai")

    describe("trimLineComment", () => {
        it("simple case", () => { strictEqual(trimLineComment("a # b"), "a") })
        it("without a comment", () => { strictEqual(trimLineComment("a"), "a") })
        it("single quotation marks", () => { strictEqual(trimLineComment("'#' # b"), "'#'") })
        it("double quotation marks", () => { strictEqual(trimLineComment(`"#" # b`), `"#"`) })
        it("multiple single quotation marks", () => { strictEqual(trimLineComment(`'''#''' # b`), `'''#'''`) })
        it("multiple double quotation marks", () => { strictEqual(trimLineComment(`"""#""" # b`), `"""#"""`) })
        it("quotation marks in a string literal 1", () => { strictEqual(trimLineComment(String.raw`"'#\"#" # b`), String.raw`"'#\"#"`) })
        it("quotation marks in a string literal 2", () => { strictEqual(trimLineComment(`"""'#"#""" # b`), `"""'#"#"""`) })
    })
}

/**
 * Parse
 * ```python
 * <variableNamePattern> = {
 *     "a": b,  # comment
 *     "c": d
 * }
 * ```
 * to
 * ```
 * [{ key: "a", value: "b" }, { key: "c", value: "d" }]
 * ```
 * @returns {[{ key: string, value: string }[], string[]]}
 */
const parseDict = (/** @type {string} */content, /** @type {string} */ variableNamePattern) => {
    content = content.replace(/\r/g, "")
    const replaced = content.replace(new RegExp(String.raw`^(.|\n)*\n\s*${variableNamePattern}\s*=\s*\{\n`), "") // remove the code before `_validators = {`
    if (content === replaced) {
        return [[], [`Parse error: "${variableNamePattern}" does not exist`]]
    }
    content = replaced

    /** @type {{ readonly value: string, readonly key: string }[]} */
    const result = []
    /** @type {string[]} */
    const errors = []
    const lines = content.split("\n").map((line) => line.trim())
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        // Repeat until `}`
        if (line === "}") {
            break
        }

        /** @type {RegExpExecArray | null} */
        let matches = null
        // Parse `"foo.bar": validator, # comment`_
        if (matches = /^\s*["']([\w\-_]+(?:\.[\w\-_]+)*)["']\s*:\s*(.*)$/.exec(line)) {
            const key = matches[1]
            let value = trimLineComment(matches[2])
            // Read until the next right bracket if there is a unmatched parenthesis
            for (const [left, right] of [["[", "]"], ["(", ")"]]) {
                if (new RegExp(r`^\w*${escapeRegExp(left)}`).test(value) && !value.includes(right)) {
                    i++
                    for (; i < lines.length; i++) {
                        if (lines[i].includes(right)) {
                            value += lines[i].split(right)[0] + right
                            break
                        } else {
                            value += trimLineComment(lines[i])
                        }
                    }
                }
            }
            if (value.endsWith(",")) {
                value = value.slice(0, -1).trim()
            }
            result.push({ value, key })
        } else if (!/^\s*(?:#.*)?$/.test(line)) {
            errors.push(`Parse error: "${line}"`)
        }
    }

    return [result, errors]
}

if (testing) {
    const { assert: { deepStrictEqual } } = require("chai")

    describe("parseDict", () => {
        it("key-value pairs", () => {
            deepStrictEqual(parseDict(`
dict_name = {
    "key1": value1,
    "key2": value2
}
`, 'dict_name'), [[{ key: "key1", value: "value1" }, { key: "key2", value: "value2" }], []])
        })

        it("ignore comments", () => {
            deepStrictEqual(parseDict(`
dict_name = {
    "key1": value1,  # comment
}
`, 'dict_name'), [[{ key: "key1", value: "value1" }], []])
        })

        it("ignore whitespace around last comma", () => {
            deepStrictEqual(parseDict(`
dict_name = {
    "key1": value1  ,  # comment
}
`, 'dict_name'), [[{ key: "key1", value: "value1" }], []])
        })

        it("multi-line list literals", () => {
            deepStrictEqual(parseDict(`
dict_name = {
    "key1": [  # comment
        "a",   # comment
        "b"    # comment
    ],         # comment
}
`, 'dict_name'), [[{ key: "key1", value: `["a","b"]` }], []])
        })

        it("function calls", () => {
            deepStrictEqual(parseDict(`
dict_name = {
    "key1": func("a", "b") # comment
}
`, 'dict_name'), [[{ key: "key1", value: `func("a", "b")` }], []])
        })

        it("multi-line function calls", () => {
            deepStrictEqual(parseDict(`
dict_name = {
    "key1": func(  # comment
        "a",   # comment
        "b"    # comment
    ),         # comment
}
`, 'dict_name'), [[{ key: "key1", value: `func("a","b")` }], []])
        })

        it("comments containing double quotes", () => {
            deepStrictEqual(parseDict(`
dict_name = {
    "key": value,  # "foo" 'bar'
}
`, 'dict_name'), [[{ key: "key", value: `value` }], []])
        })

        it("hash sign in a string literal", () => {
            deepStrictEqual(parseDict(`
dict_name = {
    "value": "#000000",
}
`, 'dict_name'), [[{ key: "value", value: `"#000000"` }], []])
        })

        it("parse error 1", () => {
            deepStrictEqual(parseDict(`
dict_name = {
    "a": "b",
}
`, 'aa'), [[], [`Parse error: "aa" does not exist`]])
        })

        it("parse error 2", () => {
            deepStrictEqual(parseDict(`
dict_name = {
    test
}
`, 'dict_name'), [[], [`Parse error: "test"`]])
        })
    })
}

const matchExpr = (/** @type {string} */pattern, /** @type {string} */source) => {
    return new RegExp(String.raw`^${pattern}$`).exec(source)
}

const r = String.raw.bind(String)

/**
 * @typedef {{ readonly label: string, readonly shortLabel: string, readonly check: (value: string) => boolean, readonly constants: readonly string[], readonly color: boolean }} Type
 * @returns {Type}
 */
const parseValidator = (/** @type {string} */source) => {
    /** @type {(x: { readonly label: string, check: Type["check"] } & Partial<Type>) => Type} */
    const makeType = (x) => ({ constants: [], color: false, shortLabel: x.label, ...x })

    /** case insensitive. All values must be lowercase. */
    const makeEnum = (/** @type {string[]} */values, /** @type {boolean} */caseSensitive) => {
        const valuesForCheck = caseSensitive ? values : values.map((v) => v.toLowerCase())
        return makeType({ label: values.map((x) => JSON.stringify(x)).join(" | "), check: (x) => valuesForCheck.includes(caseSensitive ? x : x.toLowerCase()), constants: values })
    }

    const makeList = (/** @type {Type} */child, /** @type {number | null} */len, /** @type {boolean} */allow_stringlist) => {
        const left = (allow_stringlist ? "str | " : "") + "list["
        const right = "]" + (len === null ? '' : ` (len=${len})`)
        return makeType({
            shortLabel: left + child.shortLabel + right,
            label: left + child.label + right,
            check: (x) => allow_stringlist || (len === null || x.split(",").length === len) && (x.trim() === '' || x.split(",").map((v) => v.trim()).every((v) => child.check(v))),
            constants: child.constants,
            color: child.color,
        })
    }

    const orEnum = (/** @type {Type} */base, /** @type {string[]} */values, /** @type {boolean} */caseSensitive) => {
        const valuesForCheck = caseSensitive ? values : values.map((v) => v.toLowerCase())
        return makeType({
            shortLabel: `${values.map((v) => JSON.stringify(v)).join(" | ")} | ${base.shortLabel}`,
            label: `${values.map((v) => JSON.stringify(v)).join(" | ")} | ${base.label}`,
            check: (x) => base.check(x) || valuesForCheck.includes(caseSensitive ? x : x.toLowerCase()),
            constants: [...base.constants, ...values],
            color: base.color,
        })
    }

    const any = (/** @type {string} */x) => true

    /** @type {RegExpExecArray | null} */
    let matches = null
    if (matches = matchExpr(r`_?validate_(\w+)`, source)) {                 // validate_bool, validate_float, _validate_linestyle, _validate_pathlike, etc.
        const type = matches[1]
        if (type.endsWith("_or_None")) {
            return orEnum(parseValidator(source.slice(0, -"_or_None".length)), ["none"])
        }
        if (type === "fontsize_None") {
            return orEnum(parseValidator(source.slice(0, -"_None".length)), ["none"])
        }
        if (type.endsWith("list")) {
            // key: val1, val2
            return makeList(parseValidator(source.slice(0, -"list".length)), null, false)
        }

        // types
        const boolKeywords = ["t", "y", "yes", "on", "true", "1", "f", "n", "no", "off", "false", "0"]
        switch (type) {
            case "linestyle":
                // https://github.com/matplotlib/matplotlib/blob/b09aad279b5dcfc49dcf43e0b064eee664ddaf68/lib/matplotlib/rcsetup.py#L434-L434
                const values = ["-", "--", "-.", ":", " ", "solid", "dashed", "dashdot", "dotted", "none"]
                return makeType({ shortLabel: type, label: '(offset (int), list["on" | "off"]) | list["on" | "off"] | ' + values.map((v) => JSON.stringify(v)).join(" | "), constants: values, check: (x) => true })
            case "dpi":
                // https://github.com/matplotlib/matplotlib/blob/b09aad279b5dcfvc49dcf43e0b064eee664ddaf68/lib/matplotlib/rcsetup.py#L163-L163
                return makeType({ label: `int | "figure"`, check: (x) => x === "figure" || typeof json5Parse(x) === "number", constants: ["figure"] })
            case "fontsize":
                // https://github.com/matplotlib/matplotlib/blob/b09aad279b5dcfc49dcf43e0b064eee664ddaf68/lib/matplotlib/rcsetup.py#L360-L360
                return orEnum(parseValidator("validate_float"), ['xx-small', 'x-small', 'small', 'medium', 'large', 'x-large', 'xx-large', 'smaller', 'larger'], true)
            case "fontweight":
                // https://github.com/matplotlib/matplotlib/blob/b09aad279b5dcfc49dcf43e0b064eee664ddaf68/lib/matplotlib/rcsetup.py#L378-L378
                return orEnum(parseValidator("validate_float"), ['ultralight', 'light', 'normal', 'regular', 'book', 'medium', 'roman', 'semibold', 'demibold', 'demi', 'bold', 'heavy', 'extra bold', 'black'], true)
            case "bbox":
                // https://github.com/matplotlib/matplotlib/blob/b09aad279b5dcfc49dcf43e0b064eee664ddaf68/lib/matplotlib/rcsetup.py#L519-L519
                return makeEnum(["tight", "standard"], true)
            case "float":
                return makeType({ label: "float", check: (x) => typeof json5Parse(x) === "number" })
            case "int": {
                return makeType({ label: "int", check: (x) => { x = json5Parse(x); return typeof x === "number" && Number.isInteger(x) } })
            } case "bool":
                // https://github.com/matplotlib/matplotlib/blob/3a265b33fdba148bb340e743667c4ba816ced928/lib/matplotlib/rcsetup.py#L142-L142
                return makeType({ label: "bool", check: (x) => boolKeywords.includes(x.toLowerCase()), constants: boolKeywords })
            case "string":
                return makeType({ label: `str`, check: any })
            case "any":
                return makeType({ label: `any`, check: any })
            case "dash":
                // https://github.com/matplotlib/matplotlib/blob/b09aad279b5dcfc49dcf43e0b064eee664ddaf68/lib/matplotlib/rcsetup.py#L582-L582
                return parseValidator(`validate_floatlist`)
            case "hatch": {
                // https://github.com/matplotlib/matplotlib/blob/b09aad279b5dcfc49dcf43e0b064eee664ddaf68/lib/matplotlib/rcsetup.py#L566-L566
                return makeType({ label: String.raw`/[\\/|\-+*.xoO]*/`, check: (x) => x === "" || /[\\/|\-+*.xoO]*/.test(x) })
            } case "cmap":
                // https://github.com/matplotlib/matplotlib/blob/b09aad279b5dcfc49dcf43e0b064eee664ddaf68/lib/matplotlib/rcsetup.py#L339-L339
                return makeType({ label: type, check: any })
            case "fonttype":
                // https://github.com/matplotlib/matplotlib/blob/b09aad279b5dcfc49dcf43e0b064eee664ddaf68/lib/matplotlib/rcsetup.py#L224-L224
                return makeType({ label: type, check: any })
            case "pathlike":
                return makeType({ label: type, check: any })
            case "aspect":
                // https://github.com/matplotlib/matplotlib/blob/b09aad279b5dcfc49dcf43e0b064eee664ddaf68/lib/matplotlib/rcsetup.py#L344-L344
                return orEnum(parseValidator("validate_float"), ["auto", "equal"], true)
            case "axisbelow":
                // https://github.com/matplotlib/matplotlib/blob/b09aad279b5dcfc49dcf43e0b064eee664ddaf68/lib/matplotlib/rcsetup.py#L152
                return orEnum(parseValidator("validate_bool"), ["line"], true)
            case "color":
                // https://github.com/matplotlib/matplotlib/blob/b09aad279b5dcfc49dcf43e0b064eee664ddaf68/lib/matplotlib/rcsetup.py#L312-L312
                return makeType({ label: `color | "C0"-"C9"`, check: any, color: true })
            case "color_or_auto":
                // https://github.com/matplotlib/matplotlib/blob/b09aad279b5dcfc49dcf43e0b064eee664ddaf68/lib/matplotlib/rcsetup.py#L277-L277
                return makeType({ label: `color | "C0"-"C9" | "auto"`, check: any, constants: ["auto"], color: true })
            case "color_for_prop_cycle":
                // https://github.com/matplotlib/matplotlib/blob/b09aad279b5dcfc49dcf43e0b064eee664ddaf68/lib/matplotlib/rcsetup.py#L282-L282
                return makeType({ label: 'color', check: any, color: true })
            case "color_or_inherit":
                // https://github.com/matplotlib/matplotlib/blob/b09aad279b5dcfc49dcf43e0b064eee664ddaf68/lib/matplotlib/rcsetup.py#L269-L269
                return makeType({ label: `color | "C0"-"C9" | "inherit"`, check: any, constants: ["inherit"], color: true })
            case "color_or_linecolor":
                // https://github.com/matplotlib/matplotlib/blob/b09aad279b5dcfc49dcf43e0b064eee664ddaf68/lib/matplotlib/rcsetup.py#L289-L289
                return makeType({ label: `color | "linecolor" | "markerfacecolor" | "markeredgecolor"`, check: any, constants: ["linecolor", "markerfacecolor", "markeredgecolor"], color: true })
            case "cycler":
                // https://github.com/matplotlib/matplotlib/blob/b09aad279b5dcfc49dcf43e0b064eee664ddaf68/lib/matplotlib/rcsetup.py#L704-L704
                return makeType({ label: `cycler`, check: any })
            case "whiskers":
                // https://github.com/matplotlib/matplotlib/blob/b09aad279b5dcfc49dcf43e0b064eee664ddaf68/lib/matplotlib/rcsetup.py#L411-L411
                return makeType({ shortLabel: type, label: `list[float] (len=2) | float`, check: (x) => x.split(',').length === 2 && x.split(',').map((v) => v.trim()).every((v) => typeof json5Parse(v) === "number") || typeof json5Parse(x) === "number" })
            case "fillstyle": {
                // https://github.com/matplotlib/matplotlib/blob/b09aad279b5dcfc49dcf43e0b064eee664ddaf68/lib/matplotlib/rcsetup.py#L475-L475
                return { ...makeEnum(["full", "left", "right", "bottom", "top", "none"]), shortLabel: type }
            } case "sketch":
                // https://github.com/matplotlib/matplotlib/blob/b09aad279b5dcfc49dcf43e0b064eee664ddaf68/lib/matplotlib/rcsetup.py#L534-L534
                return makeType({ shortLabel: type, label: `list[float] (len=3) | "none"`, check: (x) => x.toLowerCase() === "none" || x.split(",").length === 3 && x.split(",").map((v) => v.trim()).every((v) => typeof json5Parse(v) === "number") })
            case "hist_bins": {
                // https://github.com/matplotlib/matplotlib/blob/b09aad279b5dcfc49dcf43e0b064eee664ddaf68/lib/matplotlib/rcsetup.py#L766-L766
                const values = ["auto", "sturges", "fd", "doane", "scott", "rice", "sqrt"]
                return makeType({ shortLabel: type, label: "int | list[float] | " + values.map((v) => JSON.stringify(v)).join(" | "), check: (x) => values.includes(x) || x === "" || x.split(",").map((v) => v.trim()).every((v) => typeof json5Parse(v) === "number") || typeof json5Parse(x) === "number" })
            } default:
                // unimplemented
                return makeType({ label: `${type} (any)`, check: any })
        }
    } else if (matchExpr(r`_range_validators\["0 <= x <= 1"\]`, source)) { // _range_validators["0 <= x <= 1"]
        return makeType({
            label: "float (0 <= x <= 1)",
            check: (x) => {
                x = json5Parse(x)
                return typeof x === "number" && 0 <= x && x <= 1
            },
        })
    } else if (matchExpr(r`_range_validators\["0 <= x < 1"\]`, source)) {  // _range_validators["0 <= x < 1"]
        return makeType({
            label: "float (0 <= x < 1)",
            check: (x) => {
                x = json5Parse(x)
                return typeof x === "number" && 0 <= x && x < 1
            },
        })
    } else if (matchExpr(r`JoinStyle`, source)) { // JoinStyle
        // https://github.com/matplotlib/matplotlib/blob/b09aad279b5dcfc49dcf43e0b064eee664ddaf68/lib/matplotlib/_enums.py#L82-L82
        return makeEnum(["miter", "round", "bevel"])
    } else if (matchExpr(r`CapStyle`, source)) {
        // https://github.com/matplotlib/matplotlib/blob/b09aad279b5colordcfc49dcf43e0b064eee664ddaf68/lib/matplotlib/_enums.py#L151-L151
        return makeEnum(["butt", "projecting", "round"])
    } else if (matches = matchExpr(r`(\[\s*(?:"[^"]*"|'[^']*')\s*(?:,\s*(?:"[^"]*"|'[^']*')\s*)*\])\s*`, source)) { // ["foo", "bar"]
        try {
            const values = json5.parse(matches[1])
            if (Array.isArray(values) && values.every((v) => typeof v === "string")) {
                return makeEnum(values)
            } else {
                return makeType({ label: `${source} (any)`, check: any })
            }
        } catch (err) {
            console.log(`Parse error: ${matches[1]}`)
            return makeType({ label: `${source} (any)`, check: any })
        }
    } else if (matches = matchExpr(r`_listify_validator\(([^\)]+?)(?:,\s*n=(\d+)\s*)?(?:,\s*allow_stringlist=(True|False)\s*)?\)`, source)) { // _listify_validator(validate_int, n=2)
        const len = /** @type {string | undefined} */(matches[2])
        return makeList(parseValidator(matches[1]), len === undefined ? null : +len, matches[3] === "True")
    } else if (matches = matchExpr(r`_ignorecase\(([^\)]+)\)`, source)) {
        return parseValidator(matches[1])
    } else {
        return makeType({ label: `${source} (any)`, check: any })
    }
}

if (testing) {
    const { assert: { strictEqual } } = require("chai")

    describe('parseValidator', () => {
        describe("type checking", () => {
            it("1, 2.3, 4: validate_floatlist", () => { strictEqual(parseValidator("validate_floatlist").check("1, 2.3, 4"), true) })
            it("         : validate_floatlist", () => { strictEqual(parseValidator("validate_floatlist").check(""), true) })
            it("a, b     : validate_floatlist", () => { strictEqual(parseValidator("validate_floatlist").check("a, b"), false) })
            it("a        : validate_floatlist", () => { strictEqual(parseValidator("validate_floatlist").check("a"), false) })

            it("a : ['a', 'bc']", () => { strictEqual(parseValidator("['a', 'bc']").check("a"), true) })
            it("bc: ['a', 'bc']", () => { strictEqual(parseValidator("['a', 'bc']").check("bc"), true) })
            it("  : ['a', 'bc']", () => { strictEqual(parseValidator("['a', 'bc']").check(""), false) })
            it("b : ['a', 'bc']", () => { strictEqual(parseValidator("['a', 'bc']").check("b"), false) })

            it("none: validate_float_or_None", () => { strictEqual(parseValidator("validate_float_or_None").check("none"), true) })
            it("None: validate_float_or_None", () => { strictEqual(parseValidator("validate_float_or_None").check("None"), true) })
            it("2.5 : validate_float_or_None", () => { strictEqual(parseValidator("validate_float_or_None").check("2.5"), true) })
            it("    : validate_float_or_None", () => { strictEqual(parseValidator("validate_float_or_None").check(""), false) })
            it("aa  : validate_float_or_None", () => { strictEqual(parseValidator("validate_float_or_None").check("aa"), false) })

            it("20  : validate_int", () => { strictEqual(parseValidator("validate_int").check("20"), true) })
            it("-100: validate_int", () => { strictEqual(parseValidator("validate_int").check("-100"), true) })
            it("0   : validate_int", () => { strictEqual(parseValidator("validate_int").check("0"), true) })
            it("20.5: validate_int", () => { strictEqual(parseValidator("validate_int").check("20.5"), false) })
            it("a   : validate_int", () => { strictEqual(parseValidator("validate_int").check("a"), false) })
            it("    : validate_int", () => { strictEqual(parseValidator("validate_int").check(""), false) })

            it(`0  : _range_validators["0 <= x <= 1"]`, () => { strictEqual(parseValidator(`_range_validators["0 <= x <= 1"]`).check("0"), true) })
            it(`0.5: _range_validators["0 <= x <= 1"]`, () => { strictEqual(parseValidator(`_range_validators["0 <= x <= 1"]`).check("0.5"), true) })
            it(`1  : _range_validators["0 <= x <= 1"]`, () => { strictEqual(parseValidator(`_range_validators["0 <= x <= 1"]`).check("1"), true) })
            it(`a  : _range_validators["0 <= x <= 1"]`, () => { strictEqual(parseValidator(`_range_validators["0 <= x <= 1"]`).check("a"), false) })
            it(`   : _range_validators["0 <= x <= 1"]`, () => { strictEqual(parseValidator(`_range_validators["0 <= x <= 1"]`).check(""), false) })

            it(`0  : _range_validators["0 <= x < 1"]`, () => { strictEqual(parseValidator(`_range_validators["0 <= x < 1"]`).check("0"), true) })
            it(`0.5: _range_validators["0 <= x < 1"]`, () => { strictEqual(parseValidator(`_range_validators["0 <= x < 1"]`).check("0.5"), true) })
            it(`1  : _range_validators["0 <= x < 1"]`, () => { strictEqual(parseValidator(`_range_validators["0 <= x < 1"]`).check("1"), false) })
            it(`a  : _range_validators["0 <= x < 1"]`, () => { strictEqual(parseValidator(`_range_validators["0 <= x < 1"]`).check("a"), false) })
            it(`   : _range_validators["0 <= x < 1"]`, () => { strictEqual(parseValidator(`_range_validators["0 <= x < 1"]`).check(""), false) })
        })
        describe("color", () => {
            it("validate_float", () => { strictEqual(parseValidator("validate_float").color, false) })
            it(`_range_validators["0 <= x < 1"]`, () => { strictEqual(parseValidator(`_range_validators["0 <= x < 1"]`).color, false) })
            it("validate_color", () => { strictEqual(parseValidator("validate_color").color, true) })
            it("validate_color_or_auto", () => { strictEqual(parseValidator("validate_color_or_auto").color, true) })
        })
        describe("label", () => {
            it("enum", () => { strictEqual(parseValidator(`["a", "bc"]`).label, `"a" | "bc"`) })
            it("str", () => { strictEqual(parseValidator("validate_string").label, `str`) })
            it("int", () => { strictEqual(parseValidator("validate_int").label, `int`) })
            it("range", () => { strictEqual(parseValidator(`_range_validators["0 <= x <= 1"]`).label, `float (0 <= x <= 1)`) })
            it("floatlist", () => { strictEqual(parseValidator("validate_floatlist").label, `list[float]`) })
            it("unknown", () => { strictEqual(parseValidator("validate_undefinedtype").label, `undefinedtype (any)`) })
            it("any", () => { strictEqual(parseValidator("validate_foo").label, `foo (any)`) })
            it("untyped", () => { strictEqual(parseValidator("foo").label, `foo (any)`) })
            it("fixed length list", () => { strictEqual(parseValidator(`_listify_validator(validate_int, n=3)`).label, `list[int] (len=3)`) })
            it("allow_stringlists", () => { strictEqual(parseValidator(`_listify_validator(validate_int, allow_stringlist=True)`).label, `str | list[int]`) })
        })
    })
}

/** @type {<Path extends { toString(): string }>(extensionPath: Path, matplotlibPath: Path | undefined, joinPaths: (a: Path, b: string) => Path, readFile: (path: Path) => Promise<string>) => Promise<{ params: Map<string, Type>, cyclerProps: Map<string, Type>, documentation: Map<string, { exampleValue: string; comment: string }>, errors: string[] }>} */
const parseMplSource = async (extensionPath, matplotlibPath, joinPaths, readFile) => {
    // Read and parse matplotlib/rcsetup.py
    const useDefaultPath = !matplotlibPath
    const matplotlibDirectory = useDefaultPath ? joinPaths(extensionPath, "matplotlib") : matplotlibPath

    /** @type {string[]} */
    const errors = []

    /** @returns {Promise<string>} */
    const readMatplotlibFile = async (/** @type {string[]} */filepaths) => {
        for (const filepath of filepaths) {
            try {
                return await readFile(joinPaths(matplotlibDirectory, filepath))
            } catch (err) {
                if (isNOENT(err)) {
                    continue
                }
                console.error(filepath)
                console.error(err)
                errors.push(`${err}`)
                return ""
            }
        }
        errors.push(`${filepaths.length >= 2 ? "neither of " : ""}"${filepaths.map((v) => joinPaths(matplotlibDirectory, v).toString()).join(" nor ")}" does not exist. ${useDefaultPath ? "Please reinstall the extension" : 'Please delete or modify the value of "mplstyle.matplotlibPath" in the settings'}.`)
        return ""
    }

    const withPrefix = (/** @type {string} */x) => [`lib/matplotlib/` + x, x]
    const rcsetup = await readMatplotlibFile(withPrefix("rcsetup.py"))

    const validators = parseDict(rcsetup, '_validators')
    errors.push(...validators[1].map((v) => `Error during parsing rcsetup.py: ${v}`))
    const propValidators = parseDict(rcsetup, '_prop_validators')
    errors.push(...propValidators[1].map((v) => `Error during parsing rcsetup.py: ${v}`))

    // dirty fix
    for (const item of validators[0]) {
        if (item.key === "ps.papersize") {
            // https://github.com/matplotlib/matplotlib/blob/b09aad279b5dcfc49dcf43e0b064eee664ddaf68/lib/matplotlib/rcsetup.py#L1156-L1156
            item.value = JSON.stringify(["auto", "letter", "legal", "ledger", ...Array(11).fill(0).map((_, i) => [`a${i}`, `b${i}`]).flat()])
        }
    }

    return {
        params: new Map(validators[0].map(({ key, value }) => [key, parseValidator(value)])),
        cyclerProps: new Map(propValidators[0].map(({ key, value }) => [key, parseValidator(value)])),
        documentation: parseMatplotlibrc(await readMatplotlibFile(withPrefix("mpl-data/matplotlibrc"))),
        errors,
    }
}
module.exports = parseMplSource

if (testing) {
    const { assert: { deepStrictEqual, include, strictEqual, fail } } = require("chai")
    const { spawnSync } = require("child_process")
    const fs = require("fs").promises
    const path = require("path")
    const readFile = async (/** @type {string} */ filepath) => fs.readFile(filepath).then((v) => v.toString())

    describe("parseMplSource", () => {
        /** @type {Awaited<ReturnType<typeof parseMplSource>>} */
        let data
        before(async () => {
            data = await parseMplSource(path.join(__dirname, ".."), undefined, (a, b) => path.join(a, b), readFile)
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
                const { documentation, params: signatures, errors } = await parseMplSource('err', path.join(matches[1], "matplotlib"), (a, b) => path.join(a, b), readFile)
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
            include((await parseMplSource(/** @type {string} */(""), undefined, (a, b) => path.join(a, b), readFile)).errors[0], 'does not exist')
        })
    })
}
