/**
 * ```
 * testInputOutput(f)([[a, b], c]) == test(JSON.stringify([a, b]), () => { expect(f(a, b)).toEqual(c) })
 * ```
 * @type {<T extends unknown[], R>(f: (...args: T) => R) => (...cases: readonly (readonly [T, R])[]) => void}
 */
exports.testInputOutput = (f) => (...cases) => {
    for (const [input, output] of cases) {
        test(JSON.stringify(input), () => { expect(f(...input)).toEqual(output) })
    }
}

/**
 * ```
 * testInputOutputWithTitle(f)({ title: [[a, b], c] }) == test(title, () => { expect(f(a, b)).toEqual(c) })
 * ```
 * @type {<T extends unknown[], R>(f: (...args: T) => R) => (cases: Readonly<Record<string, readonly [T, R]>>) => void}
 */
exports.testInputOutputWithTitle = (f) => (cases) => {
    for (const [title, [input, output]] of Object.entries(cases)) {
        test(title, () => { expect(f(...input)).toEqual(output) })
    }
}
