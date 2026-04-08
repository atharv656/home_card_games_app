/** Persisted display name (no auth — used for reclaiming a disconnected seat by name). */
const STORAGE_KEY = 'cardGamePlayerName'

export function loadPlayerName(): string {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    return typeof v === 'string' ? v.trim() : ''
  } catch {
    return ''
  }
}

export function savePlayerName(name: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, name.trim())
  } catch {
    /* ignore */
  }
}
