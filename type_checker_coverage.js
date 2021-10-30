const util = require("util")
const fs = require("fs")
const parseMplSource = require("./src/parse_mpl_source")
const typeChecker = require('./src/type_checker')

const signatures = parseMplSource.rcsetupPy(fs.readFileSync("./matplotlib/rcsetup.py").toString())
/** @type {Map<string, { count: number, signature: import("./src/parse_mpl_source").Signature }>} */
const types = new Map()
for (const type of signatures.values()) {
    const obj = types.get(JSON.stringify(type))
    if (obj !== undefined) {
        obj.count += 1
    }
    types.set(JSON.stringify(type), { signature: type, count: 1 })
}

console.log('# Unimplemented types:')
for (const type of types.values()) {
    if (typeChecker.checkType(type.signature, "") === "NotImplemented") {
        console.log(util.inspect(type))
    }
}
