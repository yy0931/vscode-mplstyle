const fs = require("fs")
const path = require("path")
const p = require("../src/mplstyle-parser")
const { testInputOutput, testInputOutputWithTitle } = require("./helper")

describe("parseLine", () => {
    testInputOutput(p.parseLine)(
        [["  a:  b  # c"], {
            key: { text: "a", start: 2, end: 3 },
            value: { text: "b", start: 6, end: 7 },
            commentStart: 9,
        }],
        [["  a:  b"], {
            key: { text: "a", start: 2, end: 3 },
            value: { text: "b", start: 6, end: 7 },
            commentStart: null,
        }],
        [["a: # b"], {
            key: { text: "a", start: 0, end: 1 },
            value: { text: "", start: 2, end: 2 },
            commentStart: 3,
        }],
        [["a:  # b"], {
            key: { text: "a", start: 0, end: 1 },
            value: { text: "", start: 2, end: 2 },
            commentStart: 4,
        }],
        [["#### MATPLOTLIBRC FORMAT"], null],
        [[" "], null],
        [[":"], {
            key: { text: "", start: 0, end: 0 },
            value: { text: "", start: 1, end: 1 },
            commentStart: null,
        }],
        [["  :  # aa "], {
            key: { text: "", start: 0, end: 0 },
            value: { text: "", start: 3, end: 3 },
            commentStart: 5,
        }],
        [["key"], {
            key: { text: "key", start: 0, end: 3 },
            value: null,
            commentStart: null,
        }],
        [["key  # comment"], {
            key: { text: "key", start: 0, end: 3 },
            value: null,
            commentStart: 5,
        }],
        [[`a: "b"`], {
            key: { text: "a", start: 0, end: 1 },
            value: { text: "b", start: 4, end: 5 },
            commentStart: null,
        }],
        [[`a: "b #" # c`], {
            key: { text: "a", start: 0, end: 1 },
            value: { text: "b #", start: 4, end: 7 },
            commentStart: 9,
        }],
    )
})

describe('parseAll', () => {
    test("key-value pairs", () => {
        const { rc, errors } = p.parseAll(`key1: value1 # comment1\n\nkey2: value2 # comment2`)
        expect(errors).toEqual([])
        expect(rc.get("key1")?.[0]?.pair.value?.text).toEqual("value1")
        expect(rc.get("key2")?.[0]?.pair.value?.text).toEqual("value2")
    })
    testInputOutputWithTitle((/** @type {string} */input) => p.parseAll(input).errors)({
        "missing colon": [[`key1 value1`], [{
            error: "Missing colon",
            severity: "Error",
            line: 0,
            columnStart: 0,
            columnEnd: 11,
        }]],
        "duplicate key": [[`key1: value1\nkey1: value2`], [{
            error: `duplicate key "key1"`,
            severity: "Error",
            line: 1,
            columnStart: 0,
            columnEnd: 4,
        }]]
    })
})

describe("findRcParamsInPythonFiles", () => {
    const t = testInputOutput(p.findRcParamsInPythonFiles)
    t(
        [[""], []],
        [[`aa`], []],
        [[`rcParams`], []],
        [[`mpl.aa`], []],
        [[`mpl.rcParams`], []],
    )
    for (const m of ["", "mpl.", "matplotlib."]) {
        t(
            [[`${m}rcParams["`], [{ index: `${m}rcParams["`.length, key: "" }]],
            [[`${m}rcParams["key`], [{ index: `${m}rcParams["`.length, key: "key" }]],
            [[`${m}rcParams[""]`], [{ index: `${m}rcParams["`.length, key: "" }]],
            [[`${m}  rcParams[ "" ]`], [{ index: `${m}  rcParams[ "`.length, key: "" }]],
            [[`${m}rcParams['key']`], [{ index: `${m}rcParams['`.length, key: "key" }]],
            [[`${m}rcParams["key"]`], [{ index: `${m}rcParams['`.length, key: "key" }]],
        )
    }
})

describe("parseColor", () => {
    const colorMap = new Map(Object.entries(/** @type {Record<string, readonly [number, number, number, number]>} */(JSON.parse(fs.readFileSync(path.join(__dirname, "../matplotlib", "color_map.json")).toString()))))
    testInputOutput((/** @type {string} */input) => p.parseColor(input, colorMap))(
        [["red"], [1, 0, 0, 1]],
        [["00ff00"], [0, 1, 0, 1]],
        [["#00ff00"], [0, 1, 0, 1]],
        [["00ff00ff"], [0, 1, 0, 1]],
        [["#00ff00ff"], [0, 1, 0, 1]],
    )
})
