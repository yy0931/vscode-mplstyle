const fs = require("fs")
const path = require("path")
const vscode = require("vscode")
const which = require("which")

/** @returns {string | null} */
exports.findPythonExecutable = () => {
    for (const pythonPath of [
        which.sync("python3", { nothrow: true }),
        which.sync("py", { nothrow: true }),      // Windows
        which.sync("python", { nothrow: true }),  // May be Python 2
    ]) {
        if (pythonPath !== null) {
            return pythonPath
        }
    }
    return null
}

exports.getHTML = (/** @type {vscode.WebviewPanel} */webviewPanel, /** @type {string} */extensionPath) => {
    return fs.readFileSync(path.join(extensionPath, "src", "preview", "webview.html")).toString()
        .replaceAll("{{cspSource}}", webviewPanel.webview.cspSource)
        .replaceAll("{{webviewUIToolkit}}", webviewPanel.webview.asWebviewUri(vscode.Uri.file(path.join(extensionPath, "node_modules", "@vscode", "webview-ui-toolkit", "dist", "toolkit.js"))).toString())
        .replaceAll("{{webview.js}}", webviewPanel.webview.asWebviewUri(vscode.Uri.file(path.join(extensionPath, "src", "preview", "webview.js"))).toString())
}
