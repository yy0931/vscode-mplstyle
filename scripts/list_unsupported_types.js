const parseMplSource = require('../src/mpl_source_parser')
const path = require("path")
const fs = require("fs").promises

const main = async () => {
    const { params, cyclerProps, errors } = await parseMplSource(path.dirname(__dirname), undefined, path.join, (filepath) => fs.readFile(filepath).then((v) => v.toString()))
    if (errors.length > 0) {
        console.error(errors)
        process.exit(1)
    }

    for (const target of [params, cyclerProps]) {
        for (const [k, v] of target.entries()) {
            if (v.label.includes("(any)")) {
                console.log(`${k}: ${v.label}`)
            }
        }
    }
}

main().catch((err) => { console.error(err) })
