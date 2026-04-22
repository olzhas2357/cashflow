import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createSmallDeal,
  deleteSmallDeal,
  listGames,
  listSmallDeals,
  openSmallDeal,
  type SmallDeal,
  updateSmallDeal,
} from '@/api/auditorPanel'
import { useAuthStore } from '@/store/authStore'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

type DealFormState = {
  category: string
  title: string
  name: string
  symbol: string
  description: string
  price: number
  down_payment: number
  cashflow: number
  mortgage: number
  roi: number
}

const EMPTY_FORM: DealFormState = {
  category: 'small_deal_assets',
  title: '',
  name: '',
  symbol: '',
  description: '',
  price: 0,
  down_payment: 0,
  cashflow: 0,
  mortgage: 0,
  roi: 0,
}

export default function SmallDealsPage() {
  const token = useAuthStore((s) => s.token)
  const qc = useQueryClient()

  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [activeGameId, setActiveGameId] = useState<string>('')
  const [editModal, setEditModal] = useState<{ open: boolean; deal: SmallDeal | null }>({ open: false, deal: null })
  const [form, setForm] = useState<DealFormState>(EMPTY_FORM)

  const dealsQ = useQuery({
    queryKey: ['auditor_small_deals'],
    queryFn: () => listSmallDeals(token!),
    enabled: !!token,
  })

  const gamesQ = useQuery({
    queryKey: ['auditor_games'],
    queryFn: () => listGames(token!),
    enabled: !!token,
  })

  const createM = useMutation({
    mutationFn: () => createSmallDeal(token!, form),
    onSuccess: async () => {
      setEditModal({ open: false, deal: null })
      setForm(EMPTY_FORM)
      await qc.invalidateQueries({ queryKey: ['auditor_small_deals'] })
    },
  })

  const updateM = useMutation({
    mutationFn: () => updateSmallDeal(token!, editModal.deal!.id, form),
    onSuccess: async () => {
      setEditModal({ open: false, deal: null })
      setForm(EMPTY_FORM)
      await qc.invalidateQueries({ queryKey: ['auditor_small_deals'] })
    },
  })

  const deleteM = useMutation({
    mutationFn: (dealId: string) => deleteSmallDeal(token!, dealId),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['auditor_small_deals'] })
    },
  })

  const openM = useMutation({
    mutationFn: (dealId: string) => openSmallDeal(token!, activeGameId, dealId),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['auditor_games'] })
      if (activeGameId) {
        await qc.invalidateQueries({ queryKey: ['auditor_game', activeGameId] })
      }
    },
  })

  const deals = dealsQ.data ?? []
  const categories = useMemo(() => Array.from(new Set(deals.map((d) => d.category).filter(Boolean))), [deals])
  const filteredDeals = useMemo(
    () => (categoryFilter === 'all' ? deals : deals.filter((d) => d.category === categoryFilter)),
    [deals, categoryFilter],
  )
  const games = gamesQ.data ?? []
  const effectiveGameId = activeGameId || games[0]?.id || ''

  function openCreate() {
    setForm(EMPTY_FORM)
    setEditModal({ open: true, deal: null })
  }

  function openEdit(deal: SmallDeal) {
    setForm({
      category: deal.category || 'small_deal_assets',
      title: deal.title || '',
      name: deal.name || '',
      symbol: deal.symbol || '',
      description: deal.description || '',
      price: deal.price,
      down_payment: deal.down_payment,
      cashflow: deal.cashflow,
      mortgage: deal.mortgage,
      roi: deal.roi,
    })
    setEditModal({ open: true, deal })
  }

  function submitModal() {
    if (editModal.deal) {
      updateM.mutate()
      return
    }
    createM.mutate()
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Small Deals</h1>
          <p className="text-muted-foreground">Manage all small deal cards and open one as active in game.</p>
        </div>
        <Button onClick={openCreate}>Create deal</Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
          <CardDescription>Filter by category and choose target game for “Open deal”.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1">
            <Label>Category</Label>
            <select
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
            >
              <option value="all">All</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label>Game session for open-deal</Label>
            <select
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={effectiveGameId}
              onChange={(e) => setActiveGameId(e.target.value)}
            >
              {games.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Category</TableHead>
                <TableHead>Title</TableHead>
                <TableHead className="text-right">Price</TableHead>
                <TableHead className="text-right">Down Payment</TableHead>
                <TableHead className="text-right">Cashflow</TableHead>
                <TableHead className="text-right">ROI</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredDeals.map((deal) => (
                <TableRow key={deal.id}>
                  <TableCell>{deal.category || '—'}</TableCell>
                  <TableCell className="font-medium">{deal.title || deal.name || 'Untitled'}</TableCell>
                  <TableCell className="text-right">{deal.price.toLocaleString()}</TableCell>
                  <TableCell className="text-right">{deal.down_payment.toLocaleString()}</TableCell>
                  <TableCell className="text-right">{deal.cashflow.toLocaleString()}</TableCell>
                  <TableCell className="text-right">{deal.roi}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" size="sm" onClick={() => openEdit(deal)}>
                        Edit
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => deleteM.mutate(deal.id)}
                        disabled={deleteM.isPending}
                      >
                        Delete
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => openM.mutate(deal.id)}
                        disabled={!effectiveGameId || openM.isPending}
                      >
                        Open deal
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={editModal.open} onOpenChange={(open) => setEditModal((s) => ({ ...s, open }))}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editModal.deal ? 'Edit deal' : 'Create deal'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <Field label="Category" value={form.category} onChange={(v) => setForm((s) => ({ ...s, category: v }))} />
            <Field label="Title" value={form.title} onChange={(v) => setForm((s) => ({ ...s, title: v }))} />
            <Field label="Name" value={form.name} onChange={(v) => setForm((s) => ({ ...s, name: v }))} />
            <Field label="Symbol" value={form.symbol} onChange={(v) => setForm((s) => ({ ...s, symbol: v }))} />
            <Field label="Description" value={form.description} onChange={(v) => setForm((s) => ({ ...s, description: v }))} />
            <FieldNumber label="Price" value={form.price} onChange={(v) => setForm((s) => ({ ...s, price: v }))} />
            <FieldNumber label="Down Payment" value={form.down_payment} onChange={(v) => setForm((s) => ({ ...s, down_payment: v }))} />
            <FieldNumber label="Cashflow" value={form.cashflow} onChange={(v) => setForm((s) => ({ ...s, cashflow: v }))} />
            <FieldNumber label="Mortgage" value={form.mortgage} onChange={(v) => setForm((s) => ({ ...s, mortgage: v }))} />
            <FieldNumber label="ROI" value={form.roi} onChange={(v) => setForm((s) => ({ ...s, roi: v }))} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditModal({ open: false, deal: null })}>
              Cancel
            </Button>
            <Button onClick={submitModal} disabled={createM.isPending || updateM.isPending}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  )
}

function FieldNumber({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      <Input type="number" value={value} onChange={(e) => onChange(Number(e.target.value || 0))} />
    </div>
  )
}
