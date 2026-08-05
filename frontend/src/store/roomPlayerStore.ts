import { create } from 'zustand'

// This player's identity within a specific room — survives F5 via
// localStorage. Used by BOTH host and guest (Этап 2: the host uses the same
// player_token bridge into the game as a guest does) — hostAuthStore's JWT
// is only for room-management calls (create/start), not gameplay identity.
// `seat`/`name` are only for UI ("you" highlighting); the server never
// returns anyone's player_token via GET /api/rooms/:code, so `playerToken`
// here is this browser's own copy of a secret it was handed directly.
//
// Keyed by room code (not a single slot): a host can hold up to 3 active
// rooms at once (design/Task-Testing.md's MaxActiveRoomsPerHost), so a
// single-slot store would overwrite room A's token the moment room B is
// created — the exact bug that made the profession picker vanish for a
// host revisiting an earlier room from the dashboard list.
type Entry = { seat: number; name: string; playerToken: string }

type RoomPlayerState = {
  players: Record<string, Entry>
  getPlayer: (code: string) => Entry | null
  setPlayer: (code: string, seat: number, name: string, playerToken: string) => void
  clearPlayer: (code: string) => void
}

const STORAGE_KEY = 'cashflow_room_players'

function load(): Record<string, Entry> {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return {}
  try {
    return JSON.parse(raw) as Record<string, Entry>
  } catch {
    return {}
  }
}

export const useRoomPlayerStore = create<RoomPlayerState>((set, get) => ({
  players: load(),
  getPlayer: (code) => get().players[code] ?? null,
  setPlayer: (code, seat, name, playerToken) => {
    const players = { ...get().players, [code]: { seat, name, playerToken } }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(players))
    set({ players })
  },
  clearPlayer: (code) => {
    const players = { ...get().players }
    delete players[code]
    localStorage.setItem(STORAGE_KEY, JSON.stringify(players))
    set({ players })
  },
}))
