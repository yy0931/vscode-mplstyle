// @ts-ignore
const vscode = acquireVsCodeApi()

const get = (/** @type {string} */ selector) => {
    const el = document.querySelector(selector)
    if (el === null) { throw new TypeError(`${selector} was not found`) }
    if (!(el instanceof HTMLElement)) { throw new TypeError(`${selector} is not an instance of HTMLElement`) }
    return el
}

const examples = /** @type {HTMLElement & { value: string }} */(get("#examples"))
const custom = /** @type {HTMLElement & { checked: boolean }} */(get("#custom"))

/** @typedef {{ svg?: string, error?: string, version?: string, examples?: string[], exampleSelected?: string, custom?: boolean }} Data */
const updateDOM = () => {
    try {
        const data = /** @type {Data | undefined} */(vscode.getState())
        if (data === undefined) {
            return
        }

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
        if (data.custom) {
            examples.setAttribute("disabled", "")
        } else {
            examples.removeAttribute("disabled")
        }
        custom.checked = data.custom ?? false
    } catch (err) {
        console.error(err)
        get("#error").innerText = err + ""
    }
}

updateDOM()

window.addEventListener("message", ({ data }) => {
    vscode.setState(data)
    updateDOM()
})

window.addEventListener("load", () => {
    examples.addEventListener("change", (ev) => {
        vscode.postMessage({ example: examples.value })
    })
    get("#view-source").addEventListener("click", () => {
        vscode.postMessage({ viewSource: true })
    })
    custom.addEventListener("change", () => {
        vscode.setState({ ...vscode.getState(), custom: custom.checked })
        updateDOM()
        vscode.postMessage({ custom: custom.checked })
    })
})
