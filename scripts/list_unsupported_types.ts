import { parseMplSource } from "../src/rcsetup-parser"
import path from "path"
import fs from "fs/promises"

const isNOENT = (err: unknown) => err instanceof Error && (err as any).code == "ENOENT"

const main = async () => {
    const { params, cyclerProps, errors } = await parseMplSource(path.dirname(__dirname), undefined, path.join, (filepath) => fs.readFile(filepath).then((v) => v.toString()), isNOENT)
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
