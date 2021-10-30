const json5 = require("json5")

const json5Parse = (/** @type {string} */text) => {
    try {
        return json5.parse(text)
    } catch (err) {
        return err
    }
}

/** @returns {import("./parse_mpl_source").Signature} */
const resolveAlias = (/** @type {import("./parse_mpl_source").Signature} */signature) => {
    if (signature.kind === "validate_" && signature.type === "bbox") {
        return { kind: "enum", values: ["tight", "standard"] }  // https://github.com/matplotlib/matplotlib/blob/b09aad279b5dcfc49dcf43e0b064eee664ddaf68/lib/matplotlib/rcsetup.py#L519-L519
    }
    return signature
}

/** @returns {boolean | "NotImplemented"} */
exports.checkType = (/** @type {import("./parse_mpl_source").Signature} */signature, /** @type {string} */value) => {
    signature = resolveAlias(signature)
    switch (signature.kind) {
        case "0 <= x < 1": {
            const x = json5Parse(value)
            return typeof x === "number" && 0 <= x && x < 1
        } case "0 <= x <= 1": {
            const x = json5Parse(value)
            return typeof x === "number" && 0 <= x && x <= 1
        } case "validate_": {
            // suffixes
            // https://github.com/matplotlib/matplotlib/blob/3a265b33fdba148bb340e743667c4ba816ced928/lib/matplotlib/rcsetup.py#L199
            let type = signature.type
            if (type.endsWith("_or_None")) {
                if (value.toLowerCase() == "none") {
                    return true
                }
                type = type.slice(0, -"_or_None".length)
            }
            if (type.endsWith("list")) {
                // key: val1, val2
                type = type.slice(0, -"list".length)
                return value.split(",").map((v) => v.trim()).every((v) => this.checkType({ kind: "validate_", type }, v))
            }

            // types
            switch (type) {
                case "dpi":
                    // https://github.com/matplotlib/matplotlib/blob/b09aad279b5dcfc49dcf43e0b064eee664ddaf68/lib/matplotlib/rcsetup.py#L163-L163
                    return value === "figure" || typeof json5Parse(value) === "number"
                case "fontsize":
                    // https://github.com/matplotlib/matplotlib/blob/b09aad279b5dcfc49dcf43e0b064eee664ddaf68/lib/matplotlib/rcsetup.py#L360-L360
                    return ['xx-small', 'x-small', 'small', 'medium', 'large', 'x-large', 'xx-large', 'smaller', 'larger'].includes(value) || typeof json5Parse(value) === "number"
                case "fontweight":
                    // https://github.com/matplotlib/matplotlib/blob/b09aad279b5dcfc49dcf43e0b064eee664ddaf68/lib/matplotlib/rcsetup.py#L378-L378
                    return ['ultralight', 'light', 'normal', 'regular', 'book', 'medium', 'roman', 'semibold', 'demibold', 'demi', 'bold', 'heavy', 'extra bold', 'black'].includes(value) || typeof json5Parse(value) === "number"
                case "float":
                    return typeof json5Parse(value) === "number"
                case "int": {
                    const x = json5Parse(value)
                    return typeof x === "number" && Number.isInteger(x)
                } case "bool":
                    // https://github.com/matplotlib/matplotlib/blob/3a265b33fdba148bb340e743667c4ba816ced928/lib/matplotlib/rcsetup.py#L142-L142
                    return ["t", "y", "yes", "on", "true", "1", "f", "n", "no", "off", "false", "0"].includes(value.toLowerCase())
                case "string":
                case "any":
                case "cmap":
                case "color":
                case "color_or_auto":
                case "fonttype": // https://github.com/matplotlib/matplotlib/blob/b09aad279b5dcfc49dcf43e0b064eee664ddaf68/lib/matplotlib/rcsetup.py#L224-L224
                    return true
                default:
                    return "NotImplemented"
            }
        } case "enum": {
            return signature.values.includes(value)
        } case "untyped": {
            return true
        } default:
            /** @type {never} */
            const _ = signature
    }
    throw new Error()
}


exports.reprType = (/** @type {import("./parse_mpl_source").Signature} */signature) => {
    signature = resolveAlias(signature)
    switch (signature.kind) {
        case "validate_":
            if (signature.type.endsWith("_or_None")) {
                return `Optional[${signature.type.slice(0, -"_or_None".length)}]`
            } else if (signature.type.endsWith("list")) {
                return `Tuple[${signature.type.slice(0, -"list".length)}, ...]`
            } else {
                return signature.type
            }
        case "0 <= x < 1": return `float (${signature.kind})`
        case "0 <= x <= 1": return `float (${signature.kind})`
        case "enum": return `Literal[${signature.values.map((v) => JSON.stringify(v)).join(", ")}]`
        case "untyped": return `unknown: ${signature.type}`
        default:
            /** @type {never} */
            const _ = signature
    }
}
