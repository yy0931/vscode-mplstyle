// @ts-ignore
const vscode = acquireVsCodeApi()

const get = (/** @type {string} */ selector) => {
    const el = document.querySelector(selector)
    if (el === null) { throw new TypeError(`${selector} was not found`) }
    if (!(el instanceof HTMLElement)) { throw new TypeError(`${selector} is not an instance of HTMLElement`) }
    return el
}

const examples = /** @type {HTMLElement & { value: string }} */(get("#examples"))

/** @typedef {{ svg?: string, error?: string, version?: string, examples?: string[], exampleSelected?: string }} Data */
const update = (/** @type {Data} */data) => {
    try {
        get("#svg").innerHTML = data.svg ?? ""
        get("#error").innerText = data.error ?? ""
        get("#version").innerText = data.version ?? ""
        examples.replaceChildren(...(data.examples ?? []).map((v) => {
            const option = /** @type {HTMLOptionElement} */(document.createElement(`vscode-option`))
            option.setAttribute("value", v)
            if (v === data.exampleSelected) {
                option.setAttribute("selected", "true")
            }
            option.innerText = v
            return option
        }))
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

window.addEventListener("load", () => {
    examples.addEventListener("change", (ev) => {
        vscode.postMessage({ exampleSelected: examples.value })
    })
    get("#view-source").addEventListener("click", () => {
        vscode.postMessage({ viewSource: true })
    })
})
