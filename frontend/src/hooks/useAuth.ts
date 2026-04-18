import { useCallback, useEffect, useMemo, useState } from 'react'
import { jwtDecode } from 'jwt-decode'
import type { AuthUser } from '../api/auth'

type Decoded = {
  user_id: string
  player_id: string
  role: AuthUser['role']
  exp?: number
}

const TOKEN_KEY = 'cashflow_token'

function safeParseAuthUser(token: string | null): AuthUser | null {
  if (!token) return null
  try {
    const decoded = jwtDecode<Decoded>(token)
    if (!decoded?.role || !decoded?.player_id || !decoded?.user_id) return null
    return {
      id: decoded.user_id,
      player_id: decoded.player_id,
      role: decoded.role,
    }
  } catch {
    return null
  }
}

export function useAuth() {
  const [token, setTokenState] = useState<string | null>(null)
  const user = useMemo(() => safeParseAuthUser(token), [token])

  useEffect(() => {
    const t = localStorage.getItem(TOKEN_KEY)
    if (t) setTokenState(t)
  }, [])

  const setToken = useCallback((t: string) => {
    localStorage.setItem(TOKEN_KEY, t)
    setTokenState(t)
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY)
    setTokenState(null)
  }, [])

  return { token, user, setToken, logout }
}

