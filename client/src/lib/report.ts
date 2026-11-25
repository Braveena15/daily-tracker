// The expense report for a day or a week: one plain model shown on screen (ReportView) and drawn into
// the PDF (exportPdf.ts) and the PNG (exportImage.ts), so all three say the same thing.
import { CATEGORY, PAYMENT, money, type Expense, type Receipt } from '@/lib/expenses'
import { APP_TIMEZONE, listDates, timeInTimezone, todayInTimezone } from '@/lib/dates'

export type ReportRow = {
  id: string
  date: string
  /** "Wed, 25 Nov" */
  day: string
  /** "14:05" — when it was logged; empty if unknown */
  time: string
  title: string
  category: string
  payment: string
  amount: string
  receipts: Receipt[]
  /** "Groceries · LKR 740.00" — the caption for its receipts */
  caption: string
}

export type Report = {
  name: string
  /** "Wed, 25 Nov 2026" or "23–29 Nov 2026" */
  period: string
  /** "Generated 25 Nov 2026, 18:30" */
  generated: string
  isWeek: boolean
  total: string
  count: number
  /** Expenses in other currencies, which aren't in the total */
  otherCount: number
  byCategory: { label: string; amount: string }[]
  byDay: { day: string; amount: string; empty: boolean }[]
  rows: ReportRow[]
  receiptCount: number
}

const utc = (date: string) => new Date(`${date}T00:00:00Z`)
const fmt = (date: string, opts: Intl.DateTimeFormatOptions) => utc(date).toLocaleDateString('en-GB', { ...opts, timeZone: 'UTC' })

/** "Wed, 25 Nov 2026", or "23–29 Nov 2026" / "28 Nov – 4 Dec 2026" / "29 Dec 2026 – 4 Jan 2027". */
export function formatPeriod(from: string, to: string): string {
  if (from === to) return fmt(from, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
  const sameYear = from.slice(0, 4) === to.slice(0, 4)
  const sameMonth = sameYear && from.slice(5, 7) === to.slice(5, 7)
  const end = fmt(to, { day: 'numeric', month: 'short', year: 'numeric' })
  if (sameMonth) return `${Number(from.slice(8))}–${end}`
  return `${fmt(from, { day: 'numeric', month: 'short', year: sameYear ? undefined : 'numeric' })} – ${end}`
}

/** "expenses-2026-11-25" or "expenses-2026-11-23_to_2026-11-29" */
export const reportFilename = (from: string, to: string) => (from === to ? `expenses-${from}` : `expenses-${from}_to_${to}`)

const sortExpenses = (list: Expense[]) =>
  [...list].sort((a, b) => a.date.localeCompare(b.date) || (a.createdAt ?? '').localeCompare(b.createdAt ?? ''))

export function buildReport({ name, from, to, currency, expenses }: { name: string; from: string; to: string; currency: string; expenses: Expense[] }): Report {
  const sorted = sortExpenses(expenses)
  const mine = sorted.filter((e) => e.currency === currency)
  const cents = (list: Expense[]) => list.reduce((s, e) => s + Math.round(e.amount * 100), 0)

  const byCategory = new Map<string, number>()
  for (const e of mine) byCategory.set(e.category, (byCategory.get(e.category) ?? 0) + Math.round(e.amount * 100))

  const now = new Date()
  const generated = `Generated ${fmt(todayInTimezone(APP_TIMEZONE, now), { day: 'numeric', month: 'short', year: 'numeric' })}, ${timeInTimezone(APP_TIMEZONE, now)}`

  return {
    name,
    period: formatPeriod(from, to),
    generated,
    isWeek: from !== to,
    total: money(cents(mine) / 100, currency),
    count: mine.length,
    otherCount: sorted.length - mine.length,
    byCategory: [...byCategory]
      .sort((a, b) => b[1] - a[1])
      .map(([c, v]) => ({ label: CATEGORY[c as keyof typeof CATEGORY].label, amount: money(v / 100, currency) })),
    byDay:
      from === to
        ? []
        : listDates(from, to).map((d) => {
            const v = cents(mine.filter((e) => e.date === d))
            return { day: fmt(d, { weekday: 'short', day: 'numeric', month: 'short' }), amount: v ? money(v / 100, currency) : '–', empty: v === 0 }
          }),
    rows: sorted.map((e) => ({
      id: e.id,
      date: e.date,
      day: fmt(e.date, { weekday: 'short', day: 'numeric', month: 'short' }),
      time: e.createdAt ? timeInTimezone(APP_TIMEZONE, new Date(e.createdAt)) : '',
      title: e.title,
      category: CATEGORY[e.category].label,
      payment: e.paymentMethod ? PAYMENT[e.paymentMethod].label : '–',
      amount: money(e.amount, e.currency),
      receipts: e.receipts,
      caption: `${e.title} · ${money(e.amount, e.currency)}`,
    })),
    receiptCount: sorted.reduce((s, e) => s + e.receipts.length, 0),
  }
}

/**
 * Hands a finished file to the person: the share sheet on iPhone/iPad (Save to Files or Photos),
 * a normal download elsewhere — or when sharing isn't allowed (e.g. it took too long after the tap).
 */
export async function deliverFile(blob: Blob, filename: string) {
  const file = new File([blob], filename, { type: blob.type })
  const touch = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  if (touch && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename })
      return
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return // they closed the sheet
    }
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
