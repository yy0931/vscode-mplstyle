const preview = require("./preview/main_process")
const vscode = require("vscode")
const Logger = require("./logger")
const browser = require("./extension_browser")

exports.activate = async (/** @type {vscode.ExtensionContext} */context) => {
    const logger = new Logger()
    context.subscriptions.push(new preview.Previewer(context.extensionUri, context.extensionPath, logger))
    await browser.activate(context)
}

exports.deactivate = () => {
    browser.deactivate()
}
