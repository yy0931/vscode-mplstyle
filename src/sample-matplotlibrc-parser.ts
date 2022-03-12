import * as parseMplstyle from "./mplstyle-parser"

/**
 * Parses [matplotlib/lib/matplotlib/mpl-data/matplotlibrc](https://github.com/matplotlib/matplotlib/blob/b9ae51ca8c5915fe7accf712a504e08e35b2f69d/lib/matplotlib/mpl-data/matplotlibrc#L1)
 */
export default (content: string) => {
    type LazyComment = [commentStart: string[], subheading: (() => string[]), section: string[]]
    const entries: Map<string, { exampleValue: string; comment: LazyComment }> = new Map()
    let lastKey: string | null = null

    /**
     * ```
     * ## **********
     * ## * title  *
     * ## **********
     * ## body
     * ```
     */
    let sectionHeader: null | { title: string; body: string } = null
    let sectionHeaderBuf: null | { title: string; body: string } = null

    /**
     * ```
     * # body1
     * # body2
     * target1: value1
     * target2: value2
     * ```
     */
    let subheading: { body: string[]; target: string[] } = { body: [], target: [] }

    const lines = content.replaceAll("\r", "").split("\n")
    for (let i = 0; i < lines.length; i++) {
        let line = lines[i]

        // Uncomment the line
        if (line.startsWith("#")) { line = line.slice(1) }  // `#webagg.port: 8988`
        if (/^#\w/.test(line)) { line = line.slice(1) }  // `##backend: Agg`

        if (line.startsWith("# *******")) { continue }

        if (sectionHeaderBuf === null) {
            if (line.startsWith("# * ")) {
                sectionHeaderBuf = { title: line.slice("# * ".length, -1).trim(), body: "" }
                subheading = { body: [], target: [] }
            } else {
                // Skip empty lines
                if (line.trim() === "") {
                    subheading = { body: [], target: [] }
                    continue
                }

                // Parse small subheadings
                // ```
                // # comment1
                // # comment2
                // key1: value1
                // key2: value2
                // ```
                if (/^# /.test(line)) {
                    if (subheading.target.length > 0) {
                        subheading = { body: [], target: [] }
                    }
                    subheading.body.push(line.slice("# ".length))
                    continue
                }

                // Parse multi-line floating comments
                // ```
                // key: value  # a
                //             # b
                // ```
                if (/^ +#/.test(line) && lastKey !== null) {
                    const lastItem = entries.get(lastKey)
                    if (lastItem !== undefined) {
                        lastItem.comment[0].push(line.split("#", 2)[1].trimStart())
                    }
                    continue
                }

                if (/^[# ]/.test(line)) {
                    subheading = { body: [], target: [] }
                    continue
                }

                // Parse the line as a key-value pair
                // ```
                // key: value
                // ```
                const pair = parseMplstyle.parseLine(line)
                if (pair === null) { continue }
                if (pair.value === null) {
                    console.log(`Parse error: ${line}`)
                    continue
                }

                const comment: LazyComment = [[], () => [], []]
                if (pair.commentStart !== null) {
                    comment[0] = ([line.slice(pair.commentStart + 1).trim()])
                }
                const subheading2 = subheading
                comment[1] = () =>
                    subheading2.body.length === 0
                        ? []
                        : [...subheading2.body, ...(subheading2.target.length <= 1 ? [] : ["", ...subheading2.target.map((v) => `- ${v}`)])]
                subheading.target.push(pair.key.text)
                if (sectionHeader !== null) {
                    comment[2] = [`#### ${sectionHeader.title}`, sectionHeader.body]
                }

                entries.set(pair.key.text, {
                    exampleValue: pair.value.text,
                    comment,
                })
                lastKey = pair.key.text
            }
        } else {
            if (line.startsWith("# ")) {
                sectionHeaderBuf.body += `${line.slice("# ".length)}\n`
            } else {
                if (sectionHeaderBuf.body === "") {
                    sectionHeader = null
                } else {
                    sectionHeader = sectionHeaderBuf
                }
                sectionHeaderBuf = null
                i--
            }
        }
    }
    return new Map(Array.from(entries.entries()).map(([k, v]) => [k, {
        exampleValue: v.exampleValue,
        comment: v.comment.map((v) => Array.isArray(v) ? v : v()).filter((v) => v.length > 0).map((v, i): string[] => [...(i === 0 ? [] : ["", "---"]), ...v]).flat().join("\n"),
    }]))
}
