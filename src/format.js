const mplstyleParser = require("./parser")

exports.formatLine = (/** @type {string} */line) => {
    const pair = mplstyleParser.parseLine(line)
    if (pair === null) { return [] }

    /** @type {({ edit: "delete", start: number, end: number } | { edit: "replace", start: number, end: number, replacement: string })[]} */
    const edits = []

    // `  a: b` -> `a: b`
    if (pair.key.start > 0) {
        edits.push({ edit: "delete", start: 0, end: pair.key.start })
    }

    // `a : b` -> `a: b`, `a:  b` -> `a: b`, `a:b` -> `a: b`
    if (pair.value !== null && pair.value.text !== "" && (line[pair.key.end] !== ":" || pair.key.end + 2 !== pair.value.start)) {
        edits.push({ edit: "replace", start: pair.key.end, end: pair.value.start, replacement: ": " })
    }

    return edits
}
