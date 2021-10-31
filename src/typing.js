const json5 = require("json5")

const json5Parse = (/** @type {string} */text) => {
    try {
        return json5.parse(text)
    } catch (err) {
        return err
    }
}

/**
 * @returns {{ readonly label: string, readonly check: (value: string) => boolean, readonly constants: readonly string[], readonly color: boolean }}
 */
const getTypeChecker = (/** @type {import("./mpl_source_parser").Signature} */signature) => {
    /** @type {{ readonly constants: readonly string[], readonly color: boolean }} */
    const defaults = { constants: [], color: false }

    switch (signature.kind) {
        case "0 <= x < 1": {
            return {
                ...defaults,
                label: "float (0 <= x < 1)",
                check: (x) => {
                    x = json5Parse(x)
                    return typeof x === "number" && 0 <= x && x < 1
                },
            }
        } case "0 <= x <= 1": {
            return {
                ...defaults,
                label: "float (0 <= x <= 1)",
                check: (x) => {
                    x = json5Parse(x)
                    return typeof x === "number" && 0 <= x && x <= 1
                },
            }
        } case "fixed_length_list": {
            const child = getTypeChecker(signature.child)
            return {
                label: `list[${child.label}] (len=${signature.len})`,
                check: (x) => x.split(",").length === signature.len && x.split(",").map((v) => v.trim()).every((v) => child.check(v)),
                constants: child.constants,
                color: child.color,
            }
        } case "validate_": {
            // suffixes
            // https://github.com/matplotlib/matplotlib/blob/3a265b33fdba148bb340e743667c4ba816ced928/lib/matplotlib/rcsetup.py#L199
            let type = signature.type
            if (type.endsWith("_or_None")) {
                const child = getTypeChecker({ kind: "validate_", type: type.slice(0, -"_or_None".length) })
                return {
                    label: `"none" | ${child.label}`,
                    check: (x) => child.check(x) || x.toLowerCase() == "none",
                    constants: [...child.constants ?? [], "none"],
                    color: child.color,
                }
            }
            if (type.endsWith("list")) {
                // key: val1, val2
                const child = getTypeChecker({ kind: "validate_", type: type.slice(0, -"list".length) })
                return {
                    label: `list[${child.label}]`,
                    check: (x) => x.trim() === "" || x.split(",").map((v) => v.trim()).every((v) => child.check(v)),
                    constants: child.constants,
                    color: child.color,
                }
            }

            // types
            const boolKeywords = ["t", "y", "yes", "on", "true", "1", "f", "n", "no", "off", "false", "0"]
            switch (type) {
                case "linestyle":
                    // https://github.com/matplotlib/matplotlib/blob/b09aad279b5dcfc49dcf43e0b064eee664ddaf68/lib/matplotlib/rcsetup.py#L434-L434
                    const values = ["-", "--", "-.", ":", " ", "solid", "dashed", "dashdot", "dotted", "none"]
                    return { ...defaults, label: '(offset (int), list["on" | "off"]) (eval) | list["on" | "off"] (eval) | ' + values.map((v) => JSON.stringify(v)).join(" | "), constants: values, check: (x) => true }
                case "dpi":
                    // https://github.com/matplotlib/matplotlib/blob/b09aad279b5dcfc49dcf43e0b064eee664ddaf68/lib/matplotlib/rcsetup.py#L163-L163
                    return { ...defaults, label: `int | "figure"`, check: (x) => x === "figure" || typeof json5Parse(x) === "number", constants: ["figure"] }
                case "fontsize": {
                    // https://github.com/matplotlib/matplotlib/blob/b09aad279b5dcfc49dcf43e0b064eee664ddaf68/lib/matplotlib/rcsetup.py#L360-L360
                    const values = ['xx-small', 'x-small', 'small', 'medium', 'large', 'x-large', 'xx-large', 'smaller', 'larger']
                    return { ...defaults, label: `float | ${values.map((x) => JSON.stringify(x)).join(" | ")}`, check: (x) => values.includes(x) || typeof json5Parse(x) === "number", constants: values }
                } case "fontweight": {
                    // https://github.com/matplotlib/matplotlib/blob/b09aad279b5dcfc49dcf43e0b064eee664ddaf68/lib/matplotlib/rcsetup.py#L378-L378
                    const values = ['ultralight', 'light', 'normal', 'regular', 'book', 'medium', 'roman', 'semibold', 'demibold', 'demi', 'bold', 'heavy', 'extra bold', 'black']
                    return { ...defaults, label: `float | ${values.map((x) => JSON.stringify(x)).join(" | ")}`, check: (x) => values.includes(x) || typeof json5Parse(x) === "number", constants: values }
                } case "bbox": {
                    // https://github.com/matplotlib/matplotlib/blob/b09aad279b5dcfc49dcf43e0b064eee664ddaf68/lib/matplotlib/rcsetup.py#L519-L519
                    const values = ["tight", "standard"]
                    return { ...defaults, label: values.map((x) => JSON.stringify(x)).join(" | "), check: (x) => values.includes(x), constants: values }
                } case "float":
                    return { ...defaults, label: "float", check: (x) => typeof json5Parse(x) === "number" }
                case "int": {
                    return {
                        ...defaults,
                        label: "int",
                        check: (x) => {
                            x = json5Parse(x)
                            return typeof x === "number" && Number.isInteger(x)
                        },
                    }
                } case "bool":
                    // https://github.com/matplotlib/matplotlib/blob/3a265b33fdba148bb340e743667c4ba816ced928/lib/matplotlib/rcsetup.py#L142-L142
                    return { ...defaults, label: "bool", check: (x) => boolKeywords.includes(x.toLowerCase()), constants: boolKeywords }
                case "string":
                    return { ...defaults, label: `str`, check: (x) => true }
                case "any":
                    return { ...defaults, label: `any`, check: (x) => true }
                case "cmap":
                case "fonttype":
                    // https://github.com/matplotlib/matplotlib/blob/b09aad279b5dcfc49dcf43e0b064eee664ddaf68/lib/matplotlib/rcsetup.py#L224-L224
                    return { ...defaults, label: `${type} (str)`, check: (x) => true }
                case "pathlike":
                    return { ...defaults, label: `${type} (str)`, check: (x) => true }
                case "axisbelow":
                    // https://github.com/matplotlib/matplotlib/blob/b09aad279b5dcfc49dcf43e0b064eee664ddaf68/lib/matplotlib/rcsetup.py#L152
                    return { ...defaults, label: `"line" | bool`, check: (x) => x === 'line' || boolKeywords.includes(x.toLowerCase()), constants: ['line', ...boolKeywords] }
                case "color":
                    // https://github.com/matplotlib/matplotlib/blob/b09aad279b5dcfc49dcf43e0b064eee664ddaf68/lib/matplotlib/rcsetup.py#L312-L312
                    return { ...defaults, label: `color`, check: (x) => true, color: true }
                case "color_or_auto":
                    // https://github.com/matplotlib/matplotlib/blob/b09aad279b5dcfc49dcf43e0b064eee664ddaf68/lib/matplotlib/rcsetup.py#L277-L277
                    return { ...defaults, label: `color | "auto"`, check: (x) => true, constants: ["auto"], color: true }
                case "color_or_inherit":
                    // https://github.com/matplotlib/matplotlib/blob/b09aad279b5dcfc49dcf43e0b064eee664ddaf68/lib/matplotlib/rcsetup.py#L269-L269
                    return { ...defaults, label: `color | "inherit"`, check: (x) => true, constants: ["inherit"], color: true }
                case "color_or_linecolor":
                    // https://github.com/matplotlib/matplotlib/blob/b09aad279b5dcfc49dcf43e0b064eee664ddaf68/lib/matplotlib/rcsetup.py#L289-L289
                    return { ...defaults, label: `color | "linecolor" | "markerfacecolor" | "markeredgecolor"`, check: (x) => true, constants: ["linecolor", "markerfacecolor", "markeredgecolor"], color: true }
                case "cycler":
                    // https://github.com/matplotlib/matplotlib/blob/b09aad279b5dcfc49dcf43e0b064eee664ddaf68/lib/matplotlib/rcsetup.py#L704-L704
                    return { ...defaults, label: `cycler (eval)`, check: (x) => true }
                case "whiskers":
                    // https://github.com/matplotlib/matplotlib/blob/b09aad279b5dcfc49dcf43e0b064eee664ddaf68/lib/matplotlib/rcsetup.py#L411-L411
                    return { ...defaults, label: `list[float] (len=2) | float`, check: (x) => x.split(',').length === 2 && x.split(',').map((v) => v.trim()).every((v) => typeof json5Parse(v) === "number") || typeof json5Parse(x) === "number" }
                case "fillstyle": {
                    // https://github.com/matplotlib/matplotlib/blob/b09aad279b5dcfc49dcf43e0b064eee664ddaf68/lib/matplotlib/rcsetup.py#L475-L475
                    const values = ["full", "left", "right", "bottom", "top", "none"]
                    return { ...defaults, label: values.map((v) => JSON.stringify(v)).join(" | "), check: (x) => values.includes(x) }
                } case "sketch":
                    // https://github.com/matplotlib/matplotlib/blob/b09aad279b5dcfc49dcf43e0b064eee664ddaf68/lib/matplotlib/rcsetup.py#L534-L534
                    return { ...defaults, label: `list[float] (len=3) | "none"`, check: (x) => x.toLowerCase() === "none" || x.split(",").length === 3 && x.split(",").map((v) => v.trim()).every((v) => typeof json5Parse(v) === "number") }
                case "hist_bins": {
                    // https://github.com/matplotlib/matplotlib/blob/b09aad279b5dcfc49dcf43e0b064eee664ddaf68/lib/matplotlib/rcsetup.py#L766-L766
                    const values = ["auto", "sturges", "fd", "doane", "scott", "rice", "sqrt"]
                    return { ...defaults, label: "int | list[float] | " + values.map((v) => JSON.stringify(v)).join(" | "), check: (x) => values.includes(x) || x === "" || x.split(",").map((v) => v.trim()).every((v) => typeof json5Parse(v) === "number") || typeof json5Parse(x) === "number" }
                } default:
                    // unimplemented
                    return { ...defaults, label: `${type} (any)`, check: (x) => true }
            }
        } case "enum": {
            const values = signature.values
            return { ...defaults, label: values.map((x) => JSON.stringify(x)).join(" | "), check: (x) => values.includes(x), constants: values }
        } case "untyped": {
            return { ...defaults, label: `${signature.type} (any)`, check: (x) => true }
        } default:
            /** @type {never} */
            const _ = signature
    }
    throw new Error()
}

module.exports = getTypeChecker

