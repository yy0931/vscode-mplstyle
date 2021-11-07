// @ts-ignore
const vscode = acquireVsCodeApi()

const get = (/** @type {string} */ selector) => {
    const el = document.querySelector(selector)
    if (el === null) { throw new TypeError(`${selector} was not found`) }
    if (!(el instanceof HTMLElement)) { throw new TypeError(`${selector} is not an instance of HTMLElement`) }
    return el
}

const examples = /** @type {HTMLElement & { value: string }} */(get("#examples"))

const updateDOM = () => {
    try {
        const data = /** @type {import("./main_process").WebviewState | undefined} */(vscode.getState())
        if (data === undefined) {
            return
        }

        get("#svg").innerHTML = data.svg ?? ""
        get("#error").innerText = data.error ?? ""
        get("#version").innerText = data.version ?? ""
        examples.replaceChildren(...(data.examples ?? []).map((v) => {
            const option = /** @type {HTMLOptionElement} */(document.createElement(`vscode-option`))
            option.setAttribute("value", v)
            if (v === data.example) {
                option.setAttribute("selected", "true")
            }
            option.innerText = v
            return option
        }))
    } catch (err) {
        console.error(err)
        get("#error").innerText = err + ""
    }
}

updateDOM()

const vscodeSetState = (/** @type {import("./main_process").WebviewState} */ state) => vscode.setState(state)
const vscodePostMessage = (/** @type {import("./main_process").WebviewMessage} */ delta) => vscode.postMessage(delta)

window.addEventListener("message", (/** @type {{ data: import("./main_process").WebviewState }} */{ data }) => {
    vscodeSetState(data)
    updateDOM()
})

window.addEventListener("load", () => {
    examples.addEventListener("change", (ev) => { vscodePostMessage({ example: examples.value }) })
    get("#view-source").addEventListener("click", () => { vscodePostMessage({ viewSource: true }) })
})
