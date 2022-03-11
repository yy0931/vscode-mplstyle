const json5 = require("json5")

/** @typedef {{
 *      key: { text: string, start: number, end: number }
 *      value: { text: string, start: number, end: number } | null
 *      commentStart: number | null
 *  }} Pair
 */
/** @typedef {"Error" | "Warning"} Severity */

/** https://github.com/matplotlib/matplotlib/blob/3a265b33fdba148bb340e743667c4ba816ced928/lib/matplotlib/__init__.py#L724-L724 */
exports.parseAll = (/** @type {string} */content) => {
    /** @type {Map<string, { readonly pair: Pair, readonly line: number }[]>} */
    const rc = new Map()

    /** @type {{ error: string, severity: Severity, line: number, columnStart: number, columnEnd: number }[]} */
    const errors = []

    for (const [lineNumber, line] of content.replaceAll('\r', '').split('\n').entries()) {
        const pair = parseLine(line)
        if (pair === null) { continue }
        if (pair.value === null) {
            errors.push({ error: "Missing colon", severity: "Error", line: lineNumber, columnStart: 0, columnEnd: line.length })
        }
        const param = rc.get(pair.key.text)
        if (param !== undefined) {
            errors.push({ error: `duplicate key "${pair.key.text}"`, severity: "Error", line: lineNumber, columnStart: pair.key.start, columnEnd: pair.key.end })
            param.push({ pair, line: lineNumber })
        } else {
            rc.set(pair.key.text, [{ pair, line: lineNumber }])
        }
    }

    return { rc, errors }
}

const findCommentStart = (/** @type {string} */s) => {
    // https://github.com/timhoffm/matplotlib/blob/7c378a8f3f30ce57c874a851f3af8af58f1ffdf6/lib/matplotlib/cbook/__init__.py#L403
    let insideDoubleQuote = false
    for (let i = 0; i < s.length; i++) {
        if (s[i] === '"') {
            insideDoubleQuote = !insideDoubleQuote
        }
        if (!insideDoubleQuote && s[i] === "#") {
            return i
        }
    }
    return null
}

/** `countLeadingSpaces("  foo") == 2`, `countLeadingSpaces("  ") == 0` */
const countLeadingSpaces = (/** @type {string} */s) => s.trim() === "" ? 0 : s.length - s.trimStart().length

/**
 * https://github.com/timhoffm/matplotlib/blob/7c378a8f3f30ce57c874a851f3af8af58f1ffdf6/lib/matplotlib/__init__.py#L782-L799
 * @returns {Pair | null}
 */
const parseLine = exports.parseLine = (/** @type {string} */line) => {
    //          v valueStart
    //             v valueEnd
    // ` foo : "bar"  # comment `
    //      ^ keyEnd  ^ commentStart
    //   ^ keyStart
    const commentStart = findCommentStart(line)
    line = commentStart === null ? line : line.slice(0, commentStart)

    if (line.trimStart() === '') {  // `# comment`
        return null
    }

    const colon = line.indexOf(":")
    if (colon === -1) {  // `foo  # comment`
        const keyStart = countLeadingSpaces(line)
        const keyEnd = line.trimEnd().length
        return { key: { text: line.slice(keyStart, keyEnd), start: keyStart, end: keyEnd }, value: null, commentStart }
    }

    const keyStart = countLeadingSpaces(line.slice(0, colon))
    const keyEnd = line.slice(0, colon).trimEnd().length

    let valueStart = colon + 1 + countLeadingSpaces(line.slice(colon + 1))
    let valueEnd = line.trimEnd().length

    // Remove double quotes
    if (line[valueStart] === '"' && line[valueEnd - 1] === '"'
        && valueStart !== valueEnd - 1 // TODO: The current matplotlib implementation does not have this check https://github.com/timhoffm/matplotlib/blob/7c378a8f3f30ce57c874a851f3af8af58f1ffdf6/lib/matplotlib/__init__.py#L794-L795
    ) {
        valueStart += 1
        valueEnd -= 1
    }

    return {
        key: { text: line.slice(keyStart, keyEnd), start: keyStart, end: keyEnd },
        value: { text: line.slice(valueStart, valueEnd), start: valueStart, end: valueEnd },
        commentStart,
    }
}

/** @returns {{ index: number, key: string }[]} */
exports.findRcParamsInPythonFiles = (/** @type {string} */source) => {
    /** @type {{ index: number, key: string }[]} */
    const result = []
    for (const matches of source.matchAll(/(?<=(?:matplotlib\.|mpl\.|matplotlib\.pyplot\.|plt\.|[^.]|^)\s*rcParams\s*\[\s*['"])(?<key>[^'"]*)/g)) {
        if (matches.index !== undefined && matches.groups?.key !== undefined) {
            result.push({ index: matches.index, key: matches.groups.key })
        }
    }
    return result
}

/**
 * https://github.com/matplotlib/matplotlib/blob/main/lib/matplotlib/colors.py#L195
 * @returns {readonly [r: number, g: number, b: number, a: number] | null}
 */
exports.parseColor = (/** @type {string} */value, /** @type {Map<string, readonly [number, number, number, number]>} */colorMap) => {
    // none
    if (value.toLowerCase() === "none") {
        return [0, 0, 0, 0]
    }

    // red, blue, etc.
    const color = colorMap.get(value)
    if (color !== undefined) {
        return [...color]
    }

    // FFFFFF
    if (/^[a-f0-9]{6}$/i.test(value)) {
        return [
            parseInt(value.slice(0, 2), 16) / 255,
            parseInt(value.slice(2, 4), 16) / 255,
            parseInt(value.slice(4, 6), 16) / 255,
            1.0,
        ]
    }

    // FFFFFFFF
    if (/^[a-f0-9]{8}$/i.test(value)) {
        return [
            parseInt(value.slice(0, 2), 16) / 255,
            parseInt(value.slice(2, 4), 16) / 255,
            parseInt(value.slice(4, 6), 16) / 255,
            parseInt(value.slice(6, 8), 16) / 255,
        ]
    }

    // #FFFFFF
    if (/^#[a-f0-9]{6}$/i.test(value)) {
        return [
            parseInt(value.slice(1, 3), 16) / 255,
            parseInt(value.slice(3, 5), 16) / 255,
            parseInt(value.slice(5, 7), 16) / 255,
            1.0,
        ]
    }

    // FFFFFFFF
    if (/^#[a-f0-9]{8}$/i.test(value)) {
        return [
            parseInt(value.slice(1, 3), 16) / 255,
            parseInt(value.slice(3, 5), 16) / 255,
            parseInt(value.slice(5, 7), 16) / 255,
            parseInt(value.slice(7, 9), 16) / 255,
        ]
    }

    // 0.0 = black, 1.0 = white
    const x = (() => {
        try {
            return json5.parse(value)
        } catch (err) {
            return null
        }
    })()
    if (typeof x === "number") {
        return [x, x, x, 1.0]
    }

    return null
}
