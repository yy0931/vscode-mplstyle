const { parseMplSource } = require("./parse-rcsetup.py")

exports.parseMplSource = parseMplSource

exports.key = (/** @type {string} */key, /** @type {{
    mpl: Pick<Awaited<ReturnType<typeof parseMplSource>>, "params" | "documentation">
    images: Map<string, string>
    showImage: boolean
}} */options) => {
    const type = options.mpl.params.get(key)
    if (type === undefined) {
        return null
    }

    let documentation = ''
    const image = options.images.get(key)
    if (options.showImage && image !== undefined) {
        documentation += `![${key}](${image}|height=150)\n\n---\n`
    }
    documentation += (options.mpl.documentation.get(key)?.comment ?? "") + "\n\n---\n#### Example\n"
    documentation += '```mplstyle\n' + `${key}: ${options.mpl.documentation.get(key)?.exampleValue ?? ""}\n` + '```\n'
    return {
        detail: {
            plaintext: `${key}: ${type.label}`,
            md: '```python\n' + `${key}: ${type.label}\n` + '```\n'
        },
        documentation,
    }
}

exports.cycler = (/** @type {Pick<Awaited<ReturnType<typeof parseMplSource>>, "cyclerProps">} */mpl) => ({
    detail: {
        form2: {
            param1: `label: ${Array.from(mpl.cyclerProps.keys()).map((v) => JSON.stringify(v)).join(" | ")}`,
            param2: `values: list`,
        },
        form3: {
            kwargs: Array.from(mpl.cyclerProps.entries()).map(([k, v]) => `${k}: ${v.shortLabel}`),
        }
    },
    documentation: "Creates a `cycler.Cycler` which cycles over one or more colors simultaneously.",
})
