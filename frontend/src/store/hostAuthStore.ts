import { create } from 'zustand'
import { jwtDecode } from 'jwt-decode'

type Decoded = {
  user_id: string
}

type HostAuthState = {
  token: string | null
  userId: string | null
  setSession: (token: string) => void
  logout: () => void
}

const TOKEN_KEY = 'cashflow_host_token'

function decodeUserId(token: string): string | null {
  try {
    const decoded = jwtDecode<Decoded>(token)
    return decoded?.user_id ?? null
  } catch {
    return null
  }
}

const initialToken = localStorage.getItem(TOKEN_KEY)

export const useHostAuthStore = create<HostAuthState>((set) => ({
  token: initialToken,
  userId: initialToken ? decodeUserId(initialToken) : null,
  setSession: (token) => {
    localStorage.setItem(TOKEN_KEY, token)
    set({ token, userId: decodeUserId(token) })
  },
  logout: () => {
    localStorage.removeItem(TOKEN_KEY)
    set({ token: null, userId: null })
  },
}))
