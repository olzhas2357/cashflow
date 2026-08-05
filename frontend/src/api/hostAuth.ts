import { apiFetch } from './http'

// Stage-1 room/host auth flow (design/Task-Testing.md) — separate token
// namespace from api/auth.ts's legacy player/auditor JWT.

export type HostUser = {
  id: string
  email: string
  created_at: string
}

export type HostAuthResponse = {
  token: string
  user: HostUser
}

export async function registerHost(email: string, password: string) {
  return apiFetch<HostAuthResponse>('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })
}

export async function loginHost(email: string, password: string) {
  return apiFetch<HostAuthResponse>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })
}

export async function getMe(token: string) {
  return apiFetch<HostUser>('/api/auth/me', { token })
}

export type Room = {
  id: string
  code: string
  host_user_id: string
  status: 'WAITING' | 'IN_PROGRESS' | 'FINISHED'
  created_at: string
  expires_at: string
}

export type RoomPlayer = {
  id: string
  room_id: string
  user_id?: string
  name: string
  seat: number
  is_host: boolean
  created_at: string
}

export type RoomState = Room & { players: RoomPlayer[] }

export async function createRoom(token: string) {
  return apiFetch<{ code: string; join_url: string }>('/api/rooms', {
    method: 'POST',
    token,
  })
}

export async function listMyRooms(token: string) {
  const res = await apiFetch<{ rooms: Room[] }>('/api/rooms', { token })
  return res.rooms
}

export async function joinRoom(code: string, name: string) {
  return apiFetch<{ player_token: string; room: RoomState }>(`/api/rooms/${code}/join`, {
    method: 'POST',
    body: JSON.stringify({ name }),
  })
}

export async function getRoomState(code: string) {
  return apiFetch<RoomState>(`/api/rooms/${code}`)
}
