const json5 = require("json5")
const parseMplstyle = require("./parse_mplstyle")

/** @typedef {{ readonly kind: "validate_" | "validate_", readonly type: string } | { readonly kind: "0 <= x <= 1" } | { readonly kind: "0 <= x < 1" } | { readonly kind: "enum", readonly values: readonly string[] } | { readonly kind: "untyped", type: string }} Signature */

exports.rcsetupPy = (/** @type {string} */content) => {
    content = content
        .replace(/\r/g, "")
        .replace(/^(.|\n)*\n_validators = \{\n/, "") // remove the code before `_validators = {`

    /** @type {Map<string, Signature>} */
    const result = new Map()
    const lines = content.split("\n").map((line) => line.trim())
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        // Repeat until `}`
        if (line === "}") {
            break
        }

        /** @type {RegExpExecArray | null} */
        let matches = null
        // Parse `"foo.bar": validator, # comment`_
        if (matches = /^\s*["']([\w\-_]+(?:\.[\w\-_]+)*)["']\s*:\s*(.*)$/.exec(line)) {
			const key = matches[1]
			let value = matches[2]
			// Read until the next right bracket if the first character is "[" and `value` doesn't include "]".
			if (value.startsWith('[') && !value.includes(']')) {
				for (let j = i + 1; j < lines.length; j++) {
					if (lines[j].includes("]")) {
						value += lines[j].split("]")[0] + "]"
						break
					} else {
						value += lines[j].replace(/#.*$/, "")
					}
				}
			}

            if (matches = /^validate_(\w+)(?:\s|\W|,|$)/.exec(value)) {                 // validate_bool, validate_float, etc.
                result.set(key, { kind: "validate_", type: matches[1] })
            } else if (matches = /^_validate_(\w+)(?:\s|\W|,|$)/.exec(value)) {          // _validate_linestyle, _validate_pathlike, etc.
                result.set(key, { kind: "validate_", type: matches[1] })
            } else if (/^_range_validators\["0 <= x <= 1"\](?:\s|\W|,|$)/.test(value)) { // _range_validators["0 <= x <= 1"]
                result.set(key, { kind: "0 <= x <= 1" })
            } else if (/^_range_validators\["0 <= x < 1"\](?:\s|\W|,|$)/.test(value)) {  // _range_validators["0 <= x < 1"]
                result.set(key, { kind: "0 <= x < 1" })
            } else if (matches = /^(\[\s*(?:"[^"]*"|'[^']*')\s*(?:,\s*(?:"[^"]*"|'[^']*')\s*)*\])\s*(?:\s|\W|,|$)/.exec(value)) { // ["foo", "bar"]
                try {
                    const values = json5.parse(matches[1])
                    if (Array.isArray(values) && values.every((v) => typeof v === "string")) {
                        result.set(key, { kind: "enum", values })
                    } else {
                        result.set(key, { kind: "untyped", type: value })
                    }
                } catch (err) {
                    console.log(`Parse error: ${matches[1]}`)
                    result.set(key, { kind: "untyped", type: value })
                }
            } else {
                result.set(key, { kind: "untyped", type: value })
            }
        } else if (!/^\s*(?:#.*)?$/.test(line) && line.startsWith(':')) {
            console.log(`Parse error: ${line}`)
        }
    }

    return result
}

exports.matplotlibrc = (/** @type {string} */content) => {
    /** @type {Map<string, { example: string, comment: string }>} */
    const result = new Map()
    /** @type {string | null} */
    let last = null
    for (let line of content.replaceAll("\r", "").split("\n")) {
        // Remove "#"
        if (line.startsWith("#")) {
            line = line.slice(1)
        }

        // Skip empty lines
        if (line.trim() === "") { continue }

        if (/^ +#/.test(line) && last !== null) {
            const lastItem = result.get(last)
            if (lastItem !== undefined) {
                lastItem.comment += "\n" + line.split("#", 2)[1].trimStart() 
            }
            continue
        }
        if (/^[# ]/.test(line)) { continue }
        const pair = parseMplstyle.parseLine(line)
        if (pair === null) { continue }
        if (pair.value === null) {
            console.log(`Parse error: ${line}`)
            continue
        }
        result.set(pair.key.text, { example: `${pair.key.text}: ${pair.value.text}`, comment: pair.commentStart === null ? "" : line.slice(pair.commentStart + 1).trim() })
        last = pair.key.text
    }
    return result
}
