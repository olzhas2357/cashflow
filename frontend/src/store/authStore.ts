import { create } from 'zustand'
import { jwtDecode } from 'jwt-decode'
import type { AuthUser } from '../api/auth'

type Decoded = {
  user_id: string
  player_id: string
  role: AuthUser['role']
}

type AuthState = {
  token: string | null
  user: AuthUser | null
  setToken: (token: string) => void
  logout: () => void
}

const TOKEN_KEY = 'cashflow_token'

function decodeUser(token: string): AuthUser | null {
  try {
    const decoded = jwtDecode<Decoded>(token)
    if (!decoded?.user_id || !decoded?.player_id || !decoded?.role) return null
    return {
      id: decoded.user_id,
      player_id: decoded.player_id,
      role: decoded.role,
    }
  } catch {
    return null
  }
}

const initialToken = localStorage.getItem(TOKEN_KEY)
const initialUser = initialToken ? decodeUser(initialToken) : null

export const useAuthStore = create<AuthState>((set) => ({
  token: initialToken,
  user: initialUser,
  setToken: (token) => {
    localStorage.setItem(TOKEN_KEY, token)
    set({ token, user: decodeUser(token) })
  },
  logout: () => {
    localStorage.removeItem(TOKEN_KEY)
    set({ token: null, user: null })
  },
}))

