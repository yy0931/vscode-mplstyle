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

/** @returns {Pair | null} */
const parseLine = exports.parseLine = (/** @type {string} */line) => {
    const commentStart = line.indexOf("#")
    line = (commentStart === -1 ? line : line.slice(0, commentStart)).trimEnd()
    const start = line.length - line.trimStart().length
    line = line.trimStart()
    if (line === '') {
        return null
    }

    const colon = line.indexOf(":")
    if (colon === -1) {
        return { key: { text: line, start, end: start + line.length }, value: null, commentStart: null }
    }

    const key = line.slice(0, colon).trimEnd()
    const value = line.slice(colon + 1)
    return {
        key: { text: key, start, end: start + key.length },
        value: { text: value.trimStart(), start: start + colon + 1 + (value.length - value.trimStart().length), end: start + line.length },
        commentStart: commentStart === -1 ? null : commentStart,
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
