const parseMplSource = require('../src/mpl_source_parser')
const path = require('path')

const { params, cyclerProps, errors } = parseMplSource(path.dirname(__dirname), undefined)
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
