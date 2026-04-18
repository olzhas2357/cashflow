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

