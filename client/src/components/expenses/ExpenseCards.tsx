// Small expense cards for other pages: "Spent today" on Today, the week on the Dashboard, and the
// expense settings (currency, weekly budget, receipt storage) for Settings and the Expenses page sheet.
import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Check, HardDrive, Plus, Wallet } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Progress } from '@/components/ui/progress'
import { CardChevron } from '@/components/CardChevron'
import { IconBubble } from '@/components/IconBubble'
import { InputWithUnit } from '@/components/InputWithUnit'
import { useFetch } from '@/hooks/useFetch'
import { api } from '@/lib/api'
import { bytes, moneyShort, type Expense, type ExpenseSettings, type ExpenseSummary, type StorageUsage } from '@/lib/expenses'

/** Today page: "Spent today: LKR 2,450 · 3 expenses" with "+ Add expense". */
export function SpentTodayCard({ date, isToday }: { date: string; isToday: boolean }) {
  const { data } = useFetch<{ expenses: Expense[] }>(`/expenses?date=${date}`)
  const { data: settings } = useFetch<ExpenseSettings>('/expenses/settings')
  const currency = settings?.currency ?? 'LKR'
  const list = data?.expenses ?? []
  const total = list.filter((e) => e.currency === currency).reduce((s, e) => s + Math.round(e.amount * 100), 0) / 100
  const query = isToday ? '' : `date=${date}&`

  return (
    <Card size="sm">
      <CardContent className="flex flex-wrap items-center gap-3">
        <Link to={`/expenses${isToday ? '' : `?date=${date}`}`} className="group flex min-w-0 flex-1 items-center gap-3 outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
          <IconBubble icon={Wallet} className="size-9 rounded-lg [&_svg]:size-4" />
          <span className="min-w-0 flex-1">
            <span className="block text-sm text-muted-foreground">{isToday ? 'Spent today' : 'Spent this day'}</span>
            <span className="block font-semibold tabular-nums">
              {data ? (list.length ? `${moneyShort(total, currency)} · ${list.length} ${list.length === 1 ? 'expense' : 'expenses'}` : 'Nothing yet') : '…'}
            </span>
          </span>
          <CardChevron />
        </Link>
        <Button asChild size="sm" variant="outline">
          <Link to={`/expenses?${query}add=1`}>
            <Plus aria-hidden /> Add expense
          </Link>
        </Button>
      </CardContent>
    </Card>
  )
}

/** Dashboard: this week's spending (the last 7 days), opening the Expenses week view. */
export function WeekExpensesCard() {
  const { data } = useFetch<ExpenseSummary>('/expenses/summary')
  if (!data) return null
  return (
    <Link to="/expenses?view=week" className="group flex items-center gap-3 surface p-4 transition-all outline-none hover:bg-accent/40 hover:ring-primary/30 focus-visible:ring-3 focus-visible:ring-ring/50">
      <IconBubble icon={Wallet} />
      <div className="min-w-0 flex-1">
        <p className="text-sm text-muted-foreground">Spent in the last 7 days</p>
        <p className="font-heading text-xl font-semibold tabular-nums">{moneyShort(data.total, data.currency)}</p>
        <p className="text-xs text-muted-foreground">
          {data.count} {data.count === 1 ? 'expense' : 'expenses'}
          {data.budgetUsedPercent !== null && ` · ${data.budgetUsedPercent}% of your budget`}
        </p>
      </div>
      <CardChevron />
    </Link>
  )
}

const CURRENCIES = ['LKR', 'USD', 'EUR', 'GBP', 'INR', 'AUD'] as const
const OTHER = 'other'

/**
 * Settings → Expenses (and the ⚙️ sheet on the Expenses page): currency, weekly budget and the
 * receipt storage used. `bare` leaves out the card, for use inside a sheet.
 */
export function ExpenseSettingsCard({ bare = false, onSaved }: { bare?: boolean; onSaved?: (s: ExpenseSettings) => void }) {
  const { data } = useFetch<ExpenseSettings>('/expenses/settings')
  const { data: usage } = useFetch<StorageUsage>('/storage/usage')
  if (!data) return null
  return <ExpenseSettingsForm initial={data} usage={usage} bare={bare} onSaved={onSaved} />
}

function ExpenseSettingsForm({
  initial,
  usage,
  bare,
  onSaved,
}: {
  initial: ExpenseSettings
  usage: StorageUsage | null
  bare: boolean
  onSaved?: (s: ExpenseSettings) => void
}) {
  const [currency, setCurrency] = useState(initial.currency)
  // A code outside the list shows the "Other" box
  const [pick, setPick] = useState<string>((CURRENCIES as readonly string[]).includes(initial.currency) ? initial.currency : OTHER)
  const [budget, setBudget] = useState(initial.weeklyBudget === null ? '' : String(initial.weeklyBudget))
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(initial)

  const budgetValue = budget.trim() === '' ? null : Number(budget.replace(/,/g, ''))
  const changed = currency.trim().toUpperCase() !== saved.currency || budgetValue !== saved.weeklyBudget

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!/^[A-Za-z]{3}$/.test(currency.trim())) return toast.error('Currency must be a 3-letter code, like LKR or USD')
    if (budgetValue !== null && (!Number.isFinite(budgetValue) || budgetValue < 0)) return toast.error('Enter the weekly budget as a number')
    setBusy(true)
    try {
      const next = await api.put<ExpenseSettings>('/expenses/settings', { currency: currency.trim().toUpperCase(), weeklyBudget: budgetValue })
      setSaved(next)
      setCurrency(next.currency)
      onSaved?.(next)
      toast.success('Saved')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save')
    } finally {
      setBusy(false)
    }
  }

  const high = usage !== null && usage.percentUsed >= 80

  const body = (
    <div className="space-y-5">
        <form className="grid gap-4 sm:grid-cols-[9rem_1fr_auto] sm:items-end" onSubmit={submit} noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="expense-currency">Currency</Label>
            <Select
              value={pick}
              onValueChange={(v) => {
                setPick(v)
                setCurrency(v === OTHER ? '' : v)
              }}
            >
              <SelectTrigger id="expense-currency" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CURRENCIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
                <SelectItem value={OTHER}>Other…</SelectItem>
              </SelectContent>
            </Select>
            {pick === OTHER && (
              <Input
                aria-label="Currency code (3 letters)"
                placeholder="e.g. JPY"
                maxLength={3}
                autoCapitalize="characters"
                className="uppercase"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
              />
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="expense-budget">
              Weekly budget <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <InputWithUnit id="expense-budget" unit={currency.toUpperCase() || 'LKR'} inputMode="decimal" placeholder="None" value={budget} onChange={(e) => setBudget(e.target.value.replace(/[^\d.,]/g, ''))} />
          </div>
          <Button type="submit" loading={busy} disabled={busy || !changed}>
            <Check aria-hidden /> Save
          </Button>
        </form>
        {usage && (
          <div className="space-y-1.5">
            <p className="flex items-center gap-1.5 text-sm">
              <HardDrive className="size-4 text-muted-foreground" aria-hidden />
              Storage used (receipts and progress photos): {bytes(usage.bytesUsed)} of ~{bytes(usage.limitBytes)}
            </p>
            <Progress value={Math.min(100, usage.percentUsed)} aria-label={`${usage.percentUsed}% of receipt storage used`} />
            {high && (
              <p className="text-sm text-muted-foreground" role="status">
                Your storage is getting full. Deleting receipts or photos you no longer need frees up space.
              </p>
            )}
          </div>
        )}
    </div>
  )

  if (bare) return body
  return (
    <Card className="max-w-3xl">
      <CardHeader className="flex items-center gap-3">
        <IconBubble icon={Wallet} />
        <div>
          <CardTitle className="text-lg font-semibold">Expenses</CardTitle>
          <CardDescription>Your currency, a weekly budget and receipt storage</CardDescription>
        </div>
      </CardHeader>
      <CardContent>{body}</CardContent>
    </Card>
  )
}
