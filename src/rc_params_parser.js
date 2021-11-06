const testing = typeof globalThis.it === 'function' && typeof globalThis.describe === 'function'

const pattern = /(?<=(?:matplotlib\.|mpl\.|matplotlib\.pyplot\.|plt\.|[^.]|^)\s*rcParams\s*\[\s*['"])(?<key>[^'"]*)/g

/** @returns {{ index: number, key: string }[]} */
const findRcParams = (/** @type {string} */source) => {
    /** @type {{ index: number, key: string }[]} */
    const result = []
    for (const matches of source.matchAll(pattern)) {
        if (matches.index !== undefined && matches.groups?.key !== undefined) {
            result.push({ index: matches.index, key: matches.groups.key })
        }
    }
    return result
}

exports.findRcParams = findRcParams

if (testing) {
    const { assert: { deepStrictEqual } } = require("chai")

    describe("rcParamsParser.parseLine", () => {
        const test = (/** @type {string} */ source, /** @type {ReturnType<typeof findRcParams>} */ expected) => {
            it(JSON.stringify(source), () => { deepStrictEqual(findRcParams(source), expected) })
        }
        test("", [])
        for (const moduleName of ["", "mpl.", "matplotlib."]) {
            test(`${moduleName}aa`, [])
            test(`${moduleName}rcParams`, [])

            test(`${moduleName}rcParams["`, [{ index: `${moduleName}rcParams["`.length, key: "" }])
            test(`${moduleName}rcParams["key`, [{ index: `${moduleName}rcParams["`.length, key: "key" }])

            test(`${moduleName}rcParams[""]`, [{ index: `${moduleName}rcParams["`.length, key: "" }])
            test(`${moduleName}  rcParams[ "" ]`, [{ index: `${moduleName}  rcParams[ "`.length, key: "" }])
            test(`${moduleName}rcParams['key']`, [{ index: `${moduleName}rcParams['`.length, key: "key" }])
            test(`${moduleName}rcParams["key"]`, [{ index: `${moduleName}rcParams['`.length, key: "key" }])
        }
    })
}
