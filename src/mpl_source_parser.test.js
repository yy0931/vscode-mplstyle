const mplSourceParser = require("./mpl_source_parser")
const fs = require("fs")
const { assert: { deepStrictEqual, include, fail, strictEqual } } = require("chai")
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

describe("parseMatplotlibrc", () => {
    it("multi-line comments", () => {
        deepStrictEqual(Array.from(mplSourceParser.parseMatplotlibrc(`\
#key1: value1 # key1-comment1
              # key1-comment2
#key2: value2 # key2-comment1
`).entries()), [
            ['key1', { exampleValue: 'value1', comment: 'key1-comment1\nkey1-comment2' }],
            ['key2', { exampleValue: 'value2', comment: 'key2-comment1' }],
        ])
    })
    it("subheadings", () => {
        deepStrictEqual(Array.from(mplSourceParser.parseMatplotlibrc(`\
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
        const entries = mplSourceParser.parseMatplotlibrc(`
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
        deepStrictEqual(entries.get("key1"), { exampleValue: "value1", comment: `\
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
        const entries = mplSourceParser.parseMatplotlibrc(`
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

describe("read all", () => {
    it("default path", () => {
        const { documentation, signatures, errors } = mplSourceParser.readAll(path.join(__dirname, ".."), undefined)

        deepStrictEqual(errors, [])
        include(documentation.get("backend")?.exampleValue, "Agg")
        include(documentation.get("figure.subplot.right")?.comment, 'the right side of the subplots of the figure')
        strictEqual(signatures.has('font.family'), true)
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
            strictEqual(signatures.has('font.family'), true)
        } catch (err) {
            console.log(`stdout: ${stdout.toString()}`)
            console.log(`stderr: ${stderr.toString()}`)
            throw err
        }
    })
})
