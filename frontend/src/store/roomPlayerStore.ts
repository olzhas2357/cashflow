import { create } from 'zustand'

// Guest identity within a specific room — survives F5 via localStorage.
// The host identifies themselves via hostAuthStore's JWT instead; a guest
// has no account, so this local {code, seat} pair is how the UI highlights
// "you" in the roster (not a security boundary — GET /api/rooms/:code never
// returns anyone's player_token).
type RoomPlayerState = {
  code: string | null
  seat: number | null
  name: string | null
  setGuest: (code: string, seat: number, name: string) => void
  clearGuest: () => void
}

const STORAGE_KEY = 'cashflow_room_player'

type Stored = { code: string; seat: number; name: string }

function load(): Stored | null {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as Stored
  } catch {
    return null
  }
}

const initial = load()

export const useRoomPlayerStore = create<RoomPlayerState>((set) => ({
  code: initial?.code ?? null,
  seat: initial?.seat ?? null,
  name: initial?.name ?? null,
  setGuest: (code, seat, name) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ code, seat, name }))
    set({ code, seat, name })
  },
  clearGuest: () => {
    localStorage.removeItem(STORAGE_KEY)
    set({ code: null, seat: null, name: null })
  },
}))
