// "Download PDF" for a day's or a week's expenses, made in the browser (pdf-lib is loaded only here):
// page 1 is the summary (total, per category, per day, every expense), then each receipt — photos one
// per page with the expense as a caption, and receipt PDFs merged in.
import { CATEGORY, isImage, isPdf, money, receiptBlob, type Expense, type ExpenseCategory } from '@/lib/expenses'
import { listDates } from '@/lib/dates'

const A4: [number, number] = [595.28, 841.89]
const MARGIN = 48

/**
 * The built-in PDF font only knows Western characters, so others are swapped for close matches or "?"
 * (the app itself shows them all; this only affects the PDF).
 */
function pdfText(text: string): string {
  return text
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/…/g, '...')
    .replace(/[^\x20-\x7e\xa0-\xff]/g, '?')
}

/** A photo as JPEG or PNG bytes pdf-lib can embed (WebP, SVG… are redrawn as JPEG). Null if the browser can't open it. */
async function embeddable(blob: Blob): Promise<{ bytes: ArrayBuffer; type: 'jpg' | 'png' } | null> {
  if (blob.type === 'image/jpeg') return { bytes: await blob.arrayBuffer(), type: 'jpg' }
  if (blob.type === 'image/png') return { bytes: await blob.arrayBuffer(), type: 'png' }
  const url = URL.createObjectURL(blob)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image()
      i.onload = () => resolve(i)
      i.onerror = reject
      i.src = url
    })
    const canvas = document.createElement('canvas')
    canvas.width = img.naturalWidth || 1200
    canvas.height = img.naturalHeight || 1600
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    const jpeg = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85))
    return jpeg ? { bytes: await jpeg.arrayBuffer(), type: 'jpg' } : null
  } catch {
    return null
  } finally {
    URL.revokeObjectURL(url)
  }
}

export async function exportExpensesPdf({
  title,
  from,
  to,
  currency,
  expenses,
}: {
  title: string
  from: string
  to: string
  currency: string
  expenses: Expense[]
}): Promise<Blob> {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib')
  const doc = await PDFDocument.create()
  doc.setTitle(pdfText(title))
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const grey = rgb(0.4, 0.4, 0.4)
  const mine = expenses.filter((e) => e.currency === currency)
  const total = mine.reduce((s, e) => s + Math.round(e.amount * 100), 0) / 100
  const sorted = [...expenses].sort((a, b) => a.date.localeCompare(b.date) || (a.createdAt ?? '').localeCompare(b.createdAt ?? ''))

  // ---------- Summary pages ----------
  let page = doc.addPage(A4)
  let y = A4[1] - MARGIN
  const line = (text: string, opts: { size?: number; f?: typeof font; color?: ReturnType<typeof rgb>; x?: number; right?: string } = {}) => {
    const size = opts.size ?? 11
    if (y < MARGIN + size) {
      page = doc.addPage(A4)
      y = A4[1] - MARGIN
    }
    page.drawText(pdfText(text), { x: opts.x ?? MARGIN, y, size, font: opts.f ?? font, color: opts.color })
    if (opts.right) {
      const r = pdfText(opts.right)
      page.drawText(r, { x: A4[0] - MARGIN - (opts.f ?? font).widthOfTextAtSize(r, size), y, size, font: opts.f ?? font, color: opts.color })
    }
    y -= size + 7
  }
  const gap = (n = 8) => (y -= n)

  line(title, { size: 20, f: bold })
  line(from === to ? from : `${from} to ${to}`, { color: grey })
  gap(10)
  line('Total', { size: 13, f: bold, right: money(total, currency) })
  line(`${mine.length} ${mine.length === 1 ? 'expense' : 'expenses'}`, { color: grey })
  const others = expenses.filter((e) => e.currency !== currency)
  if (others.length > 0) line(`Plus ${others.length} in other currencies (not in the total)`, { color: grey })

  gap(12)
  line('By category', { size: 13, f: bold })
  const byCategory = new Map<ExpenseCategory, number>()
  for (const e of mine) byCategory.set(e.category, (byCategory.get(e.category) ?? 0) + Math.round(e.amount * 100))
  for (const [category, cents] of [...byCategory].sort((a, b) => b[1] - a[1])) line(CATEGORY[category].label, { right: money(cents / 100, currency) })

  if (from !== to) {
    gap(12)
    line('By day', { size: 13, f: bold })
    for (const date of listDates(from, to)) {
      const cents = mine.filter((e) => e.date === date).reduce((s, e) => s + Math.round(e.amount * 100), 0)
      line(date, { right: cents ? money(cents / 100, currency) : '-', color: cents ? undefined : grey })
    }
  }

  gap(12)
  line('Expenses', { size: 13, f: bold })
  for (const e of sorted) {
    const receipts = e.receipts.length ? ` (${e.receipts.length} receipt${e.receipts.length === 1 ? '' : 's'})` : ''
    line(`${e.date}  ${e.title}`, { right: money(e.amount, e.currency) })
    line(`${CATEGORY[e.category].label}${e.paymentMethod ? ` · ${e.paymentMethod}` : ''}${receipts}`, { size: 9, color: grey, x: MARGIN + 12 })
  }

  // ---------- Receipts ----------
  for (const e of sorted) {
    const caption = `${e.title} · ${money(e.amount, e.currency)} · ${e.date}`
    for (const r of e.receipts) {
      let blob: Blob
      try {
        blob = await receiptBlob(r.fileId)
      } catch {
        continue
      }
      if (isPdf(r)) {
        try {
          const src = await PDFDocument.load(await blob.arrayBuffer(), { ignoreEncryption: true })
          const pages = await doc.copyPages(src, src.getPageIndices())
          pages.forEach((p, i) => {
            doc.addPage(p)
            if (i === 0) p.drawText(pdfText(caption), { x: 24, y: p.getHeight() - 18, size: 9, font, color: grey })
          })
        } catch {
          const p = doc.addPage(A4)
          p.drawText(pdfText(`${caption} — this PDF couldn't be included (open it in the app)`), { x: MARGIN, y: A4[1] - MARGIN, size: 11, font })
        }
      } else if (isImage(r)) {
        const img = await embeddable(blob)
        const p = doc.addPage(A4)
        p.drawText(pdfText(caption), { x: MARGIN, y: A4[1] - MARGIN, size: 11, font: bold })
        if (!img) {
          p.drawText(pdfText("This photo couldn't be included (open it in the app)"), { x: MARGIN, y: A4[1] - MARGIN - 20, size: 10, font, color: grey })
          continue
        }
        const embedded = img.type === 'jpg' ? await doc.embedJpg(img.bytes) : await doc.embedPng(img.bytes)
        const maxW = A4[0] - MARGIN * 2
        const maxH = A4[1] - MARGIN * 2 - 30
        const scale = Math.min(maxW / embedded.width, maxH / embedded.height, 1)
        const w = embedded.width * scale
        const h = embedded.height * scale
        p.drawImage(embedded, { x: (A4[0] - w) / 2, y: A4[1] - MARGIN - 30 - h, width: w, height: h })
      }
    }
  }

  const bytes = await doc.save()
  return new Blob([bytes as BlobPart], { type: 'application/pdf' })
}

/** Saves a file from memory (a download on desktop; the share/preview sheet on iPhone). */
export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

/** "Download images": each receipt photo as its own file. */
export async function downloadReceiptImages(expenses: Expense[]) {
  let n = 0
  for (const e of expenses) {
    for (const r of e.receipts.filter(isImage)) {
      const blob = await receiptBlob(r.fileId)
      const ext = blob.type.split('/')[1]?.replace('jpeg', 'jpg').replace('svg+xml', 'svg') ?? 'jpg'
      const name = `${e.date} ${e.title}`.replace(/[\\/:*?"<>|]/g, '').slice(0, 60)
      saveBlob(blob, `${name} ${++n}.${ext}`)
      // A short pause, so browsers don't block several downloads at once
      await new Promise((r) => setTimeout(r, 400))
    }
  }
  return n
}
