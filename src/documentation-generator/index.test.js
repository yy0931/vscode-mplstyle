const { assert: { deepStrictEqual } } = require("chai")
const documentationGenerator = require(".")

describe("documentationGenerator.key", () => {
    const images = new Map([["foo.bar", "image-uri"]])

    /** @type {Parameters<typeof documentationGenerator.key>[1]["mpl"]} */
    const mpl = {
        params: new Map([
            ["foo.bar", { label: "string", shortLabel: "string", check: () => true, color: false, constants: [] }],
        ]),
        documentation: new Map([
            ["foo.bar", { exampleValue: "example", comment: "comment" }],
        ]),
    }

    it("showImage: true", () => {
        deepStrictEqual(documentationGenerator.key("foo.bar", { images, showImage: true, mpl }), {
            detail: {
                plaintext: 'foo.bar: string',
                md: `\
\`\`\`python
foo.bar: string
\`\`\`
`
            },
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
        })
    })

    it("showImage: false", () => {
        deepStrictEqual(documentationGenerator.key("foo.bar", { images, showImage: false, mpl })?.documentation, `\
comment

---
#### Example
\`\`\`mplstyle
foo.bar: example
\`\`\`
`)
    })
})

describe("documentationGenerator.cycler", () => {
    it("test", () => {
        deepStrictEqual(documentationGenerator.cycler({
            cyclerProps: new Map([
                ["prop1", { label: "string", shortLabel: "string", check: () => true, color: false, constants: [] }],
                ["prop2", { label: "string", shortLabel: "string", check: () => true, color: false, constants: [] }],
            ])
        }), {
            detail: {
                form2: { param1: 'label: "prop1" | "prop2"', param2: 'values: list' },
                form3: { kwargs: ["prop1: string", "prop2: string"] },
            },
            documentation: 'Creates a `cycler.Cycler` which cycles over one or more colors simultaneously.',
        })
    })
})
