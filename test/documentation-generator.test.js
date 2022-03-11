const documentationGenerator = require("../src/documentation-generator")
const { testInputOutputWithTitle } = require("./helper")

describe("documentationGenerator.key", () => {
    const detail = {
        plaintext: 'foo.bar: string',
        md: `\
\`\`\`python
foo.bar: string
\`\`\`
`
    }
    testInputOutputWithTitle((/** @type {boolean} */showImage) => documentationGenerator.key("foo.bar", {
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

describe("documentationGenerator.cycler", () => {
    testInputOutputWithTitle(documentationGenerator.cycler)({
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
