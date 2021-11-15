// @ts-ignore
const vscode = acquireVsCodeApi()
const vscodeGetState = () => /** @type {import("./main_process").WebviewState | undefined} */(vscode.getState())
const vscodeSetState = (/** @type {import("./main_process").WebviewState} */ state) => vscode.setState(state)
const vscodePostMessage = (/** @type {import("./main_process").WebviewMessage} */ delta) => vscode.postMessage(delta)

vscodePostMessage({ log: "The script has been started." })

try {
    const get = (/** @type {string} */ selector) => {
        const el = document.querySelector(selector)
        if (el === null) { throw new TypeError(`${selector} was not found`) }
        if (!(el instanceof HTMLElement)) { throw new TypeError(`${selector} is not an instance of HTMLElement`) }
        return el
    }

    const examples = /** @type {HTMLElement & { value: string }} */(get("#examples"))

    const updateDOM = () => {
        try {
            const data = vscodeGetState()
            if (data === undefined) {
                return
            }
            vscodePostMessage({ log: `updateDOM (error = ${data.error}, plot = ${data.activePlot}, plots = ${data.plots}, svg.length = ${data.svg?.length}, uri = ${data.uri}, version = ${data.version})` })

            get("#svg-container").classList.add("loaded")
            get("#svg").innerHTML = data.svg ?? ""
            get("#error").innerText = data.error ?? ""
            get("#version").innerText = data.version ?? ""
            examples.replaceChildren(...(data.plots ?? []).map((v) => {
                const option = /** @type {HTMLOptionElement} */(document.createElement(`vscode-option`))
                option.setAttribute("value", v.path)
                if (v.path === data.activePlot.path) {
                    option.setAttribute("selected", "true")
                }
                option.innerText = v.label
                return option
            }))
        } catch (err) {
            console.error(err)
            vscodePostMessage({ log: "An error occurred at updateDOM(): " + err })
            get("#error").innerText = err + ""
        }
    }

    updateDOM()

    window.addEventListener("message", (/** @type {{ data: import("./main_process").WebviewState }} */{ data }) => {
        vscodePostMessage({ log: "window.onmessage" })
        vscodeSetState(data)
        updateDOM()
    })

    window.addEventListener("load", () => {
        vscodePostMessage({ log: "window.onload" })

        examples.addEventListener("change", (ev) => {
            get("#svg-container").classList.remove("loaded")
            const state = vscodeGetState()
            if (state === undefined) {
                vscodePostMessage({ log: `ERROR: ${examples.value} is selected but state is undefined` })
                return
            }
            const label = state.plots.find((v) => v.path === examples.value)?.label
            if (label === undefined) {
                vscodePostMessage({ log: `ERROR: path ${examples.value} was not found in "plots"` })
                return
            }
            vscodePostMessage({ log: "#examples.onchange", activePlot: { label, path: examples.value } })
        })
        get("#view-source").addEventListener("click", () => {
            vscodePostMessage({ log: "#view-source.onclick", viewSource: true })
        })
        get("#edit").addEventListener("click", () => {
            vscodePostMessage({ log: "#view-source.onclick", edit: true })
        })
    })

    vscodePostMessage({ loaded: true })
} catch (err) {
    vscodePostMessage({ log: "Error: " + err })
    throw err
}
