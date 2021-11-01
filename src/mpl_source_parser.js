const json5 = require("json5")
const parseMplstyle = require("./mplstyle_parser")

/** @typedef {{ readonly kind: "validate_" | "validate_", readonly type: string } | { readonly kind: "0 <= x <= 1" } | { readonly kind: "0 <= x < 1" } | { readonly kind: "enum", readonly values: readonly string[] } | { readonly kind: "untyped", type: string } | { readonly kind: "list", readonly len: number | null, allow_stringlist: boolean, child: Signature }} Signature */

/** https://stackoverflow.com/a/3561711/10710682 */
const escapeRegExp = (/** @type {string} */string) => string.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')

/**
 * Parse
 * ```python
 * <variableNamePattern> = {
 *     "a": b,  # comment
 *     "c": d
 * }
 * ```
 * to
 * ```
 * [{ key: "a", value: "b" }, { key: "c", value: "d" }]
 * ```
 */
const parseDict = (/** @type {string} */content, /** @type {string} */ variableNamePattern) => {
    content = content
        .replace(/\r/g, "")
        .replace(new RegExp(String.raw`^(.|\n)*\n\s*${variableNamePattern}\s*=\s*\{\n`), "") // remove the code before `_validators = {`

    /** @type {{ readonly value: string, readonly key: string }[]} */
    const result = []
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
            const trimLineComment = /^(.*?)\s*(?:#[^"']*)?$/
            const key = matches[1]
            let value = matches[2].replace(trimLineComment, '$1')
            // Read until the next right bracket if there is a unmatched parenthesis
            for (const [left, right] of [["[", "]"], ["(", ")"]]) {
                if (new RegExp(r`^\w*${escapeRegExp(left)}`).test(value) && !value.includes(right)) {
                    for (let j = i + 1; j < lines.length; j++) {
                        if (lines[j].includes(right)) {
                            value += lines[j].split(right)[0] + right
                            break
                        } else {
                            value += lines[j].replace(trimLineComment, '$1')
                        }
                    }
                }
            }
            if (value.endsWith(",")) {
                value = value.slice(0, -1).trim()
            }
            result.push({ value, key })

        } else if (!/^\s*(?:#.*)?$/.test(line) && line.startsWith(':')) {
            console.log(`Parse error: ${line}`)
        }
    }

    return result
}
exports.parseDict = parseDict

const matchExpr = (/** @type {string} */pattern, /** @type {string} */source) => {
    return new RegExp(String.raw`^${pattern}$`).exec(source)
}

const r = String.raw.bind(String)

/** @returns {Signature} */
const parseValidator = (/** @type {string} */source) => {
    /** @type {RegExpExecArray | null} */
    let matches = null
    if (matches = matchExpr(r`validate_(\w+)`, source)) {                 // validate_bool, validate_float, etc.
        return { kind: "validate_", type: matches[1] }
    } else if (matches = matchExpr(r`_validate_(\w+)`, source)) {          // _validate_linestyle, _validate_pathlike, etc.
        return { kind: "validate_", type: matches[1] }
    } else if (matchExpr(r`_range_validators\["0 <= x <= 1"\]`, source)) { // _range_validators["0 <= x <= 1"]
        return { kind: "0 <= x <= 1" }
    } else if (matchExpr(r`_range_validators\["0 <= x < 1"\]`, source)) {  // _range_validators["0 <= x < 1"]
        return { kind: "0 <= x < 1" }
    } else if (matchExpr(r`JoinStyle`, source)) { // JoinStyle
        // https://github.com/matplotlib/matplotlib/blob/b09aad279b5dcfc49dcf43e0b064eee664ddaf68/lib/matplotlib/_enums.py#L82-L82
        return { kind: "enum", values: ["miter", "round", "bevel"] }
    } else if (matchExpr(r`CapStyle`, source)) {
        // https://github.com/matplotlib/matplotlib/blob/b09aad279b5colordcfc49dcf43e0b064eee664ddaf68/lib/matplotlib/_enums.py#L151-L151
        return { kind: "enum", values: ["butt", "projecting", "round"] }
    } else if (matches = matchExpr(r`(\[\s*(?:"[^"]*"|'[^']*')\s*(?:,\s*(?:"[^"]*"|'[^']*')\s*)*\])\s*`, source)) { // ["foo", "bar"]
        try {
            const values = json5.parse(matches[1])
            if (Array.isArray(values) && values.every((v) => typeof v === "string")) {
                return { kind: "enum", values }
            } else {
                return { kind: "untyped", type: source }
            }
        } catch (err) {
            console.log(`Parse error: ${matches[1]}`)
            return { kind: "untyped", type: source }
        }
    } else if (matches = matchExpr(r`_listify_validator\(([^\)]+?)(?:,\s*n=(\d+)\s*)?(?:,\s*allow_stringlist=(True|False)\s*)?\)`, source)) { // _listify_validator(validate_int, n=2)
        const arg1 = matches[1]
        const n = /** @type {string | undefined} */(matches[2])
        const allow_stringlist = matches[3]
        return { kind: 'list', len: n === undefined ? null : +n, allow_stringlist: allow_stringlist === "True", child: parseValidator(arg1) }
    } else if (matches = matchExpr(r`_ignorecase\(([^\)]+)\)`, source)) {
        return parseValidator(matches[1])
    } else {
        return { kind: "untyped", type: source }
    }
}

const parseValidators = (/** @type {string} */content) =>
    new Map(parseDict(content, '_validators').map(({ key, value }) => [key, parseValidator(value)]))

exports.parseValidators = parseValidators

const parsePropValidators = (/** @type {string} */content) =>
    new Map(parseDict(content, '_prop_validators').map(({ key, value }) => [key, parseValidator(value)]))

exports.parsePropValidators = parsePropValidators

const parseMatplotlibrc = (/** @type {string} */content) => {
    /** @type {Map<string, { exampleValue: string, comment: string }>} */
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
        result.set(pair.key.text, { exampleValue: pair.value.text, comment: pair.commentStart === null ? "" : line.slice(pair.commentStart + 1).trim() })
        last = pair.key.text
    }
    return result
}

exports.parseMatplotlibrc = parseMatplotlibrc

const path = require("path")
const fs = require("fs")
const isNOENT = (/** @type {unknown} */ err) => err instanceof Error && /** @type {any} */(err).code == "ENOENT"

exports.readAll = (/** @type {string} */extensionPath, /** @type {unknown} */matplotlibPath) => {
    // Read and parse matplotlib/rcsetup.py
    const useDefaultPath = matplotlibPath === undefined || typeof matplotlibPath !== "string" || matplotlibPath === ""
    const matplotlibDirectory = useDefaultPath ? path.join(extensionPath, "matplotlib") : matplotlibPath

    /** @type {string[]} */
    const errors = []

    /** @returns {string} */
    const readMatplotlibFile = (/** @type {string[]} */filepaths) => {
        for (const filepath of filepaths) {
            try {
                return fs.readFileSync(path.join(matplotlibDirectory, filepath)).toString()
            } catch (err) {
                if (isNOENT(err)) {
                    continue
                }
                console.error(filepath)
                console.error(err)
                errors.push(`${err}`)
                return ""
            }
        }
        errors.push(`mplstyle: ${filepaths.length >= 2 ? "neither of " : ""}"${filepaths.map((v) => path.resolve(path.join(matplotlibDirectory, v))).join(" nor ")}" does not exist. ${useDefaultPath ? "Please reinstall the extension" : 'Please delete or modify the value of "mplstyle.matplotlibPath" in the settings'}.`)
        return ""
    }

    const withPrefix = (/** @type {string} */x) => [path.join(`lib/matplotlib/`, x), x]
    const rcsetup = readMatplotlibFile(withPrefix("rcsetup.py"))
    return {
        signatures: parseValidators(rcsetup),
        cyclerProps: parsePropValidators(rcsetup),
        documentation: parseMatplotlibrc(readMatplotlibFile(withPrefix("mpl-data/matplotlibrc"))),
        errors,
    }
}
