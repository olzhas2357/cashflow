import { apiFetch } from './http'
import type { Profession } from './auditorPanel'

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
  profession_id?: string
  game_player_id?: string
  created_at: string
}

export type RoomState = Room & { players: RoomPlayer[] }

export async function createRoom(token: string) {
  return apiFetch<{ code: string; join_url: string; player_token: string }>('/api/rooms', {
    method: 'POST',
    token,
  })
}

export async function listMyRooms(token: string) {
  const res = await apiFetch<{ rooms: Room[] }>('/api/rooms', { token })
  return res.rooms
}

// Recovers the host's own player_token if this browser's local copy was
// lost (e.g. overwritten by creating another room before the per-room fix).
export async function getMyRoomPlayerToken(code: string, hostToken: string) {
  return apiFetch<{ player_token: string; seat: number; name: string }>(`/api/rooms/${code}/my-token`, {
    token: hostToken,
  })
}

export async function joinRoom(code: string, name: string, playerToken?: string) {
  return apiFetch<{ player_token: string; room: RoomState }>(`/api/rooms/${code}/join`, {
    method: 'POST',
    body: JSON.stringify({ name, player_token: playerToken }),
  })
}

export async function getRoomState(code: string) {
  return apiFetch<RoomState>(`/api/rooms/${code}`)
}

// Этап 2: room-to-game bridge — see design/Task-Testing.md.

export async function listProfessions() {
  return apiFetch<Profession[]>('/api/professions')
}

export async function setRoomProfession(code: string, playerToken: string, professionId: string) {
  return apiFetch<RoomState>(`/api/rooms/${code}/profession`, {
    method: 'POST',
    body: JSON.stringify({ player_token: playerToken, profession_id: professionId }),
  })
}

export async function startRoomGame(code: string, hostToken: string) {
  return apiFetch<RoomState>(`/api/rooms/${code}/start`, {
    method: 'POST',
    token: hostToken,
  })
}

export async function exchangeSessionToken(code: string, playerToken: string) {
  return apiFetch<{ token: string; game_id: string }>(`/api/rooms/${code}/session-token`, {
    method: 'POST',
    body: JSON.stringify({ player_token: playerToken }),
  })
}
