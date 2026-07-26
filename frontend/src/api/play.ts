import { apiFetch } from './http'
import type { GameSession, SmallDeal, BigDeal, Profession, UserPlayer, MarketEvent, MarketOfferAuction, GameAsset, LogDTO } from './auditorPanel'

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

export type StockNewsEligiblePlayer = {
  player_id: string
  name: string
  symbol: string
  shares: number
  unit_price: number
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
  stock_news_eligible?: StockNewsEligiblePlayer[]
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
  action:
    | 'buy'
    | 'pass'
    | 'small'
    | 'big'
    | 'market_sell'
    | 'market_skip'
    | 'market_auction_start'
    | 'stock_news_sell'
    | 'stock_news_skip'
    | 'charity_donate'
    | 'charity_skip'
  shares?: number
  allow_loan?: boolean
  asset_id?: string
  asking_price?: number
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

// Player-facing auction endpoints — identity always comes from the caller's
// own JWT (see PlayerAuctionOffers/PlayerAuctionBid in
// backend/handlers/market_auction.go). Starting an auction is not here —
// it's a turn/decision action (market_auction_start), since it's this
// player's response to the currently open Market card. There is no confirm
// step: the highest bid at expiry settles automatically on the backend.

export async function listAuctionOffers(token: string, gameId: string) {
  return apiFetch<MarketOfferAuction[]>(`/api/games/${gameId}/market/auction/offers`, { token })
}

export async function bidOnAuction(token: string, gameId: string, marketOfferId: string, bidPrice: number) {
  return apiFetch<{ id: string; offer_price: number }>(`/api/games/${gameId}/market/auction/bid`, {
    token,
    method: 'POST',
    body: JSON.stringify({ market_offer_id: marketOfferId, bid_price: bidPrice }),
  })
}

// Player-facing portfolio + stock/loan self-service. listMyAssets reuses the
// generic /api/assets route, which is already player-scoped by role in
// AssetHandler.ListAssets (returns only the caller's own assets).

export async function listMyAssets(token: string) {
  return apiFetch<GameAsset[]>('/api/assets', { token })
}

// listMyLogs hits a player-scoped endpoint (PlayerMyLogs) that filters by
// the caller's own player_id server-side — unlike the auditor's gameLogs
// (auditorPanel.ts), which returns every player's activity.
export async function listMyLogs(token: string, gameId: string) {
  return apiFetch<LogDTO[]>(`/api/games/${gameId}/my-logs`, { token })
}

export async function sellStockToBank(token: string, gameId: string, symbol: string, shares: number) {
  return apiFetch<{ ok: boolean }>(`/api/games/${gameId}/stock/sell-bank`, {
    token,
    method: 'POST',
    body: JSON.stringify({ symbol, shares }),
  })
}

export async function takeBankLoan(token: string, gameId: string, loanAmount: number) {
  return apiFetch<{ ok: boolean }>(`/api/games/${gameId}/loans`, {
    token,
    method: 'POST',
    body: JSON.stringify({ loan_amount: loanAmount }),
  })
}

export async function repayBankLoan(token: string, gameId: string, loanAmount: number) {
  return apiFetch<{ ok: boolean }>(`/api/games/${gameId}/loans/repay`, {
    token,
    method: 'POST',
    body: JSON.stringify({ loan_amount: loanAmount }),
  })
}
