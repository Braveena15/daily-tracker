// The expense report as one tall PNG, drawn on a canvas (no libraries; loaded only when downloading):
// header, summary, the table with the total, then every receipt photo full width with its caption.
// Receipt PDFs can't be drawn here, so they're listed by name (the PDF download includes them).
import { isImage, isPdf, receiptBlob, type Receipt } from '@/lib/expenses'
import type { Report } from '@/lib/report'

const WIDTH = 1080
const PAD = 56
const INNER = WIDTH - PAD * 2
const FONT = '"Plus Jakarta Sans Variable", system-ui, -apple-system, "Segoe UI", sans-serif'
const INK = '#1c1917'
const MUTED = '#78716c'
const RULE = '#e7e5e4'
/** Browsers (iPhone especially) refuse canvases bigger than about this many pixels */
const MAX_AREA = 16_000_000
const MAX_SIDE = 32_000

function loadImage(blob: Blob): Promise<HTMLImageElement | null> {
  const url = URL.createObjectURL(blob)
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = url
  }).finally(() => URL.revokeObjectURL(url)) as Promise<HTMLImageElement | null>
}

type Proof = { caption: string; receipt: Receipt; img: HTMLImageElement | null }

export async function exportExpensesImage(report: Report): Promise<Blob> {
  await document.fonts?.ready
  // Fetch every receipt first (photos are decoded so they can be drawn)
  const proofs: Proof[] = []
  for (const r of report.rows) {
    for (const receipt of r.receipts) {
      let img: HTMLImageElement | null = null
      if (isImage(receipt)) {
        try {
          img = await loadImage(await receiptBlob(receipt.fileId))
        } catch {
          img = null
        }
      }
      proofs.push({ caption: `${r.caption} · ${r.day}`, receipt, img })
    }
  }

  // Lay out once without drawing to find the height, then draw for real
  const measure = document.createElement('canvas').getContext('2d')!
  const height = render(measure, report, proofs, false)
  const scale = Math.min(1, Math.sqrt(MAX_AREA / (WIDTH * height)), MAX_SIDE / height)
  const canvas = document.createElement('canvas')
  canvas.width = Math.floor(WIDTH * scale)
  canvas.height = Math.floor(height * scale)
  const ctx = canvas.getContext('2d')!
  ctx.scale(scale, scale)
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, WIDTH, height)
  render(ctx, report, proofs, true)

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
  if (!blob) throw new Error('Could not make the image')
  return blob
}

/** Draws the report (or only measures it, when `draw` is false). Returns the height used. */
function render(ctx: CanvasRenderingContext2D, report: Report, proofs: Proof[], draw: boolean): number {
  let y = PAD

  const font = (size: number, weight = 400) => (ctx.font = `${weight} ${size}px ${FONT}`)
  const fit = (t: string, width: number) => {
    if (ctx.measureText(t).width <= width) return t
    let s = t
    while (s.length > 1 && ctx.measureText(`${s}…`).width > width) s = s.slice(0, -1)
    return `${s}…`
  }
  const text = (t: string, x: number, opts: { size?: number; weight?: number; color?: string; width?: number; right?: boolean } = {}) => {
    font(opts.size ?? 26, opts.weight)
    if (!draw) return
    ctx.fillStyle = opts.color ?? INK
    ctx.textBaseline = 'top'
    const s = opts.width ? fit(t, opts.width) : t
    const dx = opts.right && opts.width ? opts.width - ctx.measureText(s).width : 0
    ctx.fillText(s, x + dx, y)
  }
  const line = (t: string, opts: { size?: number; weight?: number; color?: string; right?: string; rightWeight?: number } = {}) => {
    const size = opts.size ?? 26
    text(t, PAD, { ...opts, size, width: opts.right ? INNER * 0.65 : INNER, right: false })
    if (opts.right) text(opts.right, PAD, { ...opts, right: true, weight: opts.rightWeight ?? opts.weight, size, width: INNER })
    y += size * 1.5
  }
  const hr = () => {
    if (draw) {
      ctx.fillStyle = RULE
      ctx.fillRect(PAD, y, INNER, 2)
    }
    y += 14
  }

  // Header
  line('Expense report', { size: 52, weight: 700 })
  if (report.name) line(report.name, { size: 30 })
  line(report.period, { size: 30, weight: 600 })
  line(report.generated, { size: 22, color: MUTED })
  y += 24

  // Summary
  line('Summary', { size: 32, weight: 700 })
  line('Total spent', { weight: 600, right: report.total, size: 30 })
  line('Expenses', { right: String(report.count) })
  if (report.otherCount > 0) line(`Plus ${report.otherCount} in other currencies (not in the total)`, { color: MUTED, size: 22 })
  y += 10
  line('By category', { weight: 600, color: MUTED, size: 24 })
  for (const c of report.byCategory) line(c.label, { right: c.amount })
  if (report.isWeek) {
    y += 10
    line('By day', { weight: 600, color: MUTED, size: 24 })
    for (const d of report.byDay) line(d.day, { right: d.amount, color: d.empty ? MUTED : INK })
  }
  y += 28

  // Table
  const cols = [
    { w: 150, label: 'Date' },
    { w: 80, label: 'Time' },
    { w: INNER - 150 - 80 - 150 - 110 - 190, label: 'Item' },
    { w: 150, label: 'Category' },
    { w: 110, label: 'Payment' },
    { w: 190, label: 'Amount', right: true },
  ]
  const row = (cells: string[], opts: { weight?: number; color?: string; size?: number } = {}) => {
    let x = PAD
    cells.forEach((c, i) => {
      text(c, x, { size: opts.size ?? 22, weight: opts.weight, color: opts.color, width: cols[i].w - (cols[i].right ? 0 : 12), right: cols[i].right })
      x += cols[i].w
    })
    y += (opts.size ?? 22) * 1.7
  }
  line('Expenses', { size: 32, weight: 700 })
  row(cols.map((c) => c.label), { weight: 600, color: MUTED, size: 20 })
  hr()
  for (const r of report.rows) row([r.day, r.time || '–', r.title, r.category, r.payment, r.amount])
  hr()
  row(['Total', '', '', '', '', report.total], { weight: 700, size: 24 })

  // Receipts
  if (proofs.length > 0) {
    y += 36
    line('Receipts', { size: 32, weight: 700 })
    for (const p of proofs) {
      y += 12
      line(p.caption, { size: 24, weight: 600 })
      if (p.img) {
        // Full width, but very tall receipts are capped so the image stays a sensible size
        const s = Math.min(INNER / p.img.naturalWidth, 1800 / p.img.naturalHeight)
        const w = p.img.naturalWidth * s
        const h = p.img.naturalHeight * s
        if (draw) {
          ctx.fillStyle = RULE
          ctx.fillRect(PAD + (INNER - w) / 2 - 1, y - 1, w + 2, h + 2)
          ctx.drawImage(p.img, PAD + (INNER - w) / 2, y, w, h)
        }
        y += h + 20
      } else {
        const why = isPdf(p.receipt) ? `PDF receipt: ${p.receipt.filename} (included in the PDF download)` : `${p.receipt.filename} couldn't be shown`
        line(why, { size: 22, color: MUTED })
      }
    }
  }

  return Math.ceil(y + PAD)
}
