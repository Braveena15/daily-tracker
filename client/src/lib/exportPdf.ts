// The expense report as a PDF, made in the browser (pdf-lib is loaded only here): first the report
// (header, summary, the table of expenses with the total), then each receipt — photos one
// per page with the expense as a caption, and receipt PDFs merged in.
import { isImage, isPdf, receiptBlob, type Expense } from '@/lib/expenses'
import type { Report } from '@/lib/report'

const A4: [number, number] = [595.28, 841.89]
const MARGIN = 48

/**
 * The built-in PDF font only knows Western characters, so others are swapped for close matches or "?"
 * (the app itself shows them all; this only affects the PDF).
 */
export function pdfText(text: string): string {
  return text
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/…/g, '...')
    .replace(/[^\x20-\x7e\xa0-\xff]/g, '?')
}

/** A photo as JPEG or PNG bytes pdf-lib can embed (WebP, SVG… are redrawn as JPEG). Null if the browser can't open it. */
export async function embeddable(blob: Blob): Promise<{ bytes: ArrayBuffer; type: 'jpg' | 'png' } | null> {
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

export async function exportExpensesPdf(report: Report): Promise<Blob> {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib')
  const doc = await PDFDocument.create()
  doc.setTitle(pdfText(`Expense report - ${report.period}`))
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  type Font = typeof font
  const grey = rgb(0.4, 0.4, 0.4)
  const rule = rgb(0.85, 0.85, 0.85)
  const W = A4[0] - MARGIN * 2

  // ---------- Report pages ----------
  let page = doc.addPage(A4)
  let y = A4[1] - MARGIN
  const ensure = (h: number) => {
    if (y - h < MARGIN) {
      page = doc.addPage(A4)
      y = A4[1] - MARGIN
    }
  }
  /** Cuts text to fit a width, with "..." */
  const fit = (text: string, f: Font, size: number, width: number) => {
    let t = pdfText(text)
    if (f.widthOfTextAtSize(t, size) <= width) return t
    while (t.length > 1 && f.widthOfTextAtSize(`${t}...`, size) > width) t = t.slice(0, -1)
    return `${t}...`
  }
  const text = (t: string, x: number, opts: { size?: number; f?: Font; color?: ReturnType<typeof rgb>; width?: number; right?: boolean } = {}) => {
    const size = opts.size ?? 10
    const f = opts.f ?? font
    const s = opts.width ? fit(t, f, size, opts.width) : pdfText(t)
    const dx = opts.right && opts.width ? opts.width - f.widthOfTextAtSize(s, size) : 0
    page.drawText(s, { x: x + dx, y, size, font: f, color: opts.color })
  }
  const line = (t: string, opts: { size?: number; f?: Font; color?: ReturnType<typeof rgb>; right?: string } = {}) => {
    const size = opts.size ?? 10.5
    ensure(size + 7)
    text(t, MARGIN, { ...opts, size, width: opts.right ? W * 0.65 : W, right: false })
    if (opts.right) text(opts.right, MARGIN, { ...opts, right: true, size, width: W })
    y -= size + 7
  }
  const hr = () => {
    page.drawLine({ start: { x: MARGIN, y: y + 4 }, end: { x: A4[0] - MARGIN, y: y + 4 }, thickness: 0.6, color: rule })
    y -= 6
  }

  line('Expense report', { size: 22, f: bold })
  if (report.name) line(report.name, { size: 12 })
  line(report.period, { size: 12, f: bold })
  line(report.generated, { size: 9, color: grey })
  y -= 12

  line('Summary', { size: 13, f: bold })
  line('Total spent', { f: bold, right: report.total })
  line('Expenses', { right: String(report.count) })
  if (report.otherCount > 0) line(`Plus ${report.otherCount} in other currencies (not in the total)`, { color: grey })
  y -= 6
  line('By category', { size: 11, f: bold })
  for (const c of report.byCategory) line(c.label, { right: c.amount })
  if (report.isWeek) {
    y -= 6
    line('By day', { size: 11, f: bold })
    for (const d of report.byDay) line(d.day, { right: d.amount, color: d.empty ? grey : undefined })
  }
  y -= 14

  // The table: date, time, item, category, payment, amount
  const cols = [
    { label: 'Date', w: 68 },
    { label: 'Time', w: 36 },
    { label: 'Item', w: W - 68 - 36 - 72 - 56 - 88 },
    { label: 'Category', w: 72 },
    { label: 'Payment', w: 56 },
    { label: 'Amount', w: 88, right: true },
  ]
  const row = (cells: string[], f: Font, color?: ReturnType<typeof rgb>) => {
    ensure(18)
    let x = MARGIN
    cells.forEach((c, i) => {
      text(c, x, { f, size: 9.5, color, width: cols[i].w - (cols[i].right ? 0 : 6), right: cols[i].right })
      x += cols[i].w
    })
    y -= 16
  }
  line('Expenses', { size: 13, f: bold })
  row(cols.map((c) => c.label), bold, grey)
  hr()
  for (const r of report.rows) {
    const extra = r.receipts.length ? ` (${r.receipts.length} receipt${r.receipts.length === 1 ? '' : 's'})` : ''
    row([r.day, r.time || '–', `${r.title}${extra}`, r.category, r.payment, r.amount], font)
  }
  hr()
  row(['Total', '', '', '', '', report.total], bold)

  // ---------- Receipts: photos one per page with a caption, PDFs merged in ----------
  for (const r of report.rows) {
    const caption = `${r.caption} · ${r.day}`
    for (const rec of r.receipts) {
      let blob: Blob
      try {
        blob = await receiptBlob(rec.fileId)
      } catch {
        continue
      }
      if (isPdf(rec)) {
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
      } else if (isImage(rec)) {
        const img = await embeddable(blob)
        const p = doc.addPage(A4)
        p.drawText(pdfText(caption), { x: MARGIN, y: A4[1] - MARGIN, size: 12, font: bold })
        if (!img) {
          p.drawText(pdfText("This photo couldn't be included (open it in the app)"), { x: MARGIN, y: A4[1] - MARGIN - 20, size: 10, font, color: grey })
          continue
        }
        const embedded = img.type === 'jpg' ? await doc.embedJpg(img.bytes) : await doc.embedPng(img.bytes)
        // As large as the page allows (small photos are scaled up too, so they're readable)
        const maxW = A4[0] - MARGIN * 2
        const maxH = A4[1] - MARGIN * 2 - 30
        const scale = Math.min(maxW / embedded.width, maxH / embedded.height)
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
