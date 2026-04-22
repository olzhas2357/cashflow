import { apiFetch } from './http'

export type GameSession = {
  id: string
  name: string
  max_players: number
  active_small_deal_id?: string | null
  active_small_deal?: SmallDeal | null
  created_at?: string
  updated_at?: string
  created_by?: string
}

export type UserPlayer = {
  id: string
  user_id: string
  name: string
  game_id?: string | null
  profession_id?: string | null
  cash: number
  salary: number
  passive_income: number
  expenses: number
  assets_total: number
  liabilities_total: number
  children_count: number
  charity_turns: number
  skip_turns: number
  position: number
  created_at?: string
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

export function professionTotalExpenses(p: Profession): number {
  return (
    p.tax +
    p.mortgage_payment +
    p.school_loan_payment +
    p.car_loan_payment +
    p.credit_card_payment +
    p.retail_payment +
    p.other_expenses
  )
}

export type SmallDeal = {
  id: string
  external_id?: string
  type: string
  category: string
  name: string
  title: string
  symbol: string
  description: string
  price: number
  down_payment: number
  mortgage: number
  cashflow: number
  roi: number
  extra?: Record<string, unknown>
}

export type BigDeal = {
  id: string
  deal_type: string
  name: string
  title: string
  description: string
  price: number
  down_payment: number
  mortgage: number
  cashflow: number
  roi: number
}

export type Doodad = {
  id: string
  doodad_type: string
  name: string
  description: string
  cost: number
  cost_per_child: number
  liability_type: string
  liability_amount: number
  monthly_expense_increase: number
}

export type MarketEvent = {
  id: string
  name: string
  event_type: string
  sub_type: string
  description: string
  offer_price: number
  is_global: boolean
}

export type PlayerFinanceDTO = {
  player: UserPlayer
  profession_name: string
  total_income: number
  total_expenses: number
  monthly_cashflow: number
  cashflow: number
  base_expenses: number
  child_expense_each: number
  children_expense_total: number
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

export type FinanceReport = {
  balance_sheet: { assets: number; liabilities: number; equity: number }
  income_statement: { total_income: number; total_expenses: number; net_income: number; base_expenses: number; child_expense_each: number; children_expense_total: number }
  cashflow: { net_cash_change: number }
}

export type GameAsset = {
  id: string
  name: string
  type: string
  price: number
  income: number
  game_id?: string | null
  down_payment: number
  mortgage: number
  owner_id?: string | null
}

export type PendingTransactionDTO = {
  transaction: {
    id: string
    market_offer_id: string
    buyer_id: string
    offer_price: number
    status: string
    game_id?: string | null
    market_offer?: {
      asset?: GameAsset
      seller_id: string
    }
  }
  buyer_cash_after: number
  seller_cash_after: number
}

const A = '/api/auditor'

export async function listGames(token: string) {
  return apiFetch<GameSession[]>(`${A}/games`, { token })
}

export async function createGame(token: string, payload: { name: string; max_players: number }) {
  return apiFetch<{ game: GameSession }>(`${A}/games`, {
    token,
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function getGame(token: string, gameId: string) {
  return apiFetch<GameSession>(`${A}/games/${gameId}`, { token })
}

export async function addPlayers(token: string, gameId: string, payload: { names: string[] }) {
  return apiFetch<UserPlayer[]>(`${A}/games/${gameId}/players`, {
    token,
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function removePlayer(token: string, gameId: string, playerId: string) {
  return apiFetch<{ ok: boolean }>(`${A}/games/${gameId}/players/${playerId}`, { token, method: 'DELETE' })
}

export async function listPlayers(token: string, gameId: string) {
  return apiFetch<UserPlayer[]>(`${A}/games/${gameId}/players`, { token })
}

export async function assignProfession(token: string, gameId: string, playerId: string, professionId: string) {
  return apiFetch<UserPlayer>(`${A}/games/${gameId}/players/${playerId}/profession`, {
    token,
    method: 'POST',
    body: JSON.stringify({ profession_id: professionId }),
  })
}

export async function listProfessions(token: string) {
  return apiFetch<Profession[]>(`${A}/professions`, { token })
}

export async function listSmallDeals(token: string) {
  return apiFetch<SmallDeal[]>(`${A}/small-deals`, { token })
}

export async function createSmallDeal(
  token: string,
  payload: {
    category: string
    title: string
    name?: string
    symbol?: string
    description?: string
    price: number
    down_payment: number
    cashflow: number
    mortgage: number
    roi: number
  },
) {
  return apiFetch<SmallDeal>(`${A}/small-deals`, {
    token,
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function updateSmallDeal(
  token: string,
  dealId: string,
  payload: {
    category: string
    title: string
    name?: string
    symbol?: string
    description?: string
    price: number
    down_payment: number
    cashflow: number
    mortgage: number
    roi: number
  },
) {
  return apiFetch<SmallDeal>(`${A}/small-deals/${dealId}`, {
    token,
    method: 'PUT',
    body: JSON.stringify(payload),
  })
}

export async function deleteSmallDeal(token: string, dealId: string) {
  return apiFetch<{ ok: boolean }>(`${A}/small-deals/${dealId}`, {
    token,
    method: 'DELETE',
  })
}

export async function openSmallDeal(token: string, gameId: string, dealId: string) {
  return apiFetch<GameSession>(`/api/game/open-small-deal`, {
    token,
    method: 'POST',
    body: JSON.stringify({ game_id: gameId, deal_id: dealId }),
  })
}

export async function listBigDeals(token: string) {
  return apiFetch<BigDeal[]>(`${A}/big-deals`, { token })
}

export async function listDoodads(token: string) {
  return apiFetch<Doodad[]>(`${A}/doodads`, { token })
}

export async function listMarketEvents(token: string) {
  return apiFetch<MarketEvent[]>(`${A}/market-events`, { token })
}

export async function referenceData(token: string, gameId: string) {
  return apiFetch<{
    professions: Profession[]
    small_deals: SmallDeal[]
    big_deals: BigDeal[]
    doodads: Doodad[]
  }>(`${A}/games/${gameId}/reference-data`, { token })
}

export async function financeOverview(token: string, gameId: string) {
  return apiFetch<PlayerFinanceDTO[]>(`${A}/games/${gameId}/finance`, { token })
}

export async function gameLogs(token: string, gameId: string) {
  return apiFetch<LogDTO[]>(`${A}/games/${gameId}/logs`, { token })
}

export async function gameAssets(token: string, gameId: string) {
  return apiFetch<GameAsset[]>(`${A}/games/${gameId}/assets`, { token })
}

export async function getPlayer(token: string, playerId: string) {
  return apiFetch<UserPlayer>(`/api/players/${playerId}`, { token })
}

export async function getPlayerFinance(token: string, playerId: string) {
  return apiFetch<FinanceReport>(`/api/players/${playerId}/finance`, { token })
}

export async function postEventPayday(token: string, gameId: string, playerId: string) {
  return apiFetch<{ ok: boolean }>(`${A}/games/${gameId}/events/payday`, {
    token,
    method: 'POST',
    body: JSON.stringify({ player_id: playerId }),
  })
}

export async function postEventBaby(token: string, gameId: string, playerId: string) {
  return apiFetch<{ ok: boolean }>(`${A}/games/${gameId}/events/baby`, {
    token,
    method: 'POST',
    body: JSON.stringify({ player_id: playerId }),
  })
}

export async function postEventCharity(token: string, gameId: string, playerId: string) {
  return apiFetch<{ ok: boolean }>(`${A}/games/${gameId}/events/charity`, {
    token,
    method: 'POST',
    body: JSON.stringify({ player_id: playerId }),
  })
}

export async function postEventDownsized(token: string, gameId: string, playerId: string) {
  return apiFetch<{ ok: boolean }>(`${A}/games/${gameId}/events/downsized`, {
    token,
    method: 'POST',
    body: JSON.stringify({ player_id: playerId }),
  })
}

export async function postEventDoodad(token: string, gameId: string, playerId: string, doodadId: string) {
  return apiFetch<{ ok: boolean }>(`${A}/games/${gameId}/events/doodad`, {
    token,
    method: 'POST',
    body: JSON.stringify({ player_id: playerId, doodad_id: doodadId }),
  })
}

export async function postEventSmallDeal(
  token: string,
  gameId: string,
  playerId: string,
  dealId: string,
  options?: { shares?: number; allow_loan?: boolean },
) {
  return apiFetch<{ ok: boolean }>(`${A}/games/${gameId}/events/small-deal`, {
    token,
    method: 'POST',
    body: JSON.stringify({
      player_id: playerId,
      deal_id: dealId,
      shares: options?.shares,
      allow_loan: options?.allow_loan,
    }),
  })
}

export async function postEventBigDeal(token: string, gameId: string, playerId: string, dealId: string) {
  return apiFetch<{ ok: boolean }>(`${A}/games/${gameId}/events/big-deal`, {
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
  return apiFetch<unknown>(`${A}/games/${gameId}/market/sell`, {
    token,
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function listPendingTransactions(token: string, gameId: string) {
  return apiFetch<PendingTransactionDTO[]>(`${A}/games/${gameId}/transactions/pending`, { token })
}

export async function approveTransaction(token: string, gameId: string, txId: string) {
  return apiFetch<{ ok: boolean }>(`${A}/games/${gameId}/transactions/${txId}/approve`, { token, method: 'POST' })
}

export async function rejectTransaction(token: string, gameId: string, txId: string) {
  return apiFetch<{ ok: boolean }>(`${A}/games/${gameId}/transactions/${txId}/reject`, { token, method: 'POST' })
}
