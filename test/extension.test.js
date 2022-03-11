jest.mock("vscode", () => ({}), { virtual: true })

const { _testing: { formatLine, toHex, generateDocumentationForKey, generateDocumentationForCycler } } = require("../src/extension")
const { testInputOutput, testInputOutputWithTitle } = require("./helper")

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
    testInputOutputWithTitle((/** @type {boolean} */showImage) => generateDocumentationForKey("foo.bar", {
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
