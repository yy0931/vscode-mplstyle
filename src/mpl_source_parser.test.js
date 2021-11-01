const mplSourceParser = require("./mpl_source_parser")
const fs = require("fs")
const { assert: { deepStrictEqual, include, fail } } = require("chai")
const path = require("path")
const { spawnSync } = require("child_process")

describe("parseDict", () => {
    it("key-value pairs", () => {
        deepStrictEqual(mplSourceParser.parseDict(`
dict_name = {
    "key1": value1,
    "key2": value2
}
`, 'dict_name'), [{ key: "key1", value: "value1" }, { key: "key2", value: "value2" }])
    })
    it("ignore comments", () => {
        deepStrictEqual(mplSourceParser.parseDict(`
dict_name = {
    "key1": value1,  # comment
}
`, 'dict_name'), [{ key: "key1", value: "value1" }])
    })
    it("ignore whitespace around last comma", () => {
        deepStrictEqual(mplSourceParser.parseDict(`
dict_name = {
    "key1": value1  ,  # comment
}
`, 'dict_name'), [{ key: "key1", value: "value1" }])
    })
    it("multi-line list literals", () => {
        deepStrictEqual(mplSourceParser.parseDict(`
dict_name = {
    "key1": [  # comment
        "a",   # comment
        "b"    # comment
    ],         # comment
}
`, 'dict_name'), [{ key: "key1", value: `["a","b"]` }])
    })
    it("function calls", () => {
        deepStrictEqual(mplSourceParser.parseDict(`
dict_name = {
    "key1": func("a", "b") # comment
}
`, 'dict_name'), [{ key: "key1", value: `func("a", "b")` }])
    })
    it("multi-line function calls", () => {
        deepStrictEqual(mplSourceParser.parseDict(`
dict_name = {
    "key1": func(  # comment
        "a",   # comment
        "b"    # comment
    ),         # comment
}
`, 'dict_name'), [{ key: "key1", value: `func("a","b")` }])
    })
})

describe("parse _validators", () => {
    const signatures = mplSourceParser.parseValidators(fs.readFileSync("./matplotlib/lib/matplotlib/rcsetup.py").toString())

    it("backend", () => {
        deepStrictEqual(signatures.get("backend"), { kind: "validate_", type: "backend" })
    })
    it("lines.dashed_pattern", () => {
        deepStrictEqual(signatures.get("lines.dashed_pattern"), { kind: "validate_", type: "floatlist" })
    })
    it("lines.linestyle", () => {
        deepStrictEqual(signatures.get("lines.linestyle"), { kind: "validate_", type: "linestyle" })
    })
    it("mathtext.fontset", () => {
        deepStrictEqual(signatures.get("mathtext.fontset"), { kind: "enum", values: ["dejavusans", "dejavuserif", "cm", "stix", "stixsans", "custom"] })
    })
    it("image.origin", () => {
        deepStrictEqual(signatures.get("image.origin"), { kind: "enum", values: ["upper", "lower"] })
    })
    it("axes.xmargin", () => {
        deepStrictEqual(signatures.get("axes.xmargin"), { kind: "0 <= x <= 1" })
    })
    it("figure.subplot.wspace", () => {
        deepStrictEqual(signatures.get("figure.subplot.wspace"), { kind: "0 <= x < 1" })
    })
    it("axes.formatter.limits", () => {
        deepStrictEqual(signatures.get("axes.formatter.limits"), { kind: "list", len: 2, allow_stringlist: false, child: { kind: "validate_", type: "int" } })
    })
})

it("parse _prop_validators", () => {
    const props = mplSourceParser.parsePropValidators(fs.readFileSync("./matplotlib/lib/matplotlib/rcsetup.py").toString())
    deepStrictEqual(props.get('color'), { kind: "list", len: null, allow_stringlist: true, child: { kind: "validate_", type: "color_for_prop_cycle" } })
    deepStrictEqual(props.get('linewidth'), { kind: "validate_", type: "floatlist" })
})

describe("parse matplotlibrc", () => {
    it("multi-line comments", () => {
        deepStrictEqual(mplSourceParser.parseMatplotlibrc(`\
# a
key1: value1 # key1-comment1
             # key1-comment2
# b
key2: value2 # key2-comment1
`), new Map([
            ['key1', { exampleValue: 'value1', comment: 'key1-comment1\nkey1-comment2' }],
            ['key2', { exampleValue: 'value2', comment: 'key2-comment1' }],
        ]))
    })
    it("axes.axisbelow", () => {
        const documentation = mplSourceParser.parseMatplotlibrc(fs.readFileSync("./matplotlib/lib/matplotlib/mpl-data/matplotlibrc").toString())
        deepStrictEqual(documentation.get("axes.axisbelow"), { exampleValue: "line", comment: `draw axis gridlines and ticks:\n- below patches (True)\n- above patches but below lines ('line')\n- above all (False)` })
    })
})

describe("read all", () => {
    it("default path", () => {
        const { documentation, signatures, errors } = mplSourceParser.readAll(path.join(__dirname, ".."), undefined)

        deepStrictEqual(errors, [])
        include(documentation.get("figure.subplot.right")?.comment, 'the right side of the subplots of the figure')
        deepStrictEqual(signatures.has('font.family'), true)
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
            const { documentation, signatures, errors } = mplSourceParser.readAll('err', path.join(matches[1], "matplotlib"))
            deepStrictEqual(errors, [])
            include(documentation.get("figure.subplot.right")?.comment, 'the right side of the subplots of the figure')
            deepStrictEqual(signatures.has('font.family'), true)
        } catch (err) {
            console.log(`stdout: ${stdout.toString()}`)
            console.log(`stderr: ${stderr.toString()}`)
            throw err
        }
    })
})
