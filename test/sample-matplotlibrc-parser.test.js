const parseMatplotlibrc = require("../src/sample-matplotlibrc-parser")

describe("parseMatplotlibrc", () => {
    test("multi-line comments", () => {
        expect(Array.from(parseMatplotlibrc(`\
#key1: value1 # key1-comment1
              # key1-comment2
#key2: value2 # key2-comment1
`).entries())).toEqual([
            ['key1', { exampleValue: 'value1', comment: 'key1-comment1\nkey1-comment2' }],
            ['key2', { exampleValue: 'value2', comment: 'key2-comment1' }],
        ])
    })

    test("subheadings", () => {
        expect(Array.from(parseMatplotlibrc(`\
## a
#key1: value1
#key2: value2

## b
#key3: value3
#key4: value4
`).entries())).toEqual([
            ['key1', { exampleValue: 'value1', comment: 'a\n\n- key1\n- key2' }],
            ['key2', { exampleValue: 'value2', comment: 'a\n\n- key1\n- key2' }],
            ['key3', { exampleValue: 'value3', comment: 'b\n\n- key3\n- key4' }],
            ['key4', { exampleValue: 'value4', comment: 'b\n\n- key3\n- key4' }],
        ])
    })

    test("Complex comments 1", () => {
        expect(parseMatplotlibrc(`
## ***************************************************************************
## * SECTION                                                                 *
## ***************************************************************************
## section body

## subheading1
## subheading2
##key1: value1  # comment1
                # comment2
#key2: value2
`).get("key1")).toEqual({
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

    test("Complex comments 2", () => {
        expect(parseMatplotlibrc(`
## ***************************************************************************
## * SECTION                                                                 *
## ***************************************************************************
#key1: value1
## subheading2
#key2: value2
`).get("key1")).toEqual({
            exampleValue: "value1",
            comment: ``,
        })
    })
})