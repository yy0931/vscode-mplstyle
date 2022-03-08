const fs = require("fs")
const path = require("path")
const p = require("../src/parser")

describe("parseLine", () => {
    const testParseLine = (/** @type {string} */l, /** @type {ReturnType<typeof p.parseLine>} */r) =>
        test(l, () => { expect(p.parseLine(l)).toEqual(r) })
    testParseLine("  a:  b  # c", {
        key: { text: "a", start: 2, end: 3 },
        value: { text: "b", start: 6, end: 7 },
        commentStart: 9,
    })
    testParseLine("  a:  b", {
        key: { text: "a", start: 2, end: 3 },
        value: { text: "b", start: 6, end: 7 },
        commentStart: null,
    })
    testParseLine("a: # b", {
        key: { text: "a", start: 0, end: 1 },
        value: { text: "", start: 2, end: 2 },
        commentStart: 3,
    })
    testParseLine("a:  # b", {
        key: { text: "a", start: 0, end: 1 },
        value: { text: "", start: 2, end: 2 },
        commentStart: 4,
    })
    testParseLine("#### MATPLOTLIBRC FORMAT", null)
    testParseLine(" ", null)
    testParseLine("key", {
        key: { text: "key", start: 0, end: 3 },
        value: null,
        commentStart: null,
    })
})

describe('parseAll', () => {
    test("key-value pairs", () => {
        const { rc, errors } = p.parseAll(`key1: value1 # comment1\n\nkey2: value2 # comment2`)
        expect(errors).toEqual([])
        expect(rc.get("key1")?.[0]?.pair.value?.text).toEqual("value1")
        expect(rc.get("key2")?.[0]?.pair.value?.text).toEqual("value2")
    })
    test("missing colon", () => {
        expect(p.parseAll(`key1 value1`).errors).toEqual([{
            error: "Missing colon",
            severity: "Error",
            line: 0,
            columnStart: 0,
            columnEnd: 11,
        }])
    })
    test("duplicate key", () => {
        expect(p.parseAll(`key1: value1\nkey1: value2`).errors).toEqual([{
            error: `duplicate key "key1"`,
            severity: "Error",
            line: 1,
            columnStart: 0,
            columnEnd: 4,
        }])
    })
})

describe("findRcParamsInPythonFiles", () => {
    const testFindRcParamsInPythonFiles = (/** @type {string} */ source, /** @type {ReturnType<typeof p.findRcParamsInPythonFiles>} */ expected) =>
        test(JSON.stringify(source), () => { expect(p.findRcParamsInPythonFiles(source)).toEqual(expected) })

    testFindRcParamsInPythonFiles("", [])
    testFindRcParamsInPythonFiles(`aa`, [])
    testFindRcParamsInPythonFiles(`rcParams`, [])
    testFindRcParamsInPythonFiles(`mpl.aa`, [])
    testFindRcParamsInPythonFiles(`mpl.rcParams`, [])

    for (const m of ["", "mpl.", "matplotlib."]) {
        testFindRcParamsInPythonFiles(`${m}rcParams["`, [{
            index: `${m}rcParams["`.length,
            key: "",
        }])
        testFindRcParamsInPythonFiles(`${m}rcParams["key`, [{
            index: `${m}rcParams["`.length,
            key: "key",
        }])

        testFindRcParamsInPythonFiles(`${m}rcParams[""]`, [{
            index: `${m}rcParams["`.length,
            key: "",
        }])
        testFindRcParamsInPythonFiles(`${m}  rcParams[ "" ]`, [{
            index: `${m}  rcParams[ "`.length,
            key: "",
        }])
        testFindRcParamsInPythonFiles(`${m}rcParams['key']`, [{
            index: `${m}rcParams['`.length,
            key: "key",
        }])
        testFindRcParamsInPythonFiles(`${m}rcParams["key"]`, [{
            index: `${m}rcParams['`.length,
            key: "key",
        }])
    }
})

describe("parseColor", () => {
    const colorMap = new Map(Object.entries(/** @type {Record<string, readonly [number, number, number, number]>} */(JSON.parse(fs.readFileSync(path.join(__dirname, "../matplotlib", "color_map.json")).toString()))))
    test("red", () => {
        expect(p.parseColor("red", colorMap)).toEqual([1, 0, 0, 1])
    })
    test("#00ff00", () => {
        expect(p.parseColor("00ff00", colorMap)).toEqual([0, 1, 0, 1])
    })
    test("#00ff0000", () => {
        expect(p.parseColor("00ff0000", colorMap)).toEqual([0, 1, 0, 0])
    })
})
