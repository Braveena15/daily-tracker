export { cn } from "cn"

// Every list row gets a stable key so React keeps inputs in place when rows are removed.
let keyCounter = 0
export const newKey = () => `row-${++keyCounter}`
