// Adding or editing an expense: amount, title, category, payment method, note and receipts.
// Photos are compressed (and their location data dropped) before they're uploaded; PDFs go as they are.
import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { Camera, FileUp, Loader2, Paperclip, X } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { InputWithUnit } from '@/components/InputWithUnit'
import { FormError } from '@/components/StatusViews'
import { ReceiptThumb } from '@/components/expenses/ReceiptView'
import { api } from '@/lib/api'
import {
  CATEGORY,
  EXPENSE_CATEGORIES,
  MAX_FILE_BYTES,
  MAX_RECEIPTS,
  PAYMENT,
  PAYMENT_METHODS,
  uploadReceipt,
  type Expense,
  type ExpenseCategory,
  type PaymentMethod,
} from '@/lib/expenses'
import { UnsupportedImageError, compressImage } from '@/lib/imageCompress'
import { toneChipOn } from '@/lib/tones'
import { cn } from '@/lib/utils'

type Pending = {
  key: string
  blob: Blob
  filename: string
  preview: string | null
  progress: number
  status: 'ready' | 'uploading' | 'done' | 'error'
  error?: string
}

/** "1,250.50" → 1250.5; null when it isn't an amount with at most 2 decimals. */
function parseAmount(text: string): number | null {
  const clean = text.trim().replace(/,/g, '')
  if (!/^\d+(\.\d{1,2})?$/.test(clean)) return null
  const n = Number(clean)
  return n > 0 ? n : null
}

let keySeq = 0

export function ExpenseForm({
  date,
  currency,
  expense,
  onSaved,
  onCancel,
}: {
  date: string
  currency: string
  /** Editing this expense; leave out to add a new one */
  expense?: Expense
  onSaved: (expense: Expense) => void
  onCancel: () => void
}) {
  const editing = expense !== undefined
  const [amount, setAmount] = useState(expense ? String(expense.amount) : '')
  const [title, setTitle] = useState(expense?.title ?? '')
  const [category, setCategory] = useState<ExpenseCategory | null>(expense?.category ?? null)
  const [payment, setPayment] = useState<PaymentMethod | null>(expense?.paymentMethod ?? null)
  const [note, setNote] = useState(expense?.note ?? '')
  const [saved, setSaved] = useState<Expense | undefined>(expense)
  const [pending, setPending] = useState<Pending[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const cameraRef = useRef<HTMLInputElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const ids = { amount: useId(), title: useId(), note: useId() }

  // Thumbnails are object URLs: free them when the form closes
  useEffect(() => () => pending.forEach((p) => p.preview && URL.revokeObjectURL(p.preview)), []) // eslint-disable-line react-hooks/exhaustive-deps

  const existing = saved?.receipts ?? []
  const room = MAX_RECEIPTS - existing.length - pending.filter((p) => p.status !== 'done').length

  async function addFiles(list: FileList | null) {
    const files = [...(list ?? [])]
    if (files.length === 0) return
    if (files.length > room) toast.error(`An expense can have up to ${MAX_RECEIPTS} receipts`)
    for (const file of files.slice(0, Math.max(0, room))) {
      try {
        let blob: Blob = file
        let filename = file.name || 'receipt'
        if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) {
          if (file.size > MAX_FILE_BYTES) throw new Error(`${file.name} is larger than 5 MB`)
        } else if (file.type.startsWith('image/') || /\.(heic|heif)$/i.test(file.name)) {
          ;({ blob, filename } = await compressImage(file))
          if (blob.size > MAX_FILE_BYTES) throw new Error(`${file.name} is still larger than 5 MB after shrinking it`)
        } else {
          throw new Error(`${file.name}: receipts can be photos or PDFs`)
        }
        const preview = blob.type.startsWith('image/') ? URL.createObjectURL(blob) : null
        setPending((p) => [...p, { key: `p${++keySeq}`, blob, filename, preview, progress: 0, status: 'ready' }])
      } catch (err) {
        if (err instanceof UnsupportedImageError && /\.(heic|heif)$/i.test(file.name)) {
          toast.error('This browser can’t convert HEIC photos', { description: 'Use “Take photo”, or open it in Photos and share it as a JPEG.' })
        } else {
          toast.error(err instanceof Error ? err.message : 'That file couldn’t be added')
        }
      }
    }
  }

  function removePending(key: string) {
    setPending((list) => {
      const item = list.find((p) => p.key === key)
      if (item?.preview) URL.revokeObjectURL(item.preview)
      return list.filter((p) => p.key !== key)
    })
  }

  async function removeExisting(fileId: string) {
    if (!saved) return
    try {
      const res = await api.delete<{ expense: Expense }>(`/expenses/${saved.id}/receipts/${fileId}`)
      setSaved(res.expense)
      onSaved(res.expense)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not remove it')
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    const value = parseAmount(amount)
    if (value === null) return setError('Enter an amount above 0, like 1250 or 1250.50')
    if (!title.trim()) return setError('Give the expense a title')
    if (!category) return setError('Choose a category')
    setError(null)
    setBusy(true)
    try {
      const body = { amount: value, title: title.trim(), category, paymentMethod: payment, note: note.trim() || null }
      let current = saved
        ? (await api.patch<{ expense: Expense }>(`/expenses/${saved.id}`, body)).expense
        : (await api.post<{ expense: Expense }>('/expenses', { ...body, date })).expense
      setSaved(current)

      // Then the receipts, one at a time, each with its own progress
      let failed = 0
      for (const item of pending.filter((p) => p.status === 'ready' || p.status === 'error')) {
        setPending((list) => list.map((p) => (p.key === item.key ? { ...p, status: 'uploading', progress: 0, error: undefined } : p)))
        try {
          current = await uploadReceipt(current.id, item.blob, item.filename, (progress) =>
            setPending((list) => list.map((p) => (p.key === item.key ? { ...p, progress } : p))),
          )
          setPending((list) => list.map((p) => (p.key === item.key ? { ...p, status: 'done', progress: 1 } : p)))
        } catch (err) {
          failed++
          setPending((list) => list.map((p) => (p.key === item.key ? { ...p, status: 'error', error: err instanceof Error ? err.message : 'Upload failed' } : p)))
        }
      }
      setSaved(current)
      onSaved(current)
      if (failed > 0) {
        setError(`Saved, but ${failed === 1 ? 'a receipt' : `${failed} receipts`} couldn’t upload. Tap Save to try again.`)
      } else {
        toast.success(editing ? 'Expense saved' : 'Expense added')
        onCancel()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="space-y-4" onSubmit={submit} noValidate>
      <div className="space-y-1.5">
        <Label htmlFor={ids.amount}>Amount</Label>
        <InputWithUnit
          id={ids.amount}
          unit={currency}
          inputMode="decimal"
          autoComplete="off"
          placeholder="0.00"
          className="h-12 [&_input]:text-xl [&_input]:tabular-nums"
          value={amount}
          onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, ''))}
          autoFocus={!editing}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={ids.title}>What was it?</Label>
        <Input id={ids.title} maxLength={120} placeholder="e.g. Lunch with a friend" value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">Category</p>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Category">
          {EXPENSE_CATEGORIES.map((c) => {
            const meta = CATEGORY[c]
            const on = category === c
            return (
              <Badge key={c} asChild variant="outline" className={cn('h-9 gap-1.5 rounded-full px-3 text-sm', on && toneChipOn[meta.tone])}>
                <button type="button" role="radio" aria-checked={on} onClick={() => setCategory(c)}>
                  <meta.icon className="size-4" aria-hidden /> {meta.label}
                </button>
              </Badge>
            )
          })}
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">
          Paid with <span className="font-normal text-muted-foreground">(optional)</span>
        </p>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Paid with">
          {PAYMENT_METHODS.map((m) => {
            const meta = PAYMENT[m]
            const on = payment === m
            return (
              <Badge key={m} asChild variant="outline" className={cn('h-9 gap-1.5 rounded-full px-3 text-sm', on && toneChipOn.primary)}>
                <button type="button" role="radio" aria-checked={on} onClick={() => setPayment(on ? null : m)}>
                  <meta.icon className="size-4" aria-hidden /> {meta.label}
                </button>
              </Badge>
            )
          })}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={ids.note}>
          Note <span className="font-normal text-muted-foreground">(optional)</span>
        </Label>
        <Textarea id={ids.note} rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
      </div>

      <div className="space-y-2">
        <p className="flex items-center gap-1.5 text-sm font-medium">
          <Paperclip className="size-4" aria-hidden /> Receipts <span className="font-normal text-muted-foreground">(optional, up to {MAX_RECEIPTS})</span>
        </p>
        {(existing.length > 0 || pending.length > 0) && (
          <ul className="flex flex-wrap gap-2">
            {existing.map((r) => (
              <li key={r.fileId} className="relative">
                <ReceiptThumb receipt={r} className="size-20" />
                <RemoveButton label={`Remove ${r.filename}`} onClick={() => void removeExisting(r.fileId)} />
              </li>
            ))}
            {pending
              .filter((p) => p.status !== 'done')
              .map((p) => (
                <li key={p.key} className="relative">
                  <div className="grid size-20 place-items-center overflow-hidden rounded-xl bg-muted ring-1 ring-foreground/10">
                    {p.preview ? <img src={p.preview} alt="" className="size-full object-cover" /> : <span className="text-xs text-muted-foreground">PDF</span>}
                  </div>
                  {p.status === 'uploading' && (
                    <div className="absolute inset-x-1 bottom-1 h-1.5 overflow-hidden rounded-full bg-black/30" role="progressbar" aria-label={`Uploading ${p.filename}`} aria-valuenow={Math.round(p.progress * 100)}>
                      <div className="h-full bg-white transition-[width]" style={{ width: `${p.progress * 100}%` }} />
                    </div>
                  )}
                  {p.status === 'error' && <p className="absolute inset-x-0 bottom-0 rounded-b-xl bg-destructive/90 px-1 text-[10px] text-white">Failed</p>}
                  {p.status !== 'uploading' && <RemoveButton label={`Remove ${p.filename}`} onClick={() => removePending(p.key)} />}
                </li>
              ))}
          </ul>
        )}
        {room > 0 && (
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => cameraRef.current?.click()}>
              <Camera aria-hidden /> Take photo
            </Button>
            <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => fileRef.current?.click()}>
              <FileUp aria-hidden /> Choose file
            </Button>
            {/* The camera on phones; a file picker elsewhere */}
            <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => void addFiles(e.target.files).then(() => (e.target.value = ''))} />
            <input ref={fileRef} type="file" accept="image/*,application/pdf" multiple className="hidden" onChange={(e) => void addFiles(e.target.files).then(() => (e.target.value = ''))} />
          </div>
        )}
      </div>

      {error && <FormError>{error}</FormError>}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>
          {saved && !editing ? 'Close' : 'Cancel'}
        </Button>
        <Button type="submit" disabled={busy}>
          {busy && <Loader2 className="animate-spin" aria-hidden />} {editing || saved ? 'Save' : 'Add expense'}
        </Button>
      </div>
    </form>
  )
}

function RemoveButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="absolute -top-1.5 -right-1.5 grid size-6 place-items-center rounded-full bg-foreground text-background shadow outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <X className="size-3.5" aria-hidden />
    </button>
  )
}
