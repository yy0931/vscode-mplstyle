const json5 = require("json5")
const parseMplstyle = require("./mplstyle_parser")
const path = require("path")
const fs = require("fs")
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
 * @returns {[{ readonly key: string, readonly value: string }[], string[]]}
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
            const trimLineComment = /^(.*?)\s*(?:#[^"']*)?$/
            const key = matches[1]
            let value = matches[2].replace(trimLineComment, '$1')
            // Read until the next right bracket if there is a unmatched parenthesis
            for (const [left, right] of [["[", "]"], ["(", ")"]]) {
                if (new RegExp(r`^\w*${escapeRegExp(left)}`).test(value) && !value.includes(right)) {
                    i++
                    for (; i < lines.length; i++) {
                        if (lines[i].includes(right)) {
                            value += lines[i].split(right)[0] + right
                            break
                        } else {
                            value += lines[i].replace(trimLineComment, '$1')
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
            case "cmap":
            case "fonttype":
                // https://github.com/matplotlib/matplotlib/blob/b09aad279b5dcfc49dcf43e0b064eee664ddaf68/lib/matplotlib/rcsetup.py#L224-L224
                return makeType({ label: type, check: any })
            case "pathlike":
                return makeType({ label: type, check: any })
            case "axisbelow":
                // https://github.com/matplotlib/matplotlib/blob/b09aad279b5dcfc49dcf43e0b064eee664ddaf68/lib/matplotlib/rcsetup.py#L152
                return orEnum(parseValidator("validate_bool"), ["line"], true)
            case "color":
                // https://github.com/matplotlib/matplotlib/blob/b09aad279b5dcfc49dcf43e0b064eee664ddaf68/lib/matplotlib/rcsetup.py#L312-L312
                return makeType({ label: `color`, check: any, color: true })
            case "color_or_auto":
                // https://github.com/matplotlib/matplotlib/blob/b09aad279b5dcfc49dcf43e0b064eee664ddaf68/lib/matplotlib/rcsetup.py#L277-L277
                return makeType({ label: `color | "auto"`, check: any, constants: ["auto"], color: true })
            case "color_or_inherit":
                // https://github.com/matplotlib/matplotlib/blob/b09aad279b5dcfc49dcf43e0b064eee664ddaf68/lib/matplotlib/rcsetup.py#L269-L269
                return makeType({ label: `color | "inherit"`, check: any, constants: ["inherit"], color: true })
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

    describe('typing', () => {
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

const parseMatplotlibrc = (/** @type {string} */content) => {
    /** @typedef {[commentStart: string[], subheading: (() => string[]), section: string[]]} LazyComment */
    /** @type {Map<string, { exampleValue: string, comment: LazyComment }>} */
    const entries = new Map()
    /** @type {string | null} */
    let lastKey = null

    /**
     * ```
     * ## **********
     * ## * title  *
     * ## **********
     * ## body
     * ```
     * @type {Map<string, string>}
     */
    /** @type {null | { title: string, body: string }} */
    let sectionHeader = null
    /** @type {null | { title: string, body: string }} */
    let sectionHeaderBuf = null

    /**
     * ```
     * # body1
     * # body2
     * target1: value1
     * target2: value2
     * ```
     * @type {{ body: string[], target: string[] }}
     */
    let subheading = { body: [], target: [] }

    const lines = content.replaceAll("\r", "").split("\n")
    for (let i = 0; i < lines.length; i++) {
        let line = lines[i]

        // Uncomment the line
        if (line.startsWith("#")) { line = line.slice(1) }  // `#webagg.port: 8988`
        if (/^#\w/.test(line)) { line = line.slice(1) }  // `##backend: Agg`

        if (line.startsWith("# *******")) { continue }

        if (sectionHeaderBuf === null) {
            if (line.startsWith("# * ")) {
                sectionHeaderBuf = { title: line.slice("# * ".length, -1).trim(), body: "" }
                subheading = { body: [], target: [] }
            } else {
                // Skip empty lines
                if (line.trim() === "") {
                    subheading = { body: [], target: [] }
                    continue
                }

                // Parse small subheadings
                // ```
                // # comment1
                // # comment2
                // key1: value1
                // key2: value2
                // ```
                if (/^# /.test(line)) {
                    if (subheading.target.length > 0) {
                        subheading = { body: [], target: [] }
                    }
                    subheading.body.push(line.slice("# ".length))
                    continue
                }

                // Parse multi-line floating comments
                // ```
                // key: value  # a
                //             # b
                // ```
                if (/^ +#/.test(line) && lastKey !== null) {
                    const lastItem = entries.get(lastKey)
                    if (lastItem !== undefined) {
                        lastItem.comment[0].push(line.split("#", 2)[1].trimStart())
                    }
                    continue
                }

                if (/^[# ]/.test(line)) {
                    subheading = { body: [], target: [] }
                    continue
                }

                // Parse the line as a key-value pair
                // ```
                // key: value
                // ```
                const pair = parseMplstyle.parseLine(line)
                if (pair === null) { continue }
                if (pair.value === null) {
                    console.log(`Parse error: ${line}`)
                    continue
                }
                /** @type {LazyComment} */
                const comment = [[], () => [], []]
                if (pair.commentStart !== null) {
                    comment[0] = ([line.slice(pair.commentStart + 1).trim()])
                }
                const subheading2 = subheading
                comment[1] = () =>
                    subheading2.body.length === 0
                        ? []
                        : [...subheading2.body, ...(subheading2.target.length <= 1 ? [] : ["", ...subheading2.target.map((v) => `- ${v}`)])]
                subheading.target.push(pair.key.text)
                if (sectionHeader !== null) {
                    comment[2] = [`### ${sectionHeader.title}`, sectionHeader.body]
                }

                entries.set(pair.key.text, {
                    exampleValue: pair.value.text,
                    comment,
                })
                lastKey = pair.key.text
            }
        } else {
            if (line.startsWith("# ")) {
                sectionHeaderBuf.body += `${line.slice("# ".length)}\n`
            } else {
                if (sectionHeaderBuf.body === "") {
                    sectionHeader = null
                } else {
                    sectionHeader = sectionHeaderBuf
                }
                sectionHeaderBuf = null
                i--
            }
        }
    }
    return new Map(Array.from(entries.entries()).map(([k, v]) => [k, {
        exampleValue: v.exampleValue,
        comment: v.comment.map((v) => Array.isArray(v) ? v : v()).filter((v) => v.length > 0).map(/** @returns {string[]} */(v, i) => [...(i === 0 ? [] : ["", "---"]), ...v]).flat().join("\n"),
    }]))
}

if (testing) {
    const { assert: { deepStrictEqual } } = require("chai")

    describe("parseMatplotlibrc", () => {
        it("multi-line comments", () => {
            deepStrictEqual(Array.from(parseMatplotlibrc(`\
#key1: value1 # key1-comment1
              # key1-comment2
#key2: value2 # key2-comment1
`).entries()), [
                ['key1', { exampleValue: 'value1', comment: 'key1-comment1\nkey1-comment2' }],
                ['key2', { exampleValue: 'value2', comment: 'key2-comment1' }],
            ])
        })
        it("subheadings", () => {
            deepStrictEqual(Array.from(parseMatplotlibrc(`\
## a
#key1: value1
#key2: value2

## b
#key3: value3
#key4: value4
`).entries()), [
                ['key1', { exampleValue: 'value1', comment: 'a\n\n- key1\n- key2' }],
                ['key2', { exampleValue: 'value2', comment: 'a\n\n- key1\n- key2' }],
                ['key3', { exampleValue: 'value3', comment: 'b\n\n- key3\n- key4' }],
                ['key4', { exampleValue: 'value4', comment: 'b\n\n- key3\n- key4' }],
            ])
        })
        it("Complex comments 1", () => {
            const entries = parseMatplotlibrc(`
## ***************************************************************************
## * SECTION                                                                 *
## ***************************************************************************
## section body

## subheading1
## subheading2
##key1: value1  # comment1
                # comment2
#key2: value2
`)
            deepStrictEqual(entries.get("key1"), {
                exampleValue: "value1", comment: `\
comment1
comment2

---
subheading1
subheading2

- key1
- key2

---
### SECTION
section body
` })
        })
        it("Complex comments 2", () => {
            const entries = parseMatplotlibrc(`
## ***************************************************************************
## * SECTION                                                                 *
## ***************************************************************************
#key1: value1
## subheading2
#key2: value2
`)
            deepStrictEqual(entries.get("key1"), { exampleValue: "value1", comment: `` })
        })
    })
}

const parseMplSource = (/** @type {string} */extensionPath, /** @type {unknown} */matplotlibPath) => {
    // Read and parse matplotlib/rcsetup.py
    const useDefaultPath = matplotlibPath === undefined || typeof matplotlibPath !== "string" || matplotlibPath === ""
    const matplotlibDirectory = useDefaultPath ? path.join(extensionPath, "matplotlib") : matplotlibPath

    /** @type {string[]} */
    const errors = []

    /** @returns {string} */
    const readMatplotlibFile = (/** @type {string[]} */filepaths) => {
        for (const filepath of filepaths) {
            try {
                return fs.readFileSync(path.join(matplotlibDirectory, filepath)).toString()
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
        errors.push(`mplstyle: ${filepaths.length >= 2 ? "neither of " : ""}"${filepaths.map((v) => path.resolve(path.join(matplotlibDirectory, v))).join(" nor ")}" does not exist. ${useDefaultPath ? "Please reinstall the extension" : 'Please delete or modify the value of "mplstyle.matplotlibPath" in the settings'}.`)
        return ""
    }

    const withPrefix = (/** @type {string} */x) => [path.join(`lib/matplotlib/`, x), x]
    const rcsetup = readMatplotlibFile(withPrefix("rcsetup.py"))

    const validators = parseDict(rcsetup, '_validators')
    errors.push(...validators[1].map((v) => `Error during parsing rcsetup.py: ${v}`))
    const propValidators = parseDict(rcsetup, '_prop_validators')
    errors.push(...propValidators[1].map((v) => `Error during parsing rcsetup.py: ${v}`))
    return {
        params: new Map(validators[0].map(({ key, value }) => [key, parseValidator(value)])),
        cyclerProps: new Map(propValidators[0].map(({ key, value }) => [key, parseValidator(value)])),
        documentation: parseMatplotlibrc(readMatplotlibFile(withPrefix("mpl-data/matplotlibrc"))),
        errors,
    }
}
module.exports = parseMplSource

if (testing) {
    const { assert: { deepStrictEqual, include, strictEqual, fail } } = require("chai")
    const { spawnSync } = require("child_process")

    describe("parseMplSource", () => {
        /** @type {ReturnType<typeof parseMplSource>} */
        let data
        before(() => {
            data = parseMplSource(path.join(__dirname, ".."), undefined)
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

        it("custom path", function () {
            this.timeout(20 * 1000)
            const { status, stdout, stderr } = spawnSync(`pip3 show matplotlib`, { shell: true })
            if (status !== 0) {
                fail(stderr.toString())
            }
            const matches = /Location: (.*)$/m.exec(stdout.toString())
            if (matches === null) {
                fail(stdout.toString())
                return
            }
            try {
                const { documentation, params: signatures, errors } = parseMplSource('err', path.join(matches[1], "matplotlib"))
                deepStrictEqual(errors, [])
                include(documentation.get("figure.subplot.right")?.comment, 'the right side of the subplots of the figure')
                strictEqual(signatures.has('font.family'), true)
            } catch (err) {
                console.log(`stdout: ${stdout.toString()}`)
                console.log(`stderr: ${stderr.toString()}`)
                throw err
            }
        })
        it("NOENT", () => {
            include(parseMplSource("noent").errors[0], 'does not exist')
        })
    })
}
