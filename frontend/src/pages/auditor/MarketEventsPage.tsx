import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createMarketEvent,
  deleteMarketEvent,
  listMarketEvents,
  type MarketEvent,
  updateMarketEvent,
} from '@/api/auditorPanel'
import { useAuthStore } from '@/store/authStore'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

type EventFormState = {
  name: string
  event_type: string
  sub_type: string
  description: string
  offer_price: number
  is_global: boolean
}

const EMPTY_FORM: EventFormState = {
  name: '',
  event_type: '',
  sub_type: '',
  description: '',
  offer_price: 0,
  is_global: false,
}

export default function MarketEventsPage() {
  const token = useAuthStore((s) => s.token)
  const qc = useQueryClient()

  const [editModal, setEditModal] = useState<{ open: boolean; event: MarketEvent | null }>({ open: false, event: null })
  const [form, setForm] = useState<EventFormState>(EMPTY_FORM)

  const eventsQ = useQuery({
    queryKey: ['auditor_market_events'],
    queryFn: () => listMarketEvents(token!),
    enabled: !!token,
  })

  const createM = useMutation({
    mutationFn: () => createMarketEvent(token!, form),
    onSuccess: async () => {
      setEditModal({ open: false, event: null })
      setForm(EMPTY_FORM)
      await qc.invalidateQueries({ queryKey: ['auditor_market_events'] })
    },
  })

  const updateM = useMutation({
    mutationFn: () => updateMarketEvent(token!, editModal.event!.id, form),
    onSuccess: async () => {
      setEditModal({ open: false, event: null })
      setForm(EMPTY_FORM)
      await qc.invalidateQueries({ queryKey: ['auditor_market_events'] })
    },
  })

  const deleteM = useMutation({
    mutationFn: (eventId: string) => deleteMarketEvent(token!, eventId),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['auditor_market_events'] })
    },
  })

  const events = eventsQ.data ?? []

  function openCreate() {
    setForm(EMPTY_FORM)
    setEditModal({ open: true, event: null })
  }

  function openEdit(ev: MarketEvent) {
    setForm({
      name: ev.name || '',
      event_type: ev.event_type || '',
      sub_type: ev.sub_type || '',
      description: ev.description || '',
      offer_price: ev.offer_price,
      is_global: ev.is_global,
    })
    setEditModal({ open: true, event: ev })
  }

  function submitModal() {
    if (editModal.event) {
      updateM.mutate()
      return
    }
    createM.mutate()
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Market Events</h1>
          <p className="text-muted-foreground">Manage all market event cards drawn when a Market square is hit.</p>
        </div>
        <Button onClick={openCreate}>Create event</Button>
      </div>

      <Card>
        <CardContent className="pt-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Event Type</TableHead>
                <TableHead>Sub Type</TableHead>
                <TableHead className="text-right">Offer Price</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {events.map((ev) => (
                <TableRow key={ev.id}>
                  <TableCell className="font-medium">{ev.name}</TableCell>
                  <TableCell>{ev.event_type || '—'}</TableCell>
                  <TableCell>{ev.sub_type || '—'}</TableCell>
                  <TableCell className="text-right">{ev.offer_price.toLocaleString()}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" size="sm" onClick={() => openEdit(ev)}>
                        Edit
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => deleteM.mutate(ev.id)}
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
            <DialogTitle>{editModal.event ? 'Edit event' : 'Create event'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <Field label="Name" value={form.name} onChange={(v) => setForm((s) => ({ ...s, name: v }))} />
            <Field label="Event Type" value={form.event_type} onChange={(v) => setForm((s) => ({ ...s, event_type: v }))} />
            <Field label="Sub Type" value={form.sub_type} onChange={(v) => setForm((s) => ({ ...s, sub_type: v }))} />
            <Field label="Description" value={form.description} onChange={(v) => setForm((s) => ({ ...s, description: v }))} />
            <FieldNumber label="Offer Price" value={form.offer_price} onChange={(v) => setForm((s) => ({ ...s, offer_price: v }))} />
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.is_global}
                onChange={(e) => setForm((s) => ({ ...s, is_global: e.target.checked }))}
              />
              Is global
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditModal({ open: false, event: null })}>
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
