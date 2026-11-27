// The journey report as a PDF, made in the browser (pdf-lib is loaded only here): the summary,
// before vs after, weeks, what mattered most, the reflection, then the photos side by side.
import { embeddable, pdfText } from '@/lib/exportPdf'
import { formatLongDate } from '@/lib/dates'
import { photoUrl, ratingLabel, type ProgramReport } from '@/lib/program'

const A4: [number, number] = [595.28, 841.89]
const MARGIN = 48

async function photoBlob(fileId: string): Promise<Blob | null> {
  const res = await fetch(photoUrl(fileId), { credentials: 'include' })
  return res.ok ? res.blob() : null
}

export async function exportProgramPdf(r: ProgramReport): Promise<Blob> {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib')
  const doc = await PDFDocument.create()
  doc.setTitle(pdfText(r.title))
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const grey = rgb(0.4, 0.4, 0.4)
  const W = A4[0] - MARGIN * 2
  let page = doc.addPage(A4)
  let y = A4[1] - MARGIN

  const need = (h: number) => {
    if (y - h < MARGIN) {
      page = doc.addPage(A4)
      y = A4[1] - MARGIN
    }
  }
  /** Wrapped text */
  const text = (s: string, size = 11, f = font, color = rgb(0.1, 0.1, 0.1)) => {
    const words = pdfText(s).split(/\s+/)
    let line = ''
    const lines: string[] = []
    for (const w of words) {
      const next = line ? `${line} ${w}` : w
      if (f.widthOfTextAtSize(next, size) > W && line) {
        lines.push(line)
        line = w
      } else line = next
    }
    if (line) lines.push(line)
    for (const l of lines) {
      need(size + 4)
      page.drawText(l, { x: MARGIN, y: y - size, size, font: f, color })
      y -= size + 4
    }
  }
  const heading = (s: string) => {
    y -= 10
    need(30)
    text(s, 14, bold)
    y -= 2
  }

  text(r.title, 20, bold)
  text(`${r.name} · ${formatLongDate(r.range.from)} – ${formatLongDate(r.range.to)}`, 11, font, grey)
  if (r.status === 'ended_early') text('Every day you showed up counts.', 11, font, grey)
  if (r.aiSummary) {
    y -= 6
    text(r.aiSummary, 11)
  }

  const t = r.stats.totals
  heading('In numbers')
  text(
    [
      `${r.stats.daysLogged} of ${r.stats.daysCompleted} days logged (${r.stats.consistency}% consistency)`,
      `longest streak ${r.stats.streaks.longest} days`,
      `${t.workouts} workouts`,
      `${t.learningHours} h learning`,
      `${t.waterLitres} L water`,
      t.avgSleep !== null ? `${t.avgSleep} h average sleep` : null,
      t.avgMood !== null ? `average mood ${t.avgMood}/10` : null,
      r.stats.bestWeek ? `best week: week ${r.stats.bestWeek.week}` : null,
    ]
      .filter(Boolean)
      .join(' · '),
  )

  heading('Before and after')
  if (r.weight.before !== null || r.weight.latest !== null) {
    text(
      `Weight: ${r.weight.before ?? '—'} kg → ${r.weight.latest ?? '—'} kg${r.weight.goal !== null ? ` (goal ${r.weight.goal} kg)` : ''}${r.weight.progress !== null ? ` · ${r.weight.progress}% of the way` : ''}`,
    )
  }
  for (const m of r.measurements.filter((m) => m.before !== null || m.latest !== null)) {
    text(`${m.key.replace('Cm', '').replace(/^./, (c) => c.toUpperCase())}: ${m.before ?? '—'} → ${m.latest ?? '—'} cm`)
  }
  for (const row of r.ratings.filter((x) => x.before !== null || x.latest !== null)) {
    text(`${ratingLabel(row)}: ${row.before ?? '—'} → ${row.latest ?? '—'}${row.goal !== null ? ` (goal ${row.goal})` : ''}${row.progress !== null ? ` · ${row.progress}% of the way` : ''}`)
  }
  if (r.improvements.length) {
    heading('Improvements')
    for (const i of r.improvements) text(`• ${i}`)
  }

  heading('Week by week')
  for (const w of r.stats.weeks) {
    text(
      `Week ${w.week}${w.partial ? ' (partial)' : ''}: ${w.daysLogged}/${w.days} days logged${w.avgOverall !== null ? ` · score ${Math.round(w.avgOverall)}` : ''}${w.workouts ? ` · ${w.workouts} workouts` : ''}${w.weightKg !== null ? ` · ${w.weightKg} kg` : ''}`,
      10,
    )
  }

  if (r.stats.habits.length) {
    heading('Daily habits')
    for (const h of r.stats.habits) text(`${h.label}: ${h.daysDone} days (${h.percent}%)`)
  }
  if (r.recurringPurposes.length || r.topValues.length) {
    heading('What mattered most')
    for (const p of r.recurringPurposes) text(`• ${p.text} (${p.days} days)`)
    if (r.topValues.length) text(`Values: ${r.topValues.map((v) => v.value).join(', ')}`)
  }
  if (r.reflection) {
    heading('My final reflection')
    text(r.reflection)
  }

  // Photos: before on the left, after on the right
  const pairs = Math.max(r.photos.before.length, r.photos.after.length)
  if (pairs > 0) {
    page = doc.addPage(A4)
    y = A4[1] - MARGIN
    text('Photos: before and after', 14, bold)
    const colW = (W - 16) / 2
    for (let i = 0; i < pairs; i++) {
      const row = await Promise.all([r.photos.before[i], r.photos.after[i]].map(async (id) => (id ? photoBlob(id).then((b) => (b ? embeddable(b) : null)) : null)))
      const images = await Promise.all(row.map((img) => (img ? (img.type === 'png' ? doc.embedPng(img.bytes) : doc.embedJpg(img.bytes)) : null)))
      const h = Math.max(...images.map((img) => (img ? (img.height / img.width) * colW : 0)), 40)
      need(h + 10)
      images.forEach((img, col) => {
        if (img) page.drawImage(img, { x: MARGIN + col * (colW + 16), y: y - h, width: colW, height: (img.height / img.width) * colW })
      })
      y -= h + 16
    }
  }
  return new Blob([new Uint8Array(await doc.save())], { type: 'application/pdf' })
}
