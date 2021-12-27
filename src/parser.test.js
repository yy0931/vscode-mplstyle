const { assert: { deepStrictEqual } } = require("chai")
const fs = require("fs")
const path = require("path")
const p = require("./parser")

describe("parseLine", () => {
    const test = (/** @type {string} */l, /** @type {ReturnType<typeof p.parseLine>} */r) => {
        it(l, () => {
            deepStrictEqual(p.parseLine(l), r)
        })
    }
    test("  a:  b  # c", {
        key: { text: "a", start: 2, end: 3 },
        value: { text: "b", start: 6, end: 7 },
        commentStart: 9,
    })
    test("  a:  b", {
        key: { text: "a", start: 2, end: 3 },
        value: { text: "b", start: 6, end: 7 },
        commentStart: null,
    })
    test("a: # b", {
        key: { text: "a", start: 0, end: 1 },
        value: { text: "", start: 2, end: 2 },
        commentStart: 3,
    })
    test("a:  # b", {
        key: { text: "a", start: 0, end: 1 },
        value: { text: "", start: 2, end: 2 },
        commentStart: 4,
    })
    test("#### MATPLOTLIBRC FORMAT", null)
    test(" ", null)
    test("key", {
        key: { text: "key", start: 0, end: 3 },
        value: null,
        commentStart: null,
    })
})

describe('parseAll', () => {
    it("key-value pairs", () => {
        const { rc, errors } = p.parseAll(`key1: value1 # comment1\n\nkey2: value2 # comment2`)
        deepStrictEqual(errors, [])
        deepStrictEqual(rc.get("key1")?.[0]?.pair.value?.text, "value1")
        deepStrictEqual(rc.get("key2")?.[0]?.pair.value?.text, "value2")
    })
    it("missing colon", () => {
        deepStrictEqual(p.parseAll(`key1 value1`).errors, [{
            error: "Missing colon",
            severity: "Error",
            line: 0,
            columnStart: 0,
            columnEnd: 11,
        }])
    })
    it("duplicate key", () => {
        deepStrictEqual(p.parseAll(`key1: value1\nkey1: value2`).errors, [{
            error: `duplicate key "key1"`,
            severity: "Error",
            line: 1,
            columnStart: 0,
            columnEnd: 4,
        }])
    })
})

describe("findRcParamsInPythonFiles", () => {
    const test = (/** @type {string} */ source, /** @type {ReturnType<typeof p.findRcParamsInPythonFiles>} */ expected) => {
        it(JSON.stringify(source), () => { deepStrictEqual(p.findRcParamsInPythonFiles(source), expected) })
    }
    test("", [])
    test(`aa`, [])
    test(`rcParams`, [])
    test(`mpl.aa`, [])
    test(`mpl.rcParams`, [])

    for (const m of ["", "mpl.", "matplotlib."]) {
        test(`${m}rcParams["`, [{
            index: `${m}rcParams["`.length,
            key: "",
        }])
        test(`${m}rcParams["key`, [{
            index: `${m}rcParams["`.length,
            key: "key",
        }])

        test(`${m}rcParams[""]`, [{
            index: `${m}rcParams["`.length,
            key: "",
        }])
        test(`${m}  rcParams[ "" ]`, [{
            index: `${m}  rcParams[ "`.length,
            key: "",
        }])
        test(`${m}rcParams['key']`, [{
            index: `${m}rcParams['`.length,
            key: "key",
        }])
        test(`${m}rcParams["key"]`, [{
            index: `${m}rcParams['`.length,
            key: "key",
        }])
    }
})

describe("parseColor", () => {
    const colorMap = new Map(Object.entries(/** @type {Record<string, readonly [number, number, number, number]>} */(JSON.parse(fs.readFileSync(path.join(__dirname, "../matplotlib", "color_map.json")).toString()))))
    it("red", () => {
        deepStrictEqual(p.parseColor("red", colorMap), [1, 0, 0, 1])
    })
    it("#00ff00", () => {
        deepStrictEqual(p.parseColor("00ff00", colorMap), [0, 1, 0, 1])
    })
    it("#00ff0000", () => {
        deepStrictEqual(p.parseColor("00ff0000", colorMap), [0, 1, 0, 0])
    })
})
