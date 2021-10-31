const getType = require('./src/typing')
const fs = require('fs')
const mplSourceParser = require('./src/mpl_source_parser')
const util = require('util')

const signatures = mplSourceParser.parseRcsetupPy(fs.readFileSync("./matplotlib/rcsetup.py").toString())
for (const [k, v] of signatures.entries()) {
    if (getType(v).label.includes("any") && !("type" in v && v.type.includes("any"))) {
        console.log(`${k}: ${util.inspect(v, true, null, true)}`)
    }
}
