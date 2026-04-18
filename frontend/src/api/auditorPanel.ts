import { apiFetch } from './http'

export type GameSession = {
  id: string
  name: string
  max_players: number
}

export type UserPlayer = {
  id: string
  name: string
  game_id?: string
  profession_id?: string
  cash: number
  salary: number
  passive_income: number
  expenses: number
  children_count: number
  charity_turns: number
  skip_turns: number
  position: number
}

export type Profession = {
  id: string
  name: string
  salary: number
  tax: number
  mortgage_payment: number
  school_loan_payment: number
  car_loan_payment: number
  credit_card_payment: number
  retail_payment: number
  other_expenses: number
  child_expense: number
  savings: number
}

export type SmallDeal = {
  id: string
  deal_type: string
  name: string
  price: number
  down_payment: number
  mortgage: number
  cashflow: number
  roi: number
}

export type BigDeal = {
  id: string
  name: string
  price: number
  down_payment: number
  mortgage: number
  cashflow: number
  roi: number
}

export type Doodad = {
  id: string
  name: string
  cost: number
}

export type PlayerFinanceDTO = {
  player: UserPlayer
  total_income: number
  total_expenses: number
  cashflow: number
}

export type LogDTO = {
  id: string
  player_id: string
  player_name: string
  type: string
  amount: number
  description?: string | null
  created_at: string
}

export type PendingTransactionDTO = {
  transaction: any
  buyer_cash_after: number
  seller_cash_after: number
}

export async function listGames(token: string) {
  return apiFetch<GameSession[]>('/api/auditor/games', { token })
}

export async function createGame(token: string, payload: { name: string; max_players: number }) {
  return apiFetch<{ game: GameSession }>('/api/auditor/games', {
    token,
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function getGame(token: string, gameId: string) {
  return apiFetch<GameSession>(`/auditor/games/${gameId}`, { token })
}

export async function addPlayers(token: string, gameId: string, payload: { names: string[] }) {
  return apiFetch<UserPlayer[]>(`/auditor/games/${gameId}/players`, {
    token,
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function listPlayers(token: string, gameId: string) {
  return apiFetch<UserPlayer[]>(`/auditor/games/${gameId}/players`, { token })
}

export async function assignProfession(token: string, gameId: string, playerId: string, professionId: string) {
  return apiFetch<UserPlayer>(`/api/auditor/games/${gameId}/players/${playerId}/profession`, {
    token,
    method: 'POST',
    body: JSON.stringify({ profession_id: professionId }),
  })
}

export async function referenceData(token: string, gameId: string) {
  return apiFetch<{
    professions: Profession[]
    small_deals: SmallDeal[]
    big_deals: BigDeal[]
    doodads: Doodad[]
  }>(`/api/auditor/games/${gameId}/reference-data`, { token })
}

export async function financeOverview(token: string, gameId: string) {
  return apiFetch<PlayerFinanceDTO[]>(`/api/auditor/games/${gameId}/finance`, { token })
}

export async function gameLogs(token: string, gameId: string) {
  return apiFetch<LogDTO[]>(`/api/auditor/games/${gameId}/logs`, { token })
}

export async function gameAssets(token: string, gameId: string) {
  return apiFetch<any[]>(`/api/auditor/games/${gameId}/assets`, { token })
}

export async function postEventPayday(token: string, gameId: string, playerId: string) {
  return apiFetch<any>(`/api/auditor/games/${gameId}/events/payday`, {
    token,
    method: 'POST',
    body: JSON.stringify({ player_id: playerId }),
  })
}

export async function postEventBaby(token: string, gameId: string, playerId: string) {
  return apiFetch<any>(`/api/auditor/games/${gameId}/events/baby`, {
    token,
    method: 'POST',
    body: JSON.stringify({ player_id: playerId }),
  })
}

export async function postEventCharity(token: string, gameId: string, playerId: string) {
  return apiFetch<any>(`/api/auditor/games/${gameId}/events/charity`, {
    token,
    method: 'POST',
    body: JSON.stringify({ player_id: playerId }),
  })
}

export async function postEventDownsized(token: string, gameId: string, playerId: string) {
  return apiFetch<any>(`/api/auditor/games/${gameId}/events/downsized`, {
    token,
    method: 'POST',
    body: JSON.stringify({ player_id: playerId }),
  })
}

export async function postEventDoodad(token: string, gameId: string, playerId: string, doodadId: string) {
  return apiFetch<any>(`/api/auditor/games/${gameId}/events/doodad`, {
    token,
    method: 'POST',
    body: JSON.stringify({ player_id: playerId, doodad_id: doodadId }),
  })
}

export async function postEventSmallDeal(token: string, gameId: string, playerId: string, dealId: string) {
  return apiFetch<any>(`/api/auditor/games/${gameId}/events/small-deal`, {
    token,
    method: 'POST',
    body: JSON.stringify({ player_id: playerId, deal_id: dealId }),
  })
}

export async function postEventBigDeal(token: string, gameId: string, playerId: string, dealId: string) {
  return apiFetch<any>(`/api/auditor/games/${gameId}/events/big-deal`, {
    token,
    method: 'POST',
    body: JSON.stringify({ player_id: playerId, deal_id: dealId }),
  })
}

export async function createMarketSell(
  token: string,
  gameId: string,
  payload: { seller_id: string; buyer_id: string; asset_id: string; price: number },
) {
  return apiFetch<any>(`/auditor/games/${gameId}/market/sell`, {
    token,
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function listPendingTransactions(token: string, gameId: string) {
  return apiFetch<PendingTransactionDTO[]>(`/api/auditor/games/${gameId}/transactions/pending`, { token })
}

export async function approveTransaction(token: string, gameId: string, txId: string) {
  return apiFetch<any>(`/api/auditor/games/${gameId}/transactions/${txId}/approve`, { token, method: 'POST' })
}

export async function rejectTransaction(token: string, gameId: string, txId: string) {
  return apiFetch<any>(`/api/auditor/games/${gameId}/transactions/${txId}/reject`, { token, method: 'POST' })
}

