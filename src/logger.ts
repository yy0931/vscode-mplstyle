import vscode from "vscode"

export default class Logger {
    #outputChannel

    constructor() {
        this.#outputChannel = vscode.window.createOutputChannel("mplstyle")
    }

    dispose() {
        this.#outputChannel.dispose()
    }

    async try<T>(f: () => Promise<T>): Promise<T | undefined> {
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

    trySync<T>(f: () => T): T | undefined {
        try {
            const out = f()
            if (out instanceof Promise) {
                this.warning(`The function passed to trySync() returned a Promise`)
            }
            return out
        } catch (err) {
            this.error(err instanceof Error ? err : err + "")
        }
    }

    info(message: string) {
        this.#outputChannel.appendLine(`[Info] ${message}`)
    }
    warning(message: string) {
        this.#outputChannel.appendLine(`[Warning]${message}`)
    }
    error(message: string | Error) {
        if (message instanceof Error && message.stack !== undefined) {
            message = message.stack
        }
        this.#outputChannel.appendLine(`[Error] ${message}`)
        vscode.window.showErrorMessage(`mplstyle: ${message}`)
    }
}
