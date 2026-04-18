import { apiFetch } from './http'

export type PendingTransaction = {
  transaction: any
  estimated_agreed_price: number
  buyer_cash_after: number
  seller_cash_after: number
}

export async function listPendingTransactions(token: string) {
  return apiFetch<PendingTransaction[]>(`/api/transactions/pending`, { token })
}

export async function approveTransaction(token: string, id: string) {
  return apiFetch<any>(`/api/transactions/${id}/approve`, { token, method: 'POST' })
}

export async function rejectTransaction(token: string, id: string) {
  return apiFetch<any>(`/api/transactions/${id}/reject`, { token, method: 'POST' })
}

