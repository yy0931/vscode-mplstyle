jest.mock("vscode", () => ({}), { virtual: true })

import path from "path"
import fs from "fs"
import { _testing } from "../src/extension"
const { formatLine, toHex, generateDocumentationForKey, generateDocumentationForCycler, findDocumentColorRanges } = _testing
import { parseLine } from "../src/mplstyle-parser"
import { testInputOutput, testInputOutputWithTitle } from "./helper"
import { Type } from "../src/rcsetup-parser"

describe("formatLine", () => {
    testInputOutput(formatLine)(
        [["a: b"], []],
        [["a: b  # aa"], []],
        [["a:  # aa"], []],
        [["a:  #   aa"], []],
        [["a:# aa"], []],
        [["a:  b"], [{ edit: "replace", start: 1, end: 4, replacement: ": " }]],
        [["a:  b  # foo"], [{ edit: "replace", start: 1, end: 4, replacement: ": " }]],
        [["  a  :  b  # foo"], [
            { edit: "delete", start: 0, end: 2 },
            { edit: "replace", start: 3, end: 8, replacement: ": " },
        ]],
    )
})

describe("toHex", () => {
    testInputOutput(toHex)(
        [[[0, 0, 0, 1]], "000000"],
        [[[1, 1, 1, 1]], "FFFFFF"],
        [[[1, 0, 0, 1]], "FF0000"],
        [[[1, 0, 0, 0.5]], "FF00007F"],
    )
})

describe("generateDocumentationForKey", () => {
    const detail = {
        plaintext: 'foo.bar: string',
        md: `\
\`\`\`python
foo.bar: string
\`\`\`
`
    }
    testInputOutputWithTitle((showImage: boolean) => generateDocumentationForKey("foo.bar", {
        images: new Map([["foo.bar", "image-uri"]]),
        showImage,
        mpl: {
            params: new Map([
                ["foo.bar", { label: "string", shortLabel: "string", check: () => true, color: false, constants: [] }],
            ]),
            documentation: new Map([
                ["foo.bar", { exampleValue: "example", comment: "comment" }],
            ]),
        }
    }))({
        "showImage: true": [[true], {
            detail,
            documentation: `\
![foo.bar](image-uri|height=150)

---
comment

---
#### Example
\`\`\`mplstyle
foo.bar: example
\`\`\`
`,
        }],
        "showImage: false": [[false], {
            detail,
            documentation: `\
comment

---
#### Example
\`\`\`mplstyle
foo.bar: example
\`\`\`
`
        }]
    })
})

describe("generateDocumentationForCycler", () => {
    testInputOutputWithTitle(generateDocumentationForCycler)({
        case1: [[{
            cyclerProps: new Map([
                ["prop1", { label: "string", shortLabel: "string", check: () => true, color: false, constants: [] }],
                ["prop2", { label: "string", shortLabel: "string", check: () => true, color: false, constants: [] }],
            ])
        }], {
            detail: {
                form2: { param1: 'label: "prop1" | "prop2"', param2: 'values: list' },
                form3: { kwargs: ["prop1: string", "prop2: string"] },
            },
            documentation: 'Creates a `cycler.Cycler` which cycles over one or more colors simultaneously.',
        }],
    })
})

describe("findDocumentColorRanges", () => {
    const colors = `
text.color: {red}
text.color: {tab:red}
text.color: {xkcd:red}
text.color: {xkcd:red brown}
text.color: {xkcd:fire engine red}
text.color: "{red}"
text.color: "{tab:red}"
text.color: "{xkcd:fire engine red}"
text.color: {0.40}
text.color: {123456}
text.color: {12345678}
text.color: "{0.40}"
text.color: "{123456}"
text.color: "{#123456}"
text.color: "{#12345678}"
axes.prop_cycle: cycler(color=["{red}", "{tab:red}", "{xkcd:red brown}"])
axes.prop_cycle: cycler(color=['{red}', '{tab:red}', '{xkcd:red brown}'])
axes.prop_cycle: cycler(color=["{0.4}", "{123456}", "{12345678}", "{#123456}", "{#12345678}"])
axes.prop_cycle: cycler(color=['{0.4}', '{123456}', '{12345678}'])
`
    const colorMap = new Map(Object.entries(JSON.parse(fs.readFileSync(path.join(__dirname, "../matplotlib", "color_map.json")).toString()) as Record<string, readonly [number, number, number, number]>))
    const params = new Map<string, Type>([
        ["text.color", { color: true, check: (_) => true, constants: [], label: "color", shortLabel: "color" }],
        ["axes.prop_cycle", { color: false, check: (_) => true, constants: [], label: "cycler", shortLabel: "cycler" }],
    ])
    for (const line of colors.trim().split("\n")) {
        const input = line.replace(/[{}]/g, "")
        test(input, () => {
            const pair = parseLine(input)
            if (pair === null) { throw new Error(`Parse error: ${input}`) }
            expect(findDocumentColorRanges({ params }, colorMap, pair).map(([start, end, _color]) => input.slice(start, end)))
                .toEqual(Array.from(line.matchAll(/\{([^}]*)\}/g), (m) => m[1]))  // Extract substrings between { and }
        })
    }
})
