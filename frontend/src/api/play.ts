import { apiFetch } from './http'
import type { GameSession, SmallDeal, BigDeal, Profession, UserPlayer, MarketEvent } from './auditorPanel'

export type MarketEligibleAsset = {
  asset_id: string
  name: string
  mortgage: number
  loan_amount: number
  cashflow: number
  offer_price: number
  net_to_player: number
  building_units: number
}

export type MarketEligiblePlayer = {
  player_id: string
  name: string
  assets: MarketEligibleAsset[]
}

// Unlike auditorPanel.ts's listProfessions (which hits the auditor-only
// /api/auditor/professions), this hits the unscoped /api/professions route
// so a player token (role=player) can read profession cards too.
export async function listProfessions(token: string) {
  return apiFetch<Profession[]>('/api/professions', { token })
}

export type LobbyPlayer = UserPlayer & { ready: boolean }

export type LobbyState = {
  game: GameSession
  players: LobbyPlayer[]
  market_eligible?: MarketEligiblePlayer[]
}

export async function getLobby(token: string, gameId: string) {
  return apiFetch<LobbyState>(`/api/games/${gameId}/lobby`, { token })
}

export async function setReady(token: string, gameId: string, professionId: string) {
  return apiFetch<Record<string, unknown>>(`/api/games/${gameId}/ready`, {
    token,
    method: 'POST',
    body: JSON.stringify({ profession_id: professionId }),
  })
}

export type RollResponse = {
  ok: boolean
  won?: boolean
  awaiting_decision?: boolean
  deal?: SmallDeal | BigDeal
  awaiting_deal_choice?: boolean
  awaiting_market_decisions?: boolean
  market_card?: MarketEvent
  eligible_players?: MarketEligiblePlayer[]
}

export async function rollDice(token: string, gameId: string) {
  return apiFetch<RollResponse>(`/api/games/${gameId}/turn/roll`, {
    token,
    method: 'POST',
  })
}

export type DecisionRequest = {
  action: 'buy' | 'pass' | 'small' | 'big' | 'market_sell' | 'market_skip'
  shares?: number
  allow_loan?: boolean
  asset_id?: string
}

export type DecisionResponse = {
  ok: boolean
  won?: boolean
  awaiting_decision?: boolean
  deal?: SmallDeal | BigDeal
}

export async function makeDecision(token: string, gameId: string, payload: DecisionRequest) {
  return apiFetch<DecisionResponse>(`/api/games/${gameId}/turn/decision`, {
    token,
    method: 'POST',
    body: JSON.stringify(payload),
  })
}
