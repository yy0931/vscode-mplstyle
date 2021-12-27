const { assert: { deepStrictEqual } } = require("chai")
const fs = require("fs")
const path = require("path")
const p = require("./parser")

describe("parseLine", () => {
    it("with a comment", () => {
        deepStrictEqual(p.parseLine("  a:  b  # c"), {
            key: { text: "a", start: 2, end: 3 },
            value: { text: "b", start: 6, end: 7 },
            commentStart: 9,
        })
    })
    it("without comments", () => {
        deepStrictEqual(p.parseLine("  a:  b"), {
            key: { text: "a", start: 2, end: 3 },
            value: { text: "b", start: 6, end: 7 },
            commentStart: null,
        })
    })
    it('comment line', () => {
        deepStrictEqual(p.parseLine("#### MATPLOTLIBRC FORMAT"), null)
    })
    it("empty line", () => {
        deepStrictEqual(p.parseLine(" "), null)
    })
    it("without a value", () => {
        deepStrictEqual(p.parseLine("key"), {
            key: { text: "key", start: 0, end: 3 },
            value: null,
            commentStart: null,
        })
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
