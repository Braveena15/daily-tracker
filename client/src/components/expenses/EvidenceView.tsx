// The evidence view: one screen with a day's or a week's total, every expense and all its receipts
// (photos large, PDFs with "Open"), a full-screen lightbox, and "Download PDF" / "Download images".
import { useState } from 'react'
import { Download, Images, Loader2, Paperclip } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { IconBubble } from '@/components/IconBubble'
import { Lightbox, ReceiptLarge } from '@/components/expenses/ReceiptView'
import { formatDate } from '@/lib/dates'
import { CATEGORY, isImage, money, type Expense, type Receipt } from '@/lib/expenses'

export function EvidenceView({
  open,
  onClose,
  title,
  from,
  to,
  today,
  currency,
  expenses,
}: {
  open: boolean
  onClose: () => void
  title: string
  from: string
  to: string
  today: string
  currency: string
  expenses: Expense[]
}) {
  const [lightbox, setLightbox] = useState<number | null>(null)
  const [busy, setBusy] = useState<'pdf' | 'images' | null>(null)
  const sorted = [...expenses].sort((a, b) => a.date.localeCompare(b.date) || (a.createdAt ?? '').localeCompare(b.createdAt ?? ''))
  // Every receipt in order, for swiping through them all
  const all: { receipt: Receipt; expense: Expense }[] = sorted.flatMap((e) => e.receipts.map((receipt) => ({ receipt, expense: e })))
  const total = sorted.filter((e) => e.currency === currency).reduce((s, e) => s + Math.round(e.amount * 100), 0) / 100
  const imageCount = all.filter((x) => isImage(x.receipt)).length

  async function pdf() {
    setBusy('pdf')
    try {
      const { exportExpensesPdf, saveBlob } = await import('@/lib/exportPdf')
      const blob = await exportExpensesPdf({ title, from, to, currency, expenses: sorted })
      saveBlob(blob, `Expenses ${from === to ? from : `${from} to ${to}`}.pdf`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not make the PDF')
    } finally {
      setBusy(null)
    }
  }

  async function images() {
    setBusy('images')
    try {
      const { downloadReceiptImages } = await import('@/lib/exportPdf')
      const n = await downloadReceiptImages(sorted)
      toast.success(`${n} ${n === 1 ? 'image' : 'images'} downloaded`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not download the images')
    } finally {
      setBusy(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[92dvh] flex-col gap-0 p-0 sm:max-w-2xl">
        <DialogHeader className="border-b px-5 pt-5 pb-4 text-left">
          <DialogTitle className="text-xl font-semibold">{title}</DialogTitle>
          <DialogDescription>
            <span className="font-heading text-2xl font-semibold text-foreground tabular-nums">{money(total, currency)}</span>
            <span className="ml-2">
              {sorted.length} {sorted.length === 1 ? 'expense' : 'expenses'} · {all.length} {all.length === 1 ? 'receipt' : 'receipts'}
            </span>
          </DialogDescription>
          <div className="flex flex-wrap gap-2 pt-2">
            <Button type="button" size="sm" onClick={() => void pdf()} disabled={busy !== null || sorted.length === 0}>
              {busy === 'pdf' ? <Loader2 className="animate-spin" aria-hidden /> : <Download aria-hidden />} Download PDF
            </Button>
            {imageCount > 0 && (
              <Button type="button" size="sm" variant="outline" onClick={() => void images()} disabled={busy !== null}>
                {busy === 'images' ? <Loader2 className="animate-spin" aria-hidden /> : <Images aria-hidden />} Download images
              </Button>
            )}
          </div>
        </DialogHeader>
        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-4">
          {sorted.length === 0 && <p className="text-sm text-muted-foreground">No expenses in this period.</p>}
          {sorted.map((e) => {
            const meta = CATEGORY[e.category]
            return (
              <section key={e.id} className="space-y-3" aria-label={e.title}>
                <div className="flex items-start gap-3">
                  <IconBubble icon={meta.icon} tone={meta.tone} className="size-9 shrink-0 rounded-lg [&_svg]:size-4" />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium break-words">{e.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(e.date, today)} · {meta.label}
                    </p>
                  </div>
                  <p className="shrink-0 font-semibold tabular-nums">{money(e.amount, e.currency)}</p>
                </div>
                {e.receipts.length > 0 ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {e.receipts.map((r) => (
                      <ReceiptLarge key={r.fileId} receipt={r} onOpen={() => setLightbox(all.findIndex((x) => x.receipt.fileId === r.fileId))} />
                    ))}
                  </div>
                ) : (
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Paperclip className="size-3.5" aria-hidden /> No receipt
                  </p>
                )}
              </section>
            )
          })}
        </div>
        <Lightbox
          receipts={all.map((x) => x.receipt)}
          index={lightbox}
          onIndex={setLightbox}
          onClose={() => setLightbox(null)}
          caption={(r) => {
            const e = all.find((x) => x.receipt.fileId === r.fileId)?.expense
            return e ? `${e.title} · ${money(e.amount, e.currency)} · ${formatDate(e.date, today)}` : r.filename
          }}
        />
      </DialogContent>
    </Dialog>
  )
}
