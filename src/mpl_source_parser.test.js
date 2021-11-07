const { assert: { deepStrictEqual, include, strictEqual, fail } } = require("chai")
const { spawnSync } = require("child_process")
const fs = require("fs").promises
const path = require("path")
const readFile = async (/** @type {string} */ filepath) => fs.readFile(filepath).then((v) => v.toString())
const parseMplSource = require("./mpl_source_parser")

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
        include((await parseMplSource(/** @type {string} */("noent"), undefined, (a, b) => path.join(a, b), readFile)).errors[0], 'does not exist')
    })
})
