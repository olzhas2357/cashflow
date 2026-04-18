import { apiFetch } from './http'
import type { AuthUser } from './auth'

export type Asset = {
  id: string
  name: string
  type: string
  price: number
  income: number
  owner_id: string | null
}

export type MarketOffer = {
  id: string
  asset_id: string
  seller_id: string
  price: number
  status: string
  asset?: Partial<Asset>
  seller?: { id: string; cash: number } & Record<string, unknown>
}

export type FinanceReport = {
  balance_sheet: { assets: number; liabilities: number; equity: number }
  income_statement: { total_income: number; total_expenses: number; net_income: number }
  cashflow: { net_cash_change: number }
}

export async function getFinance(token: string, playerId: string) {
  return apiFetch<FinanceReport>(`/api/players/${playerId}/finance`, { token })
}

export async function getAssets(token: string) {
  return apiFetch<Asset[]>(`/api/assets`, { token })
}

export async function listMarket(token: string) {
  return apiFetch<MarketOffer[]>(`/api/market`, { token })
}

export async function sellAsset(token: string, assetId: string, price: number) {
  return apiFetch<any>(`/api/assets/${assetId}/sell`, {
    token,
    method: 'POST',
    body: JSON.stringify({ price }),
  })
}

export async function proposeOnMarket(
  token: string,
  payload: {
    market_offer_id: string
    buyer_id: string
    offer_price: number
    message?: string
    counter_offer?: number | null
  },
) {
  return apiFetch<any>(`/api/market`, {
    token,
    method: 'POST',
    body: JSON.stringify({ kind: 'proposal', ...payload }),
  })
}

