const vscode = require("vscode")

class Logger {
    #outputChannel

    constructor() {
        this.#outputChannel = vscode.window.createOutputChannel("mplstyle")
    }

    dispose() {
        this.#outputChannel.dispose()
    }

    /** @type {<T>(f: () => Promise<T>) => Promise<T | undefined>} */
    async try(f) {
        try {
            return await f()
        } catch (err) {
            if (err instanceof Error && err.stack !== undefined) {
                this.error(err.stack)
            } else {
                this.error(err + "")
            }
        }
    }

    /** @type {<T>(f: () => T) => T | undefined} */
    trySync(f) {
        try {
            const out = f()
            if (out instanceof Promise) {
                this.warning(`the argument of trySync() returned a Promise`)
            }
            return out
        } catch (err) {
            if (err instanceof Error && err.stack !== undefined) {
                this.error(err.stack)
            } else {
                this.error(err + "")
            }
        }
    }

    info(/** @type {string} */ message) {
        this.#outputChannel.appendLine(`[Info] ${message}`)
    }
    warning(/** @type {string} */message) {
        this.#outputChannel.appendLine(`[Warning]${message}`)
    }
    error(/** @type {string} */message) {
        this.#outputChannel.appendLine(`[Error] ${message}`)
        vscode.window.showErrorMessage(`mplstyle: ${message}`)
    }
}

module.exports = Logger