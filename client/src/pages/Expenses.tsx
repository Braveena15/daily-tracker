// Expenses: a day's spending (total, categories, the list, receipts) or "This week" (the same 7 days
// as the Weekly review). Add or edit an expense with receipts; see every receipt in the evidence view
// and download a PDF.
import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Paperclip, Plus, Receipt as ReceiptIcon, Trash2, Wallet } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { DateBar } from '@/components/DateBar'
import { IconBubble } from '@/components/IconBubble'
import { PageHeader } from '@/components/PageHeader'
import { EmptyState, ErrorNotice } from '@/components/StatusViews'
import { EvidenceView } from '@/components/expenses/EvidenceView'
import { ExpenseForm } from '@/components/expenses/ExpenseForm'
import { ReceiptThumb } from '@/components/expenses/ReceiptView'
import { WeekView } from '@/components/expenses/WeekView'
import { useDateParam } from '@/hooks/useDateParam'
import { useFetch } from '@/hooks/useFetch'
import { api } from '@/lib/api'
import { addDays, formatDate, relativeDay } from '@/lib/dates'
import { CATEGORY, PAYMENT, money, type Expense, type ExpenseCategory, type ExpenseSettings, type ExpenseSummary } from '@/lib/expenses'

export function Expenses() {
  const { date, today, goTo } = useDateParam()
  const [params, setParams] = useSearchParams()
  const view = params.get('view') === 'week' ? 'week' : 'day'
  const [version, setVersion] = useState(0)
  const [form, setForm] = useState<{ expense?: Expense } | null>(params.get('add') === '1' ? {} : null)
  const [evidence, setEvidence] = useState(false)
  const refresh = () => setVersion((v) => v + 1)

  const { data: settings } = useFetch<ExpenseSettings>('/expenses/settings')
  const currency = settings?.currency ?? 'LKR'
  // The week is the 7 days ending on the chosen day, like the Weekly review
  const from = view === 'week' ? addDays(date, -6) : date
  const list = useFetch<{ expenses: Expense[] }>(`/expenses?from=${from}&to=${date}&v=${version}`)

  function setView(next: string) {
    const p = new URLSearchParams(params)
    if (next === 'week') p.set('view', 'week')
    else p.delete('view')
    setParams(p)
  }

  const expenses = list.data?.expenses ?? []
  const mine = expenses.filter((e) => e.currency === currency)
  const dayTotal = mine.reduce((s, e) => s + Math.round(e.amount * 100), 0) / 100
  const byCategory = new Map<ExpenseCategory, number>()
  for (const e of mine) byCategory.set(e.category, (byCategory.get(e.category) ?? 0) + Math.round(e.amount * 100))
  const receiptCount = expenses.reduce((s, e) => s + e.receipts.length, 0)
  const periodName = view === 'week' ? 'This week' : relativeDay(date, today)

  return (
    <>
      <PageHeader title="Expenses" description="What you spent, with the receipts to show for it." />
      <div className="space-y-4 md:space-y-6">
        <DateBar date={date} today={today} onChange={goTo} />

        <div className="flex flex-wrap items-center justify-between gap-2">
          <Tabs value={view} onValueChange={setView}>
            <TabsList className="h-9 rounded-xl bg-muted p-1" aria-label="Period">
              <TabsTrigger value="day" className="rounded-lg px-3" aria-controls={undefined}>
                Day
              </TabsTrigger>
              <TabsTrigger value="week" className="rounded-lg px-3" aria-controls={undefined}>
                This week
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setEvidence(true)} disabled={expenses.length === 0}>
              <ReceiptIcon aria-hidden /> Receipts{receiptCount > 0 && ` (${receiptCount})`}
            </Button>
            <Button type="button" size="sm" onClick={() => setForm({})}>
              <Plus aria-hidden /> Add expense
            </Button>
          </div>
        </div>

        {list.error ? (
          <ErrorNotice>{list.error}</ErrorNotice>
        ) : !list.data ? (
          <Skeleton className="h-40 w-full rounded-2xl" />
        ) : view === 'week' ? (
          <WeekSection from={from} to={date} today={today} version={version} />
        ) : (
          <Card>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">{relativeDay(date, today)}</p>
              <p className="font-heading text-3xl font-semibold tabular-nums sm:text-4xl">{money(dayTotal, currency)}</p>
              {byCategory.size > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {[...byCategory].sort((a, b) => b[1] - a[1]).map(([c, cents]) => {
                    const meta = CATEGORY[c]
                    return (
                      <Badge key={c} variant="secondary" className="gap-1 tabular-nums">
                        <meta.icon className="size-3.5" aria-hidden /> {meta.label} · {money(cents / 100, currency)}
                      </Badge>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {list.data &&
          (expenses.length === 0 ? (
            <Card>
              <EmptyState icon={Wallet} title={view === 'week' ? 'No expenses this week' : 'No expenses on this day'} className="py-8" action={<Button onClick={() => setForm({})}><Plus aria-hidden /> Add expense</Button>}>
                Add what you spent, and a photo of the receipt if you have one.
              </EmptyState>
            </Card>
          ) : (
            <ul className="space-y-2" aria-label="Expenses">
              {[...expenses]
                .sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))
                .map((e) => (
                  <ExpenseRow
                    key={e.id}
                    expense={e}
                    showDate={view === 'week'}
                    today={today}
                    onEdit={() => setForm({ expense: e })}
                    onDeleted={refresh}
                  />
                ))}
            </ul>
          ))}
      </div>

      <Dialog open={form !== null} onOpenChange={(o) => !o && setForm(null)}>
        <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{form?.expense ? 'Edit expense' : 'Add expense'}</DialogTitle>
            <DialogDescription>{formatDate(form?.expense?.date ?? date, today)}</DialogDescription>
          </DialogHeader>
          {form && (
            <ExpenseForm
              key={form.expense?.id ?? 'new'}
              date={form.expense?.date ?? date}
              currency={form.expense?.currency ?? currency}
              expense={form.expense}
              onSaved={refresh}
              onCancel={() => setForm(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      <EvidenceView
        open={evidence}
        onClose={() => setEvidence(false)}
        title={`Receipts · ${periodName}`}
        from={from}
        to={date}
        today={today}
        currency={currency}
        expenses={expenses}
      />
    </>
  )
}

function ExpenseRow({ expense: e, showDate, today, onEdit, onDeleted }: { expense: Expense; showDate: boolean; today: string; onEdit: () => void; onDeleted: () => void }) {
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const meta = CATEGORY[e.category]

  async function remove() {
    if (!confirming) {
      setConfirming(true)
      setTimeout(() => setConfirming(false), 3000)
      return
    }
    setBusy(true)
    try {
      await api.delete(`/expenses/${e.id}`)
      toast.success('Expense deleted')
      onDeleted()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not delete')
      setBusy(false)
    }
  }

  return (
    <li className="surface flex items-start gap-3 p-3">
      <button type="button" onClick={onEdit} className="flex min-w-0 flex-1 items-start gap-3 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50" aria-label={`Edit ${e.title}`}>
        <IconBubble icon={meta.icon} tone={meta.tone} className="size-9 shrink-0 rounded-lg [&_svg]:size-4" />
        <span className="min-w-0 flex-1">
          <span className="block font-medium break-words">{e.title}</span>
          <span className="block text-xs text-muted-foreground">
            {[showDate && formatDate(e.date, today), meta.label, e.paymentMethod && PAYMENT[e.paymentMethod].label].filter(Boolean).join(' · ')}
          </span>
          {e.receipts.length > 0 && (
            <span className="mt-1.5 flex items-center gap-1.5">
              {e.receipts.slice(0, 3).map((r) => (
                <ReceiptThumb key={r.fileId} receipt={r} className="pointer-events-none size-9 rounded-lg" />
              ))}
              <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
                <Paperclip className="size-3.5" aria-hidden /> {e.receipts.length}
              </span>
            </span>
          )}
        </span>
        <span className="shrink-0 font-semibold tabular-nums">{money(e.amount, e.currency)}</span>
      </button>
      <Button
        type="button"
        variant="ghost"
        size={confirming ? 'sm' : 'icon'}
        loading={busy}
        className={confirming ? 'bg-destructive/10 text-destructive' : 'text-muted-foreground hover:text-destructive'}
        aria-label={confirming ? `Tap again to delete ${e.title}` : `Delete ${e.title}`}
        onClick={() => void remove()}
      >
        <Trash2 />
        {confirming && !busy && 'Delete?'}
      </Button>
    </li>
  )
}

/** "This week": the summary for the 7 days, loaded only when shown. */
function WeekSection({ from, to, today, version }: { from: string; to: string; today: string; version: number }) {
  const { data, error } = useFetch<ExpenseSummary>(`/expenses/summary?from=${from}&to=${to}&v=${version}`)
  if (error) return <ErrorNotice>{error}</ErrorNotice>
  if (!data) return <Skeleton className="h-64 w-full rounded-2xl" />
  return <WeekView summary={data} today={today} />
}
