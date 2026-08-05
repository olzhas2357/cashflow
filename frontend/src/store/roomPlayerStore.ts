import { create } from 'zustand'

// This player's identity within a specific room — survives F5 via
// localStorage. Used by BOTH host and guest (Этап 2: the host uses the same
// player_token bridge into the game as a guest does) — hostAuthStore's JWT
// is only for room-management calls (create/start), not gameplay identity.
// `seat`/`name` are only for UI ("you" highlighting); the server never
// returns anyone's player_token via GET /api/rooms/:code, so `playerToken`
// here is this browser's own copy of a secret it was handed directly.
type RoomPlayerState = {
  code: string | null
  seat: number | null
  name: string | null
  playerToken: string | null
  setPlayer: (code: string, seat: number, name: string, playerToken: string) => void
  clearPlayer: () => void
}

const STORAGE_KEY = 'cashflow_room_player'

type Stored = { code: string; seat: number; name: string; playerToken: string }

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
  playerToken: initial?.playerToken ?? null,
  setPlayer: (code, seat, name, playerToken) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ code, seat, name, playerToken }))
    set({ code, seat, name, playerToken })
  },
  clearPlayer: () => {
    localStorage.removeItem(STORAGE_KEY)
    set({ code: null, seat: null, name: null, playerToken: null })
  },
}))
