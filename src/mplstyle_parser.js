/** @typedef {{
 *      key: { text: string, start: number, end: number },
 *      value: { text: string, start: number, end: number } | null,
 *      commentStart: number | null,
 *  }} Pair
 */
/** @typedef {"Error" | "Warning"} Severity */

/** https://github.com/matplotlib/matplotlib/blob/3a265b33fdba148bb340e743667c4ba816ced928/lib/matplotlib/__init__.py#L724-L724 */
exports.parseAll = (/** @type {string} */content) => {
	/** @type {Map<string, { readonly pair: Pair, readonly line: number }>} */
	const rc = new Map()

    /** @type {{ error: string, severity: Severity, line: number, columnStart: number, columnEnd: number }[]} */
    const errors = []

	for (const [lineNumber, line] of content.replaceAll('\r', '').split('\n').entries()) {
        const pair = this.parseLine(line)
        if (pair === null) { continue }
        if (pair.value === null) {
            errors.push({ error: "Missing colon", severity: "Error", line: lineNumber, columnStart: 0, columnEnd: line.length })
        }
        if (rc.has(pair.key.text)) {
            errors.push({ error: `duplicate key ${pair.key.text}`, severity: "Error", line: lineNumber, columnStart: pair.key.start, columnEnd: pair.key.end })
        }
        rc.set(pair.key.text, { pair, line: lineNumber })
	}

    return { rc, errors }
}

/** @returns {Pair | null} */
exports.parseLine = (/** @type {string} */line) => {
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
