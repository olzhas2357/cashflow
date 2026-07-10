import { apiFetch } from './http'

export type AuthUser = {
  id: string
  player_id: string
  role: 'player' | 'auditor' | 'admin'
}

export type AuthResponse = {
  token: string
  user: AuthUser
}

export async function login(email: string, password: string) {
  return apiFetch<AuthResponse>('/api/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })
}

export async function register(email: string, password: string) {
  return apiFetch<AuthResponse>('/api/register', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })
}

export type JoinResponse = AuthResponse & { game_id: string }

export async function join(joinCode: string, name: string) {
  return apiFetch<JoinResponse>('/api/join', {
    method: 'POST',
    body: JSON.stringify({ join_code: joinCode, name }),
  })
}

