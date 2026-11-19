// localStorage that never throws: it can be unavailable (private mode, blocked storage, full).

export function readJSON<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    return raw === null ? null : (JSON.parse(raw) as T)
  } catch {
    return null
  }
}

export function writeJSON(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Not saved locally; the server save still works
  }
}

export function removeItem(key: string): void {
  try {
    localStorage.removeItem(key)
  } catch {
    // Nothing to do
  }
}
