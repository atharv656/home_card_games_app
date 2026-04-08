/** Persisted socket rejoin credentials (survives refresh; used after reconnect). */
const STORAGE_KEY = 'cardGameRejoinSession'

export type CardGameRejoinSession = {
  roomId: string
  rejoinToken: string
  playerName: string
}

export function saveRejoinSession(session: CardGameRejoinSession): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session))
  } catch {
    /* ignore quota / private mode */
  }
}

export function loadRejoinSession(): CardGameRejoinSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as CardGameRejoinSession
    if (parsed?.roomId && parsed?.rejoinToken) return parsed
    return null
  } catch {
    return null
  }
}

export function clearRejoinSession(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* ignore */
  }
}
