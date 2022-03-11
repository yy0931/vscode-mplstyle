jest.mock("vscode", () => ({}), { virtual: true })

const { _testing: { formatLine, toHex } } = require("../src/extension")
const { testInputOutput } = require("./helper")

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
