const json5 = require("json5")

const json5Parse = (/** @type {string} */text) => {
    try {
        return json5.parse(text)
    } catch (err) {
        return err
    }
}

/**
 * Returns [documentation, type checker, completion items]
 * @returns {readonly [string, (value: string) => boolean, readonly string[]]}
 */
const getTypeChecker = (/** @type {import("./mpl_source_parser").Signature} */signature) => {
    switch (signature.kind) {
        case "0 <= x < 1": {
            return ["float (0 <= x < 1)", (x) => {
                x = json5Parse(x)
                return typeof x === "number" && 0 <= x && x < 1
            }, []]
        } case "0 <= x <= 1": {
            return ["float (0 <= x <= 1)", (x) => {
                x = json5Parse(x)
                return typeof x === "number" && 0 <= x && x <= 1
            }, []]
        } case "validate_": {
            // suffixes
            // https://github.com/matplotlib/matplotlib/blob/3a265b33fdba148bb340e743667c4ba816ced928/lib/matplotlib/rcsetup.py#L199
            let type = signature.type
            if (type.endsWith("_or_None")) {
                const child = getTypeChecker({ kind: "validate_", type: type.slice(0, -"_or_None".length) })
                return [`"none" | ${child[0]}`, (x) => child[1](x) || x.toLowerCase() == "none", [...child[2], "none"]]
            }
            if (type.endsWith("list")) {
                // key: val1, val2
                const child = getTypeChecker({ kind: "validate_", type: type.slice(0, -"list".length) })
                return [`List[${child[0]}]`, (x) => x.split(",").map((v) => v.trim()).every((v) => child[1](v)), child[2]]
            }

            // types
            switch (type) {
                case "dpi":
                    // https://github.com/matplotlib/matplotlib/blob/b09aad279b5dcfc49dcf43e0b064eee664ddaf68/lib/matplotlib/rcsetup.py#L163-L163
                    return [`int | "figure"`, (x) => x === "figure" || typeof json5Parse(x) === "number", ["figure"]]
                case "fontsize": {
                    // https://github.com/matplotlib/matplotlib/blob/b09aad279b5dcfc49dcf43e0b064eee664ddaf68/lib/matplotlib/rcsetup.py#L360-L360
                    const values = ['xx-small', 'x-small', 'small', 'medium', 'large', 'x-large', 'xx-large', 'smaller', 'larger']
                    return [`float | ${values.map((x) => JSON.stringify(x)).join(" | ")}`, (x) => values.includes(x) || typeof json5Parse(x) === "number", values]
                } case "fontweight": {
                    // https://github.com/matplotlib/matplotlib/blob/b09aad279b5dcfc49dcf43e0b064eee664ddaf68/lib/matplotlib/rcsetup.py#L378-L378
                    const values = ['ultralight', 'light', 'normal', 'regular', 'book', 'medium', 'roman', 'semibold', 'demibold', 'demi', 'bold', 'heavy', 'extra bold', 'black']
                    return [`float | ${values.map((x) => JSON.stringify(x)).join(" | ")}`, (x) => values.includes(x) || typeof json5Parse(x) === "number", values]
                } case "bbox": {
                    // https://github.com/matplotlib/matplotlib/blob/b09aad279b5dcfc49dcf43e0b064eee664ddaf68/lib/matplotlib/rcsetup.py#L519-L519
                    const values = ["tight", "standard"]
                    return [values.map((x) => JSON.stringify(x)).join(" | "), (x) => values.includes(x), values]
                } case "float":
                    return ["float", (x) => typeof json5Parse(x) === "number", []]
                case "int": {
                    return ["int", (x) => {
                        x = json5Parse(x)
                        return typeof x === "number" && Number.isInteger(x)
                    }, []]
                } case "bool":
                    // https://github.com/matplotlib/matplotlib/blob/3a265b33fdba148bb340e743667c4ba816ced928/lib/matplotlib/rcsetup.py#L142-L142
                    const values = ["t", "y", "yes", "on", "true", "1", "f", "n", "no", "off", "false", "0"]
                    return ["bool", (x) => values.includes(x.toLowerCase()), values]
                case "string":
                    return [`str`, (x) => true, []]
                case "any":
                    return [`any`, (x) => true, []]
                case "cmap":
                case "color":
                case "color_or_auto":
                case "fonttype": // https://github.com/matplotlib/matplotlib/blob/b09aad279b5dcfc49dcf43e0b064eee664ddaf68/lib/matplotlib/rcsetup.py#L224-L224
                    return [`${type} (any)`, (x) => true, []]
                default:
                    // unimplemented
                    return [`${type}`, (x) => true, []]
            }
        } case "enum": {
            const values = signature.values
            return [values.map((x) => JSON.stringify(x)).join(" | "), (x) => values.includes(x), values]
        } case "untyped": {
            return [`${signature.type} (any)`, (x) => true, []]
        } default:
            /** @type {never} */
            const _ = signature
    }
    throw new Error()
}

module.exports = getTypeChecker
