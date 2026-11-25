// Expenses (server: /api/expenses, /api/receipts, /api/storage). Receipt files are only ever fetched
// with the login cookie and shown from in-memory object URLs: there are no public links.
import {
  Banknote,
  Bus,
  CircleDashed,
  Clapperboard,
  CreditCard,
  GraduationCap,
  HeartPulse,
  Receipt,
  ShoppingBag,
  Smartphone,
  UtensilsCrossed,
  Wallet,
  type LucideIcon,
} from 'lucide-react'
import type { Tone } from '@/lib/tones'

export const EXPENSE_CATEGORIES = ['food', 'transport', 'bills', 'shopping', 'health', 'education', 'entertainment', 'other'] as const
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number]
export const PAYMENT_METHODS = ['cash', 'card', 'online', 'other'] as const
export type PaymentMethod = (typeof PAYMENT_METHODS)[number]

export const MAX_RECEIPTS = 5
export const MAX_FILE_BYTES = 5 * 1024 * 1024

export const CATEGORY: Record<ExpenseCategory, { label: string; icon: LucideIcon; tone: Tone }> = {
  food: { label: 'Food', icon: UtensilsCrossed, tone: 'physical' },
  transport: { label: 'Transport', icon: Bus, tone: 'outdoor' },
  bills: { label: 'Bills', icon: Receipt, tone: 'primary' },
  shopping: { label: 'Shopping', icon: ShoppingBag, tone: 'learning' },
  health: { label: 'Health', icon: HeartPulse, tone: 'physical' },
  education: { label: 'Education', icon: GraduationCap, tone: 'learning' },
  entertainment: { label: 'Entertainment', icon: Clapperboard, tone: 'mental' },
  other: { label: 'Other', icon: CircleDashed, tone: 'primary' },
}

export const PAYMENT: Record<PaymentMethod, { label: string; icon: LucideIcon }> = {
  cash: { label: 'Cash', icon: Banknote },
  card: { label: 'Card', icon: CreditCard },
  online: { label: 'Online', icon: Smartphone },
  other: { label: 'Other', icon: Wallet },
}

export type Receipt = { fileId: string; filename: string; mimeType: string; size: number; uploadedAt: string }

export type Expense = {
  id: string
  date: string
  amount: number
  currency: string
  category: ExpenseCategory
  title: string
  note: string
  paymentMethod: PaymentMethod | null
  receipts: Receipt[]
  createdAt: string | null
  updatedAt: string | null
}

export type ExpenseSummary = {
  from: string
  to: string
  currency: string
  total: number
  count: number
  perDay: { date: string; total: number; count: number }[]
  perCategory: { category: ExpenseCategory; total: number; count: number }[]
  biggest: { id: string; date: string; amount: number; category: ExpenseCategory; title: string } | null
  previous: { from: string; to: string; total: number }
  change: number
  changePercent: number | null
  budget: number | null
  budgetUsedPercent: number | null
  otherCurrencies: Record<string, number>
}

export type ExpenseSettings = { currency: string; weeklyBudget: number | null }
export type StorageUsage = { bytesUsed: number; limitBytes: number; percentUsed: number }

/** "LKR 2,450.00" */
export const money = (amount: number, currency: string) =>
  `${currency} ${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

/** "LKR 2,450" (no cents when there are none), for tight spaces */
export const moneyShort = (amount: number, currency: string) =>
  `${currency} ${amount.toLocaleString('en-US', { minimumFractionDigits: amount % 1 === 0 ? 0 : 2, maximumFractionDigits: 2 })}`

/** "42 MB" */
export function bytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`
  return `${Math.round((n / (1024 * 1024)) * 10) / 10} MB`
}

export const isImage = (r: Pick<Receipt, 'mimeType'>) => r.mimeType.startsWith('image/')
export const isPdf = (r: Pick<Receipt, 'mimeType'>) => r.mimeType === 'application/pdf'

// ---------- Receipt files (with the login cookie, kept in memory) ----------

const blobs = new Map<string, Promise<Blob>>()

/** The receipt's file, fetched once per page visit. */
export function receiptBlob(fileId: string): Promise<Blob> {
  let found = blobs.get(fileId)
  if (!found) {
    found = fetch(`/api/receipts/${encodeURIComponent(fileId)}`, { credentials: 'include' }).then(async (res) => {
      if (!res.ok) throw new Error(res.status === 404 ? 'This receipt is no longer available' : 'Could not load the receipt')
      return res.blob()
    })
    found.catch(() => blobs.delete(fileId))
    blobs.set(fileId, found)
  }
  return found
}

/**
 * Uploads one file to an expense, reporting progress (0–1). Resolves with the updated expense.
 * XMLHttpRequest, because fetch can't report upload progress.
 */
export function uploadReceipt(expenseId: string, file: Blob, filename: string, onProgress: (p: number) => void): Promise<Expense> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `/api/expenses/${expenseId}/receipts`)
    xhr.withCredentials = true
    xhr.responseType = 'json'
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total)
    xhr.onload = () => {
      const body = xhr.response as { expense?: Expense; message?: string } | null
      if (xhr.status >= 200 && xhr.status < 300 && body?.expense) resolve(body.expense)
      else reject(new Error(body?.message ?? `Upload failed (${xhr.status})`))
    }
    xhr.onerror = () => reject(new Error("Can't reach the server. Please try again."))
    const form = new FormData()
    form.append('files', file, filename)
    xhr.send(form)
  })
}
