const parseMplSource = require("../src/mpl_source_parser")
const parseMplstyle = require("../src/mplstyle_parser")
const fs = require("fs")
const { expect } = require("chai")

describe("parseMplSource", () => {
    describe("rcsetupPy", () => {
        const signatures = parseMplSource.rcsetupPy(fs.readFileSync("./matplotlib/rcsetup.py").toString())

        it("backend", () => {
            expect(signatures.get("backend")).to.deep.equal({ kind: "validate_", type: "backend" })
        })
        it("lines.dashed_pattern", () => {
            expect(signatures.get("lines.dashed_pattern")).to.deep.equal({ kind: "validate_", type: "floatlist" })
        })
        it("lines.linestyle", () => {
            expect(signatures.get("lines.linestyle")).to.deep.equal({ kind: "validate_", type: "linestyle" })
        })
        it("mathtext.fontset", () => {
            expect(signatures.get("mathtext.fontset")).to.deep.equal({ kind: "enum", values: ["dejavusans", "dejavuserif", "cm", "stix", "stixsans", "custom"] })
        })
        it("image.origin", () => {
            expect(signatures.get("image.origin")).to.deep.equal({ kind: "enum", values: ["upper", "lower"] })
        })
        it("axes.xmargin", () => {
            expect(signatures.get("axes.xmargin")).to.deep.equal({ kind: "0 <= x <= 1" })
        })
        it("figure.subplot.wspace", () => {
            expect(signatures.get("figure.subplot.wspace")).to.deep.equal({ kind: "0 <= x < 1" })
        })
    })
    it("matplotlibrc", () => {
        const documentation = parseMplSource.matplotlibrc(fs.readFileSync("./matplotlib/lib/matplotlib/mpl-data/matplotlibrc").toString())
        expect(documentation.get("axes.axisbelow")).to.deep.equal({ exampleValue: "line", comment: `draw axis gridlines and ticks:\n- below patches (True)\n- above patches but below lines ('line')\n- above all (False)` })
    })
})

describe("parseMplstyle.parseLine", () => {
    it("with a comment", () => {
        expect(parseMplstyle.parseLine("  a:  b  # c")).to.deep.equal({ key: { text: "a", start: 2, end: 3 }, value: { text: "b", start: 6, end: 7 }, commentStart: 9 })
    })
    it("without comments", () => {
        expect(parseMplstyle.parseLine("  a:  b")).to.deep.equal({ key: { text: "a", start: 2, end: 3 }, value: { text: "b", start: 6, end: 7 }, commentStart: null })
    })
    it('comment line', () => {
        expect(parseMplstyle.parseLine("#### MATPLOTLIBRC FORMAT")).to.deep.equal(null)
    })
})
