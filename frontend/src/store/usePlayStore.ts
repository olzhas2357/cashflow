import { create } from 'zustand'

type PlayState = {
  gameId: string | null
  setGameId: (gameId: string) => void
  clearGameId: () => void
}

const GAME_ID_KEY = 'cashflow_play_game_id'

export const usePlayStore = create<PlayState>((set) => ({
  gameId: localStorage.getItem(GAME_ID_KEY),
  setGameId: (gameId) => {
    localStorage.setItem(GAME_ID_KEY, gameId)
    set({ gameId })
  },
  clearGameId: () => {
    localStorage.removeItem(GAME_ID_KEY)
    set({ gameId: null })
  },
}))
