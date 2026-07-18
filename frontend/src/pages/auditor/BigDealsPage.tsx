import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createBigDeal,
  deleteBigDeal,
  listBigDeals,
  type BigDeal,
  updateBigDeal,
} from '@/api/auditorPanel'
import { useAuthStore } from '@/store/authStore'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

type DealFormState = {
  deal_type: string
  title: string
  name: string
  description: string
  price: number
  down_payment: number
  cashflow: number
  mortgage: number
  roi: number
}

const EMPTY_FORM: DealFormState = {
  deal_type: 'real_estate',
  title: '',
  name: '',
  description: '',
  price: 0,
  down_payment: 0,
  cashflow: 0,
  mortgage: 0,
  roi: 0,
}

export default function BigDealsPage() {
  const token = useAuthStore((s) => s.token)
  const qc = useQueryClient()

  const [editModal, setEditModal] = useState<{ open: boolean; deal: BigDeal | null }>({ open: false, deal: null })
  const [form, setForm] = useState<DealFormState>(EMPTY_FORM)

  const dealsQ = useQuery({
    queryKey: ['auditor_big_deals'],
    queryFn: () => listBigDeals(token!),
    enabled: !!token,
  })

  const createM = useMutation({
    mutationFn: () => createBigDeal(token!, form),
    onSuccess: async () => {
      setEditModal({ open: false, deal: null })
      setForm(EMPTY_FORM)
      await qc.invalidateQueries({ queryKey: ['auditor_big_deals'] })
    },
  })

  const updateM = useMutation({
    mutationFn: () => updateBigDeal(token!, editModal.deal!.id, form),
    onSuccess: async () => {
      setEditModal({ open: false, deal: null })
      setForm(EMPTY_FORM)
      await qc.invalidateQueries({ queryKey: ['auditor_big_deals'] })
    },
  })

  const deleteM = useMutation({
    mutationFn: (dealId: string) => deleteBigDeal(token!, dealId),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['auditor_big_deals'] })
    },
  })

  const deals = dealsQ.data ?? []

  function openCreate() {
    setForm(EMPTY_FORM)
    setEditModal({ open: true, deal: null })
  }

  function openEdit(deal: BigDeal) {
    setForm({
      deal_type: deal.deal_type || 'real_estate',
      title: deal.title || '',
      name: deal.name || '',
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
          <h1 className="text-2xl font-bold">Big Deals</h1>
          <p className="text-muted-foreground">Manage all big deal cards (drawn automatically by the turn engine).</p>
        </div>
        <Button onClick={openCreate}>Create deal</Button>
      </div>

      <Card>
        <CardContent className="pt-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Deal Type</TableHead>
                <TableHead>Title</TableHead>
                <TableHead className="text-right">Price</TableHead>
                <TableHead className="text-right">Down Payment</TableHead>
                <TableHead className="text-right">Cashflow</TableHead>
                <TableHead className="text-right">ROI</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {deals.map((deal) => (
                <TableRow key={deal.id}>
                  <TableCell>{deal.deal_type || '—'}</TableCell>
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
            <Field label="Deal Type" value={form.deal_type} onChange={(v) => setForm((s) => ({ ...s, deal_type: v }))} />
            <Field label="Title" value={form.title} onChange={(v) => setForm((s) => ({ ...s, title: v }))} />
            <Field label="Name" value={form.name} onChange={(v) => setForm((s) => ({ ...s, name: v }))} />
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
