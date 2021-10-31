const getType = require('./src/typing')
const mplSourceParser = require('./src/mpl_source_parser')
const util = require('util')

const { signatures, cyclerKwargs } = mplSourceParser.readAll(__dirname, undefined)
for (const target of [signatures, cyclerKwargs]) {
    for (const [k, v] of target.entries()) {
        if (getType(v).label.includes("any") && !("type" in v && v.type.includes("any"))) {
            console.log(`${k}: ${util.inspect(v, true, null, true)}`)
        }
    }
}
