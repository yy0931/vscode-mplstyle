// @ts-ignore
const vscode = acquireVsCodeApi()

const get = (/** @type {string} */ selector) => {
    const el = document.querySelector(selector)
    if (el === null) { throw new TypeError(`${selector} was not found`) }
    if (!(el instanceof HTMLElement)) { throw new TypeError(`${selector} is not an instance of HTMLElement`) }
    return el
}

/** @typedef {{ svg?: string, error?: string, python?: { version: string }, matplotlib?: { version: string } }} Data */
const update = (/** @type {Data} */data) => {
    try {
        get("#svg").innerHTML = data.svg ?? ""
        get("#error").innerText = data.error ?? ""
        get("#version").innerText = `Python ${data.python?.version}, Matplotlib ${data.matplotlib?.version}`
    } catch (err) {
        get("#error").innerText = err + ""
    }
}

const prevData = /** @type {Data | undefined} */(vscode.getState())
if (prevData) {
    update(prevData)
}
window.addEventListener("message", ({ data }) => {
    update(data)
    vscode.setState(data)
})

document.addEventListener("load", () => {
    const sel = /** @type {HTMLInputElement} */(get("#script"))
    sel.addEventListener("change", (ev) => {
        vscode.postMessage({ script: sel.value })
    })
})
