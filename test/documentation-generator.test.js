const documentationGenerator = require("../src/documentation-generator")

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

    test("showImage: true", () => {
        expect(documentationGenerator.key("foo.bar", { images, showImage: true, mpl })).toEqual({
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

    test("showImage: false", () => {
        expect(documentationGenerator.key("foo.bar", { images, showImage: false, mpl })?.documentation).toEqual(`\
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
    test("test", () => {
        expect(documentationGenerator.cycler({
            cyclerProps: new Map([
                ["prop1", { label: "string", shortLabel: "string", check: () => true, color: false, constants: [] }],
                ["prop2", { label: "string", shortLabel: "string", check: () => true, color: false, constants: [] }],
            ])
        })).toEqual({
            detail: {
                form2: { param1: 'label: "prop1" | "prop2"', param2: 'values: list' },
                form3: { kwargs: ["prop1: string", "prop2: string"] },
            },
            documentation: 'Creates a `cycler.Cycler` which cycles over one or more colors simultaneously.',
        })
    })
})
