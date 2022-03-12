import json5 from "json5"
import parseMatplotlibrc from "./sample-matplotlibrc-parser"

/**
 * Parses [matplotlib/lib/matplotlib/rcsetup.py](https://github.com/matplotlib/matplotlib/blob/b9ae51ca8c5915fe7accf712a504e08e35b2f69d/lib/matplotlib/rcsetup.py#L1), which defines the list of runtime configuration parameters and their possible values.
 */
export const parseMplSource = async <Path extends { toString(): string }>(extensionPath: Path, matplotlibPath: Path | undefined, joinPaths: (a: Path, b: string) => Path, readFile: (path: Path) => Promise<string>, isNOENT: (err: unknown) => boolean, keywords?: { none: string, bool: string[] }): Promise<{ params: Map<string, Type>; cyclerProps: Map<string, Type>; documentation: Map<string, { exampleValue: string; comment: string }>; errors: string[] }> => {
    // Read and parse matplotlib/rcsetup.py
    const useDefaultPath = !matplotlibPath
    const matplotlibDirectory = useDefaultPath ? joinPaths(extensionPath, "matplotlib") : matplotlibPath

    const errors: string[] = []

    const readMatplotlibFile = async (filepaths: string[]): Promise<{ err: string } | { content: string }> => {
        for (const filepath of filepaths) {
            try {
                const content = await readFile(joinPaths(matplotlibDirectory, filepath))
                if (content === "") {
                    continue
                }
                return { content }
            } catch (err) {
                if (isNOENT(err)) {
                    continue
                }
                console.error(err)
                return { err: err + "" }
            }
        }
        return { err: `${filepaths.length >= 2 ? "neither of " : ""}"${filepaths.map((v) => joinPaths(matplotlibDirectory, v).toString()).join(" nor ")}" does not exist. ${useDefaultPath ? "Please reinstall the extension" : 'Please clear or modify `mplstyle.hover.matplotlibPath`'}.` }
    }

    const withPrefix = (x: string) => [`lib/matplotlib/` + x, x]
    const rcsetup = await readMatplotlibFile(withPrefix("rcsetup.py"))
    if ("err" in rcsetup) {
        return { params: new Map(), cyclerProps: new Map(), documentation: new Map(), errors: [...errors, rcsetup.err] }
    }
    const validators = parseDict(rcsetup.content, '_validators')
    errors.push(...validators.err.map((v) => `Error during parsing rcsetup.py: ${v}`))
    const propValidators = parseDict(rcsetup.content, '_prop_validators')
    errors.push(...propValidators.err.map((v) => `Error during parsing rcsetup.py: ${v}`))

    // dirty fix
    for (const item of validators.result) {
        if (item.key === "ps.papersize") {
            // https://github.com/matplotlib/matplotlib/blob/b09aad279b5dcfc49dcf43e0b064eee664ddaf68/lib/matplotlib/rcsetup.py#L1156-L1156
            item.value = JSON.stringify(["auto", "letter", "legal", "ledger", ...Array(11).fill(0).map((_, i) => [`a${i}`, `b${i}`]).flat()])
        }
    }

    const params = new Map(validators.result.map(({ key, value }) => [key, parseValidator(value, keywords)]))
    const cyclerProps = new Map(propValidators.result.map(({ key, value }) => [key, parseValidator(value, keywords)]))

    const matplotlibrc = await readMatplotlibFile(withPrefix("mpl-data/matplotlibrc"))
    if ("err" in matplotlibrc) {
        [matplotlibrc.err]
        return { params, cyclerProps, documentation: new Map(), errors: [...errors, matplotlibrc.err] }
    }

    return { params, cyclerProps, documentation: parseMatplotlibrc(matplotlibrc.content), errors }
}

const json5Parse = (text: string) => {
    try {
        return json5.parse(text)
    } catch (err) {
        return err
    }
}

/** https://stackoverflow.com/a/3561711/10710682 */
const escapeRegExp = (string: string) => string.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')

const trimLineComment = (source: string) => {

    let strLiteral: string = ""
    for (let i = 0; i < source.length; i++) {
        const char = source[i]
        if (strLiteral === "") {
            if (char === `"` || char === `'`) {
                strLiteral = char
                while (source[i + 1] === char) {
                    strLiteral += source[i + 1]
                    i++
                }
            } else if (char === `#`) {
                return source.slice(0, i).trimEnd()
            }
        } else {
            if (source.startsWith(strLiteral, i)) {
                i += strLiteral.length - 1
                strLiteral = ""
            } else if (char === '\\') {
                i++
            }
        }
    }

    return source
}

/**
 * Parses the definition of `_validators` and `_prop_validators` in [matplotlib/lib/matplotlib/rcsetup.py](https://github.com/matplotlib/matplotlib/blob/b9ae51ca8c5915fe7accf712a504e08e35b2f69d/lib/matplotlib/rcsetup.py#L1).
 * @returns {{ result: { key: string, value: string }[], err: string[] }}
 */
const parseDict = (content: string, variableNamePattern: string): { result: { key: string; value: string }[]; err: string[] } => {
    content = content.replace(/\r/g, "")
    const replaced = content.replace(new RegExp(String.raw`^(.|\n)*\n\s*${variableNamePattern}\s*=\s*\{\n`), "") // remove the code before `_validators = {`
    if (content === replaced) {
        return { result: [], err: [`Parse error: "${variableNamePattern}" does not exist`] }
    }
    content = replaced

    const result: { readonly value: string; readonly key: string }[] = []
    const err: string[] = []
    const lines = content.split("\n").map((line) => line.trim())
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        // Repeat until `}`
        if (line === "}") {
            break
        }

        let matches: RegExpExecArray | null = null
        // Parse `"foo.bar": validator, # comment`_
        if (matches = /^\s*["']([\w\-_]+(?:\.[\w\-_]+)*)["']\s*:\s*(.*)$/.exec(line)) {
            const key = matches[1]
            let value = trimLineComment(matches[2])
            // Read until the next right bracket if there is a unmatched parenthesis
            for (const [left, right] of [["[", "]"], ["(", ")"]]) {
                if (new RegExp(r`^\w*${escapeRegExp(left)}`).test(value) && !value.includes(right)) {
                    i++
                    for (; i < lines.length; i++) {
                        if (lines[i].includes(right)) {
                            value += lines[i].split(right)[0] + right
                            break
                        } else {
                            value += trimLineComment(lines[i])
                        }
                    }
                }
            }
            if (value.endsWith(",")) {
                value = value.slice(0, -1).trim()
            }
            result.push({ value, key })
        } else if (!/^\s*(?:#.*)?$/.test(line)) {
            err.push(`Parse error: "${line}"`)
        }
    }

    return { result, err }
}

const matchExpr = (pattern: string, source: string) => {
    return new RegExp(String.raw`^${pattern}$`).exec(source)
}

const r = String.raw.bind(String)

type Type = { readonly label: string, readonly shortLabel: string, readonly check: (value: string) => boolean, readonly constants: readonly string[], readonly color: boolean }

/**
 * Parses a validator name used in _validators in [matplotlib/lib/matplotlib/rcsetup.py](https://github.com/matplotlib/matplotlib/blob/b9ae51ca8c5915fe7accf712a504e08e35b2f69d/lib/matplotlib/rcsetup.py#L1).
 */
const parseValidator = (source: string, keywords: { none: string; bool: string[] } = { none: "None", bool: ["t", "y", "yes", "on", "True", "1", "f", "n", "no", "off", "False", "0"] }): Type => {
    const makeType: (x: { readonly label: string; check: Type["check"] } & Partial<Type>) => Type = (x): Type => ({ constants: [], color: false, shortLabel: x.label, ...x })

    /** case insensitive. All values must be lowercase. */
    const makeEnum = (values: string[], caseSensitive: boolean = false) => {
        const valuesForCheck = caseSensitive ? values : values.map((v) => v.toLowerCase())
        return makeType({ label: values.map((x) => JSON.stringify(x)).join(" | "), check: (x) => valuesForCheck.includes(caseSensitive ? x : x.toLowerCase()), constants: values })
    }

    const makeList = (child: Type, len: number | null, allow_stringlist: boolean) => {
        const left = (allow_stringlist ? "str | " : "") + "list["
        const right = "]" + (len === null ? '' : ` (len=${len})`)
        return makeType({
            shortLabel: left + child.shortLabel + right,
            label: left + child.label + right,
            check: (x) => allow_stringlist || (len === null || x.split(",").length === len) && (x.trim() === '' || x.split(",").map((v) => v.trim()).every((v) => child.check(v))),
            constants: child.constants,
            color: child.color,
        })
    }

    const orEnum = (base: Type, values: string[], caseSensitive: boolean = false) => {
        const valuesForCheck = caseSensitive ? values : values.map((v) => v.toLowerCase())
        return makeType({
            shortLabel: `${values.map((v) => JSON.stringify(v)).join(" | ")} | ${base.shortLabel}`,
            label: `${values.map((v) => JSON.stringify(v)).join(" | ")} | ${base.label}`,
            check: (x) => base.check(x) || valuesForCheck.includes(caseSensitive ? x : x.toLowerCase()),
            constants: [...base.constants, ...values],
            color: base.color,
        })
    }

    const any = (x: string) => true


    let matches: RegExpExecArray | null = null
    if (matches = matchExpr(r`_?validate_(\w+)`, source)) {                 // validate_bool, validate_float, _validate_linestyle, _validate_pathlike, etc.
        const type = matches[1]
        if (type.endsWith("_or_None")) {
            // https://github.com/matplotlib/matplotlib/blob/b09aad279b5dcfc49dcf43e0b064eee664ddaf68/lib/matplotlib/rcsetup.py#L181
            return orEnum(parseValidator(source.slice(0, -"_or_None".length)), [keywords.none])
        }
        if (type === "fontsize_None") {
            // https://github.com/matplotlib/matplotlib/blob/b09aad279b5dcfc49dcf43e0b064eee664ddaf68/lib/matplotlib/rcsetup.py#L354
            return orEnum(parseValidator(source.slice(0, -"_None".length)), [keywords.none])
        }
        if (type.endsWith("list")) {
            // key: val1, val2
            return makeList(parseValidator(source.slice(0, -"list".length)), null, false)
        }

        // types
        switch (type) {
            case "linestyle":
                // https://github.com/matplotlib/matplotlib/blob/b09aad279b5dcfc49dcf43e0b064eee664ddaf68/lib/matplotlib/rcsetup.py#L434-L434
                const values = ["-", "--", "-.", ":", " ", "solid", "dashed", "dashdot", "dotted", "none"]
                return makeType({ shortLabel: type, label: '(offset (int), list["on" | "off"]) | list["on" | "off"] | ' + values.map((v) => JSON.stringify(v)).join(" | "), constants: values, check: (x) => true })
            case "dpi":
                // https://github.com/matplotlib/matplotlib/blob/b09aad279b5dcfvc49dcf43e0b064eee664ddaf68/lib/matplotlib/rcsetup.py#L163-L163
                return makeType({ label: `int | "figure"`, check: (x) => x === "figure" || typeof json5Parse(x) === "number", constants: ["figure"] })
            case "fontsize":
                // https://github.com/matplotlib/matplotlib/blob/b09aad279b5dcfc49dcf43e0b064eee664ddaf68/lib/matplotlib/rcsetup.py#L360-L360
                return orEnum(parseValidator("validate_float"), ['xx-small', 'x-small', 'small', 'medium', 'large', 'x-large', 'xx-large', 'smaller', 'larger'], true)
            case "fontweight":
                // https://github.com/matplotlib/matplotlib/blob/b09aad279b5dcfc49dcf43e0b064eee664ddaf68/lib/matplotlib/rcsetup.py#L378-L378
                return orEnum(parseValidator("validate_float"), ['ultralight', 'light', 'normal', 'regular', 'book', 'medium', 'roman', 'semibold', 'demibold', 'demi', 'bold', 'heavy', 'extra bold', 'black'], true)
            case "bbox":
                // https://github.com/matplotlib/matplotlib/blob/b09aad279b5dcfc49dcf43e0b064eee664ddaf68/lib/matplotlib/rcsetup.py#L519-L519
                return makeEnum(["tight", "standard"], true)
            case "float":
                return makeType({ label: "float", check: (x) => typeof json5Parse(x) === "number" })
            case "int": {
                return makeType({ label: "int", check: (x) => { x = json5Parse(x); return typeof x === "number" && Number.isInteger(x) } })
            } case "bool":
                // https://github.com/matplotlib/matplotlib/blob/3a265b33fdba148bb340e743667c4ba816ced928/lib/matplotlib/rcsetup.py#L142-L142
                return makeType({ label: "bool", check: (x) => keywords.bool.map((v) => v.toLowerCase()).includes(x.toLowerCase()), constants: keywords.bool })
            case "string":
                return makeType({ label: `str`, check: any })
            case "any":
                return makeType({ label: `any`, check: any })
            case "dash":
                // https://github.com/matplotlib/matplotlib/blob/b09aad279b5dcfc49dcf43e0b064eee664ddaf68/lib/matplotlib/rcsetup.py#L582-L582
                return parseValidator(`validate_floatlist`)
            case "hatch": {
                // https://github.com/matplotlib/matplotlib/blob/b09aad279b5dcfc49dcf43e0b064eee664ddaf68/lib/matplotlib/rcsetup.py#L566-L566
                return makeType({ label: String.raw`/[\\/|\-+*.xoO]*/`, check: (x) => x === "" || /[\\/|\-+*.xoO]*/.test(x) })
            } case "cmap":
                // https://github.com/matplotlib/matplotlib/blob/b09aad279b5dcfc49dcf43e0b064eee664ddaf68/lib/matplotlib/rcsetup.py#L339-L339
                return makeType({ label: type, check: any })
            case "fonttype":
                // https://github.com/matplotlib/matplotlib/blob/b09aad279b5dcfc49dcf43e0b064eee664ddaf68/lib/matplotlib/rcsetup.py#L224-L224
                return makeType({ label: type, check: any })
            case "pathlike":
                return makeType({ label: type, check: any })
            case "aspect":
                // https://github.com/matplotlib/matplotlib/blob/b09aad279b5dcfc49dcf43e0b064eee664ddaf68/lib/matplotlib/rcsetup.py#L344-L344
                return orEnum(parseValidator("validate_float"), ["auto", "equal"], true)
            case "axisbelow":
                // https://github.com/matplotlib/matplotlib/blob/b09aad279b5dcfc49dcf43e0b064eee664ddaf68/lib/matplotlib/rcsetup.py#L152
                return orEnum(parseValidator("validate_bool"), ["line"], true)
            case "color":
                // https://github.com/matplotlib/matplotlib/blob/b09aad279b5dcfc49dcf43e0b064eee664ddaf68/lib/matplotlib/rcsetup.py#L312-L312
                return makeType({ label: `color | "C0"-"C9"`, check: any, color: true })
            case "color_or_auto":
                // https://github.com/matplotlib/matplotlib/blob/b09aad279b5dcfc49dcf43e0b064eee664ddaf68/lib/matplotlib/rcsetup.py#L277-L277
                return makeType({ label: `color | "C0"-"C9" | "auto"`, check: any, constants: ["auto"], color: true })
            case "color_for_prop_cycle":
                // https://github.com/matplotlib/matplotlib/blob/b09aad279b5dcfc49dcf43e0b064eee664ddaf68/lib/matplotlib/rcsetup.py#L282-L282
                return makeType({ label: 'color', check: any, color: true })
            case "color_or_inherit":
                // https://github.com/matplotlib/matplotlib/blob/b09aad279b5dcfc49dcf43e0b064eee664ddaf68/lib/matplotlib/rcsetup.py#L269-L269
                return makeType({ label: `color | "C0"-"C9" | "inherit"`, check: any, constants: ["inherit"], color: true })
            case "color_or_linecolor":
                // https://github.com/matplotlib/matplotlib/blob/b09aad279b5dcfc49dcf43e0b064eee664ddaf68/lib/matplotlib/rcsetup.py#L289-L289
                return makeType({ label: `color | "linecolor" | "markerfacecolor" | "markeredgecolor"`, check: any, constants: ["linecolor", "markerfacecolor", "markeredgecolor"], color: true })
            case "cycler":
                // https://github.com/matplotlib/matplotlib/blob/b09aad279b5dcfc49dcf43e0b064eee664ddaf68/lib/matplotlib/rcsetup.py#L704-L704
                return makeType({ label: `cycler`, check: any })
            case "whiskers":
                // https://github.com/matplotlib/matplotlib/blob/b09aad279b5dcfc49dcf43e0b064eee664ddaf68/lib/matplotlib/rcsetup.py#L411-L411
                return makeType({ shortLabel: type, label: `list[float] (len=2) | float`, check: (x) => x.split(',').length === 2 && x.split(',').map((v) => v.trim()).every((v) => typeof json5Parse(v) === "number") || typeof json5Parse(x) === "number" })
            case "fillstyle": {
                // https://github.com/matplotlib/matplotlib/blob/b09aad279b5dcfc49dcf43e0b064eee664ddaf68/lib/matplotlib/rcsetup.py#L475-L475
                return { ...makeEnum(["full", "left", "right", "bottom", "top", "none"]), shortLabel: type }
            } case "sketch":
                // https://github.com/matplotlib/matplotlib/blob/b09aad279b5dcfc49dcf43e0b064eee664ddaf68/lib/matplotlib/rcsetup.py#L534-L534
                return makeType({ shortLabel: type, label: `list[float] (len=3) | "${keywords.none}"`, check: (x) => x.toLowerCase() === "none" || x.split(",").length === 3 && x.split(",").map((v) => v.trim()).every((v) => typeof json5Parse(v) === "number"), constants: [keywords.none] })
            case "hist_bins": {
                // https://github.com/matplotlib/matplotlib/blob/b09aad279b5dcfc49dcf43e0b064eee664ddaf68/lib/matplotlib/rcsetup.py#L766-L766
                const values = ["auto", "sturges", "fd", "doane", "scott", "rice", "sqrt"]
                return makeType({ shortLabel: type, label: "int | list[float] | " + values.map((v) => JSON.stringify(v)).join(" | "), check: (x) => values.includes(x) || x === "" || x.split(",").map((v) => v.trim()).every((v) => typeof json5Parse(v) === "number") || typeof json5Parse(x) === "number" })
            } default:
                // unimplemented
                return makeType({ label: `${type} (any)`, check: any })
        }
    } else if (matchExpr(r`_range_validators\["0 <= x <= 1"\]`, source)) { // _range_validators["0 <= x <= 1"]
        return makeType({
            label: "float (0 <= x <= 1)",
            check: (x) => {
                x = json5Parse(x)
                return typeof x === "number" && 0 <= x && x <= 1
            },
        })
    } else if (matchExpr(r`_range_validators\["0 <= x < 1"\]`, source)) {  // _range_validators["0 <= x < 1"]
        return makeType({
            label: "float (0 <= x < 1)",
            check: (x) => {
                x = json5Parse(x)
                return typeof x === "number" && 0 <= x && x < 1
            },
        })
    } else if (matchExpr(r`JoinStyle`, source)) { // JoinStyle
        // https://github.com/matplotlib/matplotlib/blob/b09aad279b5dcfc49dcf43e0b064eee664ddaf68/lib/matplotlib/_enums.py#L82-L82
        return makeEnum(["miter", "round", "bevel"])
    } else if (matchExpr(r`CapStyle`, source)) {
        // https://github.com/matplotlib/matplotlib/blob/b09aad279b5colordcfc49dcf43e0b064eee664ddaf68/lib/matplotlib/_enums.py#L151-L151
        return makeEnum(["butt", "projecting", "round"])
    } else if (matches = matchExpr(r`(\[\s*(?:"[^"]*"|'[^']*')\s*(?:,\s*(?:"[^"]*"|'[^']*')\s*)*\])\s*`, source)) { // ["foo", "bar"]
        try {
            const values = json5.parse(matches[1])
            if (Array.isArray(values) && values.every((v) => typeof v === "string")) {
                return makeEnum(values)
            } else {
                return makeType({ label: `${source} (any)`, check: any })
            }
        } catch (err) {
            console.log(`Parse error: ${matches[1]}`)
            return makeType({ label: `${source} (any)`, check: any })
        }
    } else if (matches = matchExpr(r`_listify_validator\(([^\)]+?)(?:,\s*n=(\d+)\s*)?(?:,\s*allow_stringlist=(True|False)\s*)?\)`, source)) { // _listify_validator(validate_int, n=2)
        const len = (matches[2])
        return makeList(parseValidator(matches[1]), len === undefined ? null : +len, matches[3] === "True")
    } else if (matches = matchExpr(r`_ignorecase\(([^\)]+)\)`, source)) {
        return parseValidator(matches[1])
    } else {
        return makeType({ label: `${source} (any)`, check: any })
    }
}

export const _testing = { trimLineComment, parseDict, parseValidator }
