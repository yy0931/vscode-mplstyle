const { assert: { deepStrictEqual } } = require("chai")
const parseMatplotlibrc = require("./parse-matplotlibrc")

describe("parseMatplotlibrc", () => {
    it("multi-line comments", () => {
        deepStrictEqual(Array.from(parseMatplotlibrc(`\
#key1: value1 # key1-comment1
              # key1-comment2
#key2: value2 # key2-comment1
`).entries()), [
            ['key1', { exampleValue: 'value1', comment: 'key1-comment1\nkey1-comment2' }],
            ['key2', { exampleValue: 'value2', comment: 'key2-comment1' }],
        ])
    })

    it("subheadings", () => {
        deepStrictEqual(Array.from(parseMatplotlibrc(`\
## a
#key1: value1
#key2: value2

## b
#key3: value3
#key4: value4
`).entries()), [
            ['key1', { exampleValue: 'value1', comment: 'a\n\n- key1\n- key2' }],
            ['key2', { exampleValue: 'value2', comment: 'a\n\n- key1\n- key2' }],
            ['key3', { exampleValue: 'value3', comment: 'b\n\n- key3\n- key4' }],
            ['key4', { exampleValue: 'value4', comment: 'b\n\n- key3\n- key4' }],
        ])
    })

    it("Complex comments 1", () => {
        deepStrictEqual(parseMatplotlibrc(`
## ***************************************************************************
## * SECTION                                                                 *
## ***************************************************************************
## section body

## subheading1
## subheading2
##key1: value1  # comment1
                # comment2
#key2: value2
`).get("key1"), {
            exampleValue: "value1",
            comment: `\
comment1
comment2

---
subheading1
subheading2

- key1
- key2

---
#### SECTION
section body
` })
    })

    it("Complex comments 2", () => {
        deepStrictEqual(parseMatplotlibrc(`
## ***************************************************************************
## * SECTION                                                                 *
## ***************************************************************************
#key1: value1
## subheading2
#key2: value2
`).get("key1"), {
            exampleValue: "value1",
            comment: ``,
        })
    })
})