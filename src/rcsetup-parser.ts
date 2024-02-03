import json5 from "json5"
import parseMatplotlibrc from "./sample-matplotlibrc-parser"

export type CompletionOptions = { none: string, bool: string[], cm: string[] }

/**
 * Parses [matplotlib/lib/matplotlib/rcsetup.py](https://github.com/matplotlib/matplotlib/blob/b9ae51ca8c5915fe7accf712a504e08e35b2f69d/lib/matplotlib/rcsetup.py#L1), which defines the list of runtime configuration parameters and their possible values.
 */
export const parseMplSource = async <Path extends { toString(): string }>(extensionPath: Path, matplotlibPath: Path | undefined, joinPaths: (a: Path, b: string) => Path, readFile: (path: Path) => Promise<string>, isNOENT: (err: unknown) => boolean, opts?: CompletionOptions): Promise<{ params: Map<string, Type>; cyclerProps: Map<string, Type>; documentation: Map<string, { exampleValue: string; comment: string }>; errors: string[] }> => {
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

    const params = new Map(validators.result.map(({ key, value }) => [key, parseValidator(value, opts)]))
    const cyclerProps = new Map(propValidators.result.map(({ key, value }) => [key, parseValidator(value, opts)]))

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

export type Type = {
    readonly label: string
    readonly shortLabel: string
    /** static type-checker */
    readonly check: (value: string) => boolean
    /** constants to be shown at code completion */
    readonly constants: readonly string[]
    /** whether the document color provider should parse the value */
    readonly color: boolean
}

const Type = {
    new: (x: { readonly label: string; check: Type["check"] } & Partial<Type>): Type => ({
        constants: [],
        color: false,
        shortLabel: x.label,
        ...x
    }),
    /** values[0] | values[1] | ... */
    enum: (values: string[], caseSensitive: boolean = false) => {
        const valuesForCheck = caseSensitive ? values : values.map((v) => v.toLowerCase())
        return Type.new({ label: values.map((x) => JSON.stringify(x)).join(" | "), check: (x) => valuesForCheck.includes(caseSensitive ? x : x.toLowerCase()), constants: values })
    },
    /** child[] */
    list: (child: Type, { len = null, allow_stringlist = false, literal_eval = false }: { len?: number | null, allow_stringlist?: boolean, literal_eval?: boolean } = {}) => {
        const left = (allow_stringlist ? "str | " : "") + "list["
        const right = "]" + (len === null ? '' : ` (len=${len})`)
        return Type.new({
            shortLabel: left + child.shortLabel + right,
            label: left + child.label + right,
            check: (x) => {
                if (allow_stringlist) { return true }
                if (literal_eval && /^\[.*\]$|^\(.*\)$/s.test(x)) { x = x.slice(1, -1) }
                if (len !== null && x.split(",").length !== len) { return false }
                if (x.trim() === '') { return true }
                return x.split(",").map((v) => v.trim()).every((v) => child.check(v))
            },
            constants: child.constants,
            color: child.color,
        })
    },
    /** types[0] | types[1] | ... */
    union: (...types: Type[]) => Type.new({
        shortLabel: types.map((v) => v.shortLabel).join(" | "),
        label: types.map((v) => v.label).join(" | "),
        check: (x) => types.some((v) => v.check(x)),
        constants: types.flatMap((v) => v.constants),
        color: types.some((v) => v.color),
    }),
    int: () => Type.new({
        label: "int",
        check: (x) => {
            x = json5Parse(x)
            return typeof x === "number" && Number.isInteger(x)
        },
    }),
    float: () => Type.new({
        label: "float",
        check: (x) => typeof json5Parse(x) === "number",
    }),
} as const

/**
 * Parses a validator name used in _validators in [matplotlib/lib/matplotlib/rcsetup.py](https://github.com/matplotlib/matplotlib/blob/b9ae51ca8c5915fe7accf712a504e08e35b2f69d/lib/matplotlib/rcsetup.py#L1).
 */
const parseValidator = (source: string, opts: CompletionOptions = { none: "None", bool: ["t", "y", "yes", "on", "True", "1", "f", "n", "no", "off", "False", "0"], cm: [] }): Type => {
    const any = (x: string) => true

    let matches: RegExpExecArray | null = null
    if (matches = matchExpr(r`_?validate_(\w+)`, source)) {  // validate_bool, validate_float, _validate_linestyle, _validate_pathlike, etc.
        const type = matches[1]
        if (type.endsWith("_or_None")) {
            // https://github.com/matplotlib/matplotlib/blob/b09aad279b5dcfc49dcf43e0b064eee664ddaf68/lib/matplotlib/rcsetup.py#L181
            return Type.union(parseValidator(source.slice(0, -"_or_None".length), opts), Type.enum([opts.none]))
        }
        if (type === "fontsize_None") {
            // https://github.com/matplotlib/matplotlib/blob/b09aad279b5dcfc49dcf43e0b064eee664ddaf68/lib/matplotlib/rcsetup.py#L354
            return Type.union(parseValidator(source.slice(0, -"_None".length), opts), Type.enum([opts.none]))
        }
        if (type.endsWith("list")) {
            // comma-separated list, e.g. `key: val1, val2`
            return Type.list(parseValidator(source.slice(0, -"list".length), opts))
        }

        // types
        switch (type) {
            case "linestyle":
                // https://github.com/matplotlib/matplotlib/blob/b09aad279b5dcfc49dcf43e0b064eee664ddaf68/lib/matplotlib/rcsetup.py#L434
                return Type.union(Type.new({ shortLabel: type, label: '(offset (int), list["on" | "off"]) | list["on" | "off"]', check: any }), Type.enum(["-", "--", "-.", ":", " ", "solid", "dashed", "dashdot", "dotted", "none"]))
            case "dpi":
                // https://github.com/matplotlib/matplotlib/blob/b09aad279b5dcfc49dcf43e0b064eee664ddaf68/lib/matplotlib/rcsetup.py#L163
                return Type.union(Type.int(), Type.enum(["figure"], true))
            case "fontsize":
                // https://github.com/matplotlib/matplotlib/blob/b09aad279b5dcfc49dcf43e0b064eee664ddaf68/lib/matplotlib/rcsetup.py#L360
                return Type.union(Type.float(), Type.enum(['xx-small', 'x-small', 'small', 'medium', 'large', 'x-large', 'xx-large', 'smaller', 'larger'], true))
            case "fontweight":
                // https://github.com/matplotlib/matplotlib/blob/b09aad279b5dcfc49dcf43e0b064eee664ddaf68/lib/matplotlib/rcsetup.py#L377
                return Type.union(Type.float(), Type.enum(['ultralight', 'light', 'normal', 'regular', 'book', 'medium', 'roman', 'semibold', 'demibold', 'demi', 'bold', 'heavy', 'extra bold', 'black'], true))
            case "bbox":
                // https://github.com/matplotlib/matplotlib/blob/b09aad279b5dcfc49dcf43e0b064eee664ddaf68/lib/matplotlib/rcsetup.py#L519
                return Type.enum(["tight", "standard"], true)
            case "float":
                return Type.float()
            case "int": {
                return Type.int()
            } case "bool":
                // https://github.com/matplotlib/matplotlib/blob/3a265b33fdba148bb340e743667c4ba816ced928/lib/matplotlib/rcsetup.py#L138
                return Type.new({ label: "bool", check: (x) => opts.bool.map((v) => v.toLowerCase()).includes(x.toLowerCase()), constants: opts.bool })
            case "string":
                return Type.new({ label: `str`, check: any })
            case "any":
                return Type.new({ label: `any`, check: any })
            case "dash":
                // https://github.com/matplotlib/matplotlib/blob/b09aad279b5dcfc49dcf43e0b064eee664ddaf68/lib/matplotlib/rcsetup.py#L581
                return Type.list(Type.float())
            case "hatch": {
                // https://github.com/matplotlib/matplotlib/blob/b09aad279b5dcfc49dcf43e0b064eee664ddaf68/lib/matplotlib/rcsetup.py#L565
                return Type.new({ label: String.raw`/[\\/|\-+*.xoO]*/`, check: (x) => x === "" || /[\\/|\-+*.xoO]*/.test(x) })
            } case "cmap":
                // https://github.com/matplotlib/matplotlib/blob/b09aad279b5dcfc49dcf43e0b064eee664ddaf68/lib/matplotlib/rcsetup.py#L339
                return Type.new({ label: type, check: any, constants: opts.cm })
            case "fonttype":
                // https://github.com/matplotlib/matplotlib/blob/b09aad279b5dcfc49dcf43e0b064eee664ddaf68/lib/matplotlib/rcsetup.py#L224
                return Type.new({ label: type, check: any })
            case "pathlike":
                return Type.new({ label: type, check: any })
            case "aspect":
                // https://github.com/matplotlib/matplotlib/blob/b09aad279b5dcfc49dcf43e0b064eee664ddaf68/lib/matplotlib/rcsetup.py#L344
                return Type.union(Type.float(), Type.enum(["auto", "equal"], true))
            case "axisbelow":
                // https://github.com/matplotlib/matplotlib/blob/b09aad279b5dcfc49dcf43e0b064eee664ddaf68/lib/matplotlib/rcsetup.py#L152
                return Type.union(parseValidator("validate_bool", opts), Type.enum(["line"], true))
            case "color":
                // https://github.com/matplotlib/matplotlib/blob/b09aad279b5dcfc49dcf43e0b064eee664ddaf68/lib/matplotlib/rcsetup.py#L310
                return Type.new({ label: `color | "C0"-"C9"`, check: any, color: true })
            case "color_or_auto":
                // https://github.com/matplotlib/matplotlib/blob/b09aad279b5dcfc49dcf43e0b064eee664ddaf68/lib/matplotlib/rcsetup.py#L276
                return Type.new({ label: `color | "C0"-"C9" | "auto"`, check: any, constants: ["auto"], color: true })
            case "color_for_prop_cycle":
                // https://github.com/matplotlib/matplotlib/blob/b09aad279b5dcfc49dcf43e0b064eee664ddaf68/lib/matplotlib/rcsetup.py#L282
                return Type.new({ label: 'color', check: any, color: true })
            case "color_or_inherit":
                // https://github.com/matplotlib/matplotlib/blob/b09aad279b5dcfc49dcf43e0b064eee664ddaf68/lib/matplotlib/rcsetup.py#L269
                return Type.new({ label: `color | "C0"-"C9" | "inherit"`, check: any, constants: [...Array.from(Array(10).keys(), (i) => `C${i}`), "inherit"], color: true })
            case "color_or_linecolor":
                // https://github.com/matplotlib/matplotlib/blob/b09aad279b5dcfc49dcf43e0b064eee664ddaf68/lib/matplotlib/rcsetup.py#L289
                return Type.union(Type.new({ label: "color", check: any, color: true }), Type.enum(["linecolor", "markerfacecolor", "markeredgecolor"]))
            case "cycler":
                // https://github.com/matplotlib/matplotlib/blob/b09aad279b5dcfc49dcf43e0b064eee664ddaf68/lib/matplotlib/rcsetup.py#L703
                return Type.new({ label: `cycler`, check: any })
            case "whiskers":
                // https://github.com/matplotlib/matplotlib/blob/b09aad279b5dcfc49dcf43e0b064eee664ddaf68/lib/matplotlib/rcsetup.py#L410
                return Type.union(Type.list(Type.float(), { len: 2 }), Type.float())
            case "fillstyle": {
                // https://github.com/matplotlib/matplotlib/blob/b09aad279b5dcfc49dcf43e0b064eee664ddaf68/lib/matplotlib/rcsetup.py#L475
                return { ...Type.enum(["full", "left", "right", "bottom", "top", "none"]), shortLabel: type }
            } case "sketch":
                // https://github.com/matplotlib/matplotlib/blob/b09aad279b5dcfc49dcf43e0b064eee664ddaf68/lib/matplotlib/rcsetup.py#L533
                const tuple = Type.list(Type.float(), { len: 3 })
                return Type.union(Type.new({ ...tuple, check: (value) => tuple.check(value) || /^\(.*\)$/s.test(value) && tuple.check(value.slice(1, -1)) }), Type.enum([opts.none]))
            case "hist_bins": {
                // https://github.com/matplotlib/matplotlib/blob/b09aad279b5dcfc49dcf43e0b064eee664ddaf68/lib/matplotlib/rcsetup.py#L765
                return Type.union(Type.int(), parseValidator("validate_floatlist", opts), Type.enum(["auto", "sturges", "fd", "doane", "scott", "rice", "sqrt"], true))
            } case "fontstretch": {
                // https://github.com/matplotlib/matplotlib/blob/6c3412baf6498d070d76ec60ed399329e6de1b6c/lib/matplotlib/rcsetup.py#L390
                return Type.union(Type.int(), Type.enum(['ultra-condensed', 'extra-condensed', 'condensed', 'semi-condensed', 'normal', 'semi-expanded', 'expanded', 'extra-expanded', 'ultra-expanded'], true))
            } case "legend_loc": {
                // https://github.com/matplotlib/matplotlib/blob/d073a3636662ffb165b830f3b88cc3f1f4f40823/lib/matplotlib/rcsetup.py#L741-L783
                return Type.union(
                    Type.enum([
                        "best",
                        "upper right", "upper left", "lower left", "lower right", "right",
                        "center left", "center right", "lower center", "upper center",
                        "center"]),
                    Type.new({
                        label: "int (0 <= x <= 10)",
                        check: (x) => {
                            x = json5Parse(x)
                            return typeof x === "number" && Number.isInteger(x) && 0 <= x && x <= 10
                        },
                    }),
                    Type.list(Type.float(), { len: 2, literal_eval: true }),
                )
            } case "greaterthan_minushalf": {
                return Type.new({
                    label: "float (x > -0.5)",
                    check: (x) => {
                        x = json5Parse(x)
                        return typeof x === "number" && x > -0.5
                    },
                })
            } case "minor_tick_ndivs": {
                return Type.union(Type.enum(["auto"], false), Type.new({
                    label: "int (x >= 0)",
                    check: (x) => {
                        x = json5Parse(x)
                        return typeof x === "number" && Number.isInteger(x) && x >= 0
                    },
                }))
            } case "greaterequal0_lessequal1": {
                return Type.new({
                    label: "float (0 <= x <= 1)",
                    check: (x) => {
                        x = json5Parse(x)
                        return typeof x === "number" && 0 <= x && x <= 1
                    },
                })
            } case "papersize": {
                // NOTE: auto is deprecated
                return Type.enum([
                    "figure", "auto", "letter", "legal", "ledger",
                    ...["a", "b"].flatMap((ab) => Array.from(Array(11).keys(), (i) => `${ab}${i}`)),
                ], false)
            } case "marker": {
                return Type.new({ label: `int | str`, check: any })
            } default:
                // unimplemented
                return Type.new({ label: `${type} (any)`, check: any })
        }
    } else if (matchExpr(r`JoinStyle`, source)) { // JoinStyle
        // https://github.com/matplotlib/matplotlib/blob/b09aad279b5dcfc49dcf43e0b064eee664ddaf68/lib/matplotlib/_enums.py#L82-L82
        return Type.enum(["miter", "round", "bevel"])
    } else if (matchExpr(r`CapStyle`, source)) {
        // https://github.com/matplotlib/matplotlib/blob/b09aad279b5colordcfc49dcf43e0b064eee664ddaf68/lib/matplotlib/_enums.py#L151-L151
        return Type.enum(["butt", "projecting", "round"])
    } else if (matches = matchExpr(r`(\[\s*(?:"[^"]*"|'[^']*')\s*(?:,\s*(?:"[^"]*"|'[^']*')\s*)*\])\s*`, source)) { // ["foo", "bar"]
        try {
            const values = json5.parse(matches[1])
            if (Array.isArray(values) && values.every((v) => typeof v === "string")) {
                return Type.enum(values)
            } else {
                return Type.new({ label: `${source} (any)`, check: any })
            }
        } catch (err) {
            console.log(`Parse error: ${matches[1]}`)
            return Type.new({ label: `${source} (any)`, check: any })
        }
    } else if (matches = matchExpr(r`_listify_validator\(([^\)]+?)(?:,\s*n=(\d+)\s*)?(?:,\s*allow_stringlist=(True|False)\s*)?\)`, source)) { // _listify_validator(validate_int, n=2)
        const len = (matches[2])
        return Type.list(parseValidator(matches[1], opts), { len: len === undefined ? null : +len, allow_stringlist: matches[3] === "True" })
    } else if (matches = matchExpr(r`_ignorecase\(([^\)]+)\)`, source)) {
        return parseValidator(matches[1], opts)
    } else {
        return Type.new({ label: `${source} (any)`, check: any })
    }
}

export const _testing = { trimLineComment, parseDict, parseValidator }
