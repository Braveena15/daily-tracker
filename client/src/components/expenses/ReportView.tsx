// The expense report for a day or a week, on screen (the same content as the PDF and PNG downloads),
// and the "Download" menu (PDF report / Image (PNG)) used here, on the Expenses page and in the
// evidence view. The PDF and PNG makers are loaded only when a download is picked.
import { useState } from 'react'
import { Download, FileText, Image as ImageIcon, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Lightbox, ReceiptLarge } from '@/components/expenses/ReceiptView'
import { useAuth } from '@/context/useAuth'
import { buildReport, deliverFile, reportFilename } from '@/lib/report'
import type { Expense } from '@/lib/expenses'

type Period = { from: string; to: string; currency: string; expenses: Expense[] }

function useReport({ from, to, currency, expenses }: Period) {
  const { user } = useAuth()
  return buildReport({ name: user?.name ?? '', from, to, currency, expenses })
}

export function DownloadMenu({ size = 'sm', variant = 'outline', ...period }: Period & { size?: 'sm' | 'default'; variant?: 'outline' | 'default' }) {
  const report = useReport(period)
  const [busy, setBusy] = useState<'pdf' | 'png' | null>(null)

  async function download(kind: 'pdf' | 'png') {
    setBusy(kind)
    try {
      const name = reportFilename(period.from, period.to)
      if (kind === 'pdf') {
        const { exportExpensesPdf } = await import('@/lib/exportPdf')
        await deliverFile(await exportExpensesPdf(report), `${name}.pdf`)
      } else {
        const { exportExpensesImage } = await import('@/lib/exportImage')
        await deliverFile(await exportExpensesImage(report), `${name}.png`)
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not make the download')
    } finally {
      setBusy(null)
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant={variant} size={size} disabled={busy !== null || period.expenses.length === 0} aria-busy={busy !== null}>
          {busy ? <Loader2 className="animate-spin" aria-hidden /> : <Download aria-hidden />}
          {busy ? 'Preparing…' : 'Download'}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuItem onSelect={() => void download('pdf')}>
          <FileText aria-hidden /> PDF report
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void download('png')}>
          <ImageIcon aria-hidden /> Image (PNG)
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function ReportView({ open, onClose, ...period }: Period & { open: boolean; onClose: () => void }) {
  const report = useReport(period)
  const [lightbox, setLightbox] = useState<number | null>(null)
  const all = report.rows.flatMap((r) => r.receipts.map((receipt) => ({ receipt, row: r })))

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[92dvh] flex-col gap-0 p-0 sm:max-w-3xl">
        <DialogHeader className="border-b px-5 pt-5 pb-4 text-left">
          <DialogTitle className="text-xl font-semibold">Expense report</DialogTitle>
          <DialogDescription className="space-y-0.5">
            {report.name && <span className="block text-foreground">{report.name}</span>}
            <span className="block font-medium text-foreground">{report.period}</span>
            <span className="block text-xs">{report.generated}</span>
          </DialogDescription>
          <div className="pt-2">
            <DownloadMenu {...period} variant="default" />
          </div>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-4">
          <section aria-label="Summary" className="space-y-3">
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="font-semibold">Total spent</h3>
              <p className="font-heading text-2xl font-semibold tabular-nums">{report.total}</p>
            </div>
            <p className="text-sm text-muted-foreground">
              {report.count} {report.count === 1 ? 'expense' : 'expenses'}
              {report.otherCount > 0 && ` · plus ${report.otherCount} in other currencies (not in the total)`}
            </p>
            <div className={report.isWeek ? 'grid gap-4 sm:grid-cols-2' : ''}>
              <SummaryList title="By category" items={report.byCategory.map((c) => ({ label: c.label, amount: c.amount }))} />
              {report.isWeek && <SummaryList title="By day" items={report.byDay.map((d) => ({ label: d.day, amount: d.amount, muted: d.empty }))} />}
            </div>
          </section>

          <section aria-label="Expenses" className="space-y-2">
            <h3 className="font-semibold">Expenses</h3>
            <div className="overflow-x-auto rounded-xl border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">Date</th>
                    <th className="px-3 py-2 font-medium">Time</th>
                    <th className="px-3 py-2 font-medium">Item</th>
                    <th className="px-3 py-2 font-medium">Category</th>
                    <th className="px-3 py-2 font-medium">Payment</th>
                    <th className="px-3 py-2 text-right font-medium">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {report.rows.map((r) => (
                    <tr key={r.id} className="border-t">
                      <td className="px-3 py-2 whitespace-nowrap">{r.day}</td>
                      <td className="px-3 py-2 tabular-nums">{r.time || '–'}</td>
                      <td className="px-3 py-2 break-words">{r.title}</td>
                      <td className="px-3 py-2">{r.category}</td>
                      <td className="px-3 py-2">{r.payment}</td>
                      <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums">{r.amount}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t font-semibold">
                    <td className="px-3 py-2" colSpan={5}>
                      Total
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums">{report.total}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>

          {all.length > 0 && (
            <section aria-label="Receipts" className="space-y-4">
              <h3 className="font-semibold">Receipts</h3>
              {report.rows
                .filter((r) => r.receipts.length > 0)
                .map((r) => (
                  <div key={r.id} className="space-y-2">
                    <p className="text-sm font-medium">
                      {r.caption} <span className="text-muted-foreground">· {r.day}</span>
                    </p>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {r.receipts.map((rec) => (
                        <ReceiptLarge key={rec.fileId} receipt={rec} onOpen={() => setLightbox(all.findIndex((x) => x.receipt.fileId === rec.fileId))} />
                      ))}
                    </div>
                  </div>
                ))}
            </section>
          )}
        </div>
        <Lightbox
          receipts={all.map((x) => x.receipt)}
          index={lightbox}
          onIndex={setLightbox}
          onClose={() => setLightbox(null)}
          caption={(rec) => {
            const r = all.find((x) => x.receipt.fileId === rec.fileId)?.row
            return r ? `${r.caption} · ${r.day}` : rec.filename
          }}
        />
      </DialogContent>
    </Dialog>
  )
}

function SummaryList({ title, items }: { title: string; items: { label: string; amount: string; muted?: boolean }[] }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-muted-foreground">{title}</p>
      <ul className="divide-y rounded-xl border text-sm">
        {items.map((i) => (
          <li key={i.label} className={`flex justify-between gap-3 px-3 py-1.5 ${i.muted ? 'text-muted-foreground' : ''}`}>
            <span>{i.label}</span>
            <span className="tabular-nums">{i.amount}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
