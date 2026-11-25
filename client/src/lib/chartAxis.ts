// Shared y-axis helpers for every chart: round ("nice") ticks, short labels with units, and an
// axis width that fits the longest label, so numbers are never clipped on a phone.
//
//   const axis = niceAxis({ max: 3597, min: 0, format: fmtLitres })
//   <YAxis domain={axis.domain} ticks={axis.ticks} tickFormatter={axis.format} width={axis.width} />

/** Trims a number to at most `digits` decimals and drops trailing zeros: 1.50 → "1.5", 2.0 → "2". */
export function trimNumber(n: number, digits = 1): string {
  const f = 10 ** digits
  const rounded = Math.round(n * f) / f
  // Avoid "-0"
  return String(Object.is(rounded, -0) ? 0 : rounded)
}

/** 1000 → "1k", 1500 → "1.5k", 12 000 → "12k"; under 1000 unchanged. */
export function compact(n: number): string {
  return Math.abs(n) >= 1000 ? `${trimNumber(n / 1000, 1)}k` : trimNumber(n, 0)
}

// ---------- Formatters (labels for ticks) ----------

/** ml → "0 L", "1 L", "1.5 L" */
export const fmtLitres = (ml: number) => `${trimNumber(ml / 1000, 1)} L`
/** "54 kg", "53.5 kg" */
export const fmtKg = (kg: number) => `${trimNumber(kg, 1)} kg`
/** kcal: "0", "500", "1.5k" (use with `unit: 'kcal'`, so only the top label says "2k kcal") */
export const fmtKcal = (kcal: number) => compact(kcal)
/** "8 h" */
export const fmtHours = (h: number) => `${trimNumber(h, 1)} h`
/** "8k" steps */
export const fmtSteps = (steps: number) => compact(steps)
/** "50%" */
export const fmtPercent = (n: number) => `${trimNumber(n, 0)}%`
/** Plain whole numbers (scores 0–100, mood 0–10) */
export const fmtPlain = (n: number) => trimNumber(n, 1)

// ---------- Ticks ----------

/** The round step closest to `rough`: 1, 2, 2.5 or 5 times a power of ten. */
export function niceStep(rough: number): number {
  if (!(rough > 0) || !Number.isFinite(rough)) return 1
  const power = 10 ** Math.floor(Math.log10(rough))
  const fraction = rough / power
  const nice = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 2.5 ? 2.5 : fraction <= 5 ? 5 : 10
  return nice * power
}

/** Ticks from `lo` to `hi` (both on the step), without floating-point noise like 0.30000000000000004. */
export function niceTicks(lo: number, hi: number, step: number): number[] {
  const decimals = Math.max(0, -Math.floor(Math.log10(step)) + 2)
  const count = Math.round((hi - lo) / step)
  return Array.from({ length: count + 1 }, (_, i) => Number((lo + i * step).toFixed(decimals)))
}

export type Axis = {
  domain: [number, number]
  ticks: number[]
  format: (v: number) => string
  /** YAxis width (px) that fits the longest label */
  width: number
}

/**
 * A y-axis from `min` to `max` (the data and anything that must stay visible, such as a goal),
 * with a little headroom above, cut into about `targetTicks` round steps. The domain starts and
 * ends on a tick, so the top grid line is a labelled one. `step` forces a step size.
 */
export function niceDomain({
  min = 0,
  max,
  targetTicks = 4,
  headroom = 0.05,
  step,
  minStep = 0,
}: {
  min?: number
  max: number
  targetTicks?: number
  headroom?: number
  step?: number
  /** The smallest step allowed (e.g. 0.5 kg, so labels never need two decimals) */
  minStep?: number
}): { domain: [number, number]; ticks: number[]; step: number } {
  const top = max > min ? max + (max - min) * headroom : min + 1
  const s = step ?? Math.max(minStep, niceStep((top - min) / targetTicks))
  const lo = Math.floor(min / s + 1e-9) * s
  const hi = Math.max(lo + s, Math.ceil(top / s - 1e-9) * s)
  const ticks = niceTicks(lo, hi, s)
  return { domain: [ticks[0]!, ticks.at(-1)!], ticks, step: s }
}

/**
 * `unit`: added to the top label only ("2k kcal"), for units that would make every label long.
 */
export function niceAxis(options: Parameters<typeof niceDomain>[0] & { format: (v: number) => string; unit?: string }): Axis {
  const { domain, ticks } = niceDomain(options)
  const top = ticks.at(-1)
  const format = options.unit ? (v: number) => (v === top ? `${options.format(v)} ${options.unit}` : options.format(v)) : options.format
  return { domain, ticks, format, width: axisWidth(ticks.map(format)) }
}

/** Sleep hours: at least 0–10 h, in steps of 5 (or 4 up to 12 h), so the labels stay whole hours. */
export function hoursAxis(highest: number): Axis {
  const top = Math.max(10, Math.ceil(highest))
  return niceAxis({ max: top, headroom: 0, step: top <= 10 ? 5 : top <= 12 ? 4 : 5, format: fmtHours })
}

/** A fixed axis (e.g. scores 0–100) with the width its labels need. */
export function fixedAxis(ticks: number[], format: (v: number) => string = fmtPlain): Axis {
  return { domain: [ticks[0]!, ticks.at(-1)!], ticks, format, width: axisWidth(ticks.map(format)) }
}

// ---------- Widths ----------

// Tick labels are 12px (the chart's text-xs) with tabular numbers. These are generous widths
// for that size, used when the text can't be measured (tests, before fonts load).
const CHAR_PX: Record<string, number> = { '.': 3.6, ',': 3.6, ' ': 3.6, '%': 10.5, '−': 7.5, '-': 4.5, l: 3.2, i: 3.2, m: 10.5, k: 6.8, L: 6.8, h: 7, g: 7.2, c: 6.6, a: 6.9 }
const DIGIT_PX = 7.4
const DEFAULT_PX = 7.4

/** Text width at 12px: measured with a canvas when there is one, otherwise estimated. */
export function textWidth(text: string): number {
  const estimate = [...text].reduce((w, ch) => w + (/\d/.test(ch) ? DIGIT_PX : (CHAR_PX[ch] ?? DEFAULT_PX)), 0)
  const measured = measure(text)
  // Never trust a measurement that's much smaller than the estimate (e.g. a font not loaded yet)
  return measured === null ? estimate : Math.max(measured, estimate * 0.85)
}

let context: CanvasRenderingContext2D | null | undefined
function measure(text: string): number | null {
  if (typeof document === 'undefined') return null
  if (context === undefined) {
    try {
      context = document.createElement('canvas').getContext('2d')
    } catch {
      context = null
    }
  }
  if (!context) return null
  const family = getComputedStyle(document.body).fontFamily || 'sans-serif'
  context.font = `12px ${family}`
  return context.measureText(text).width
}

/** Space between the labels and the plot, matching AXIS.tickMargin, plus Recharts' tick size and a safety margin. */
const AXIS_GAP = 8 + 6 + 4

/** YAxis width that fits every label. */
export function axisWidth(labels: string[]): number {
  return Math.ceil(Math.max(0, ...labels.map(textWidth)) + AXIS_GAP)
}

// ---------- Water ----------

/**
 * Water: 0 to max(goal, highest day) rounded up to the next 0.5 L plus a little headroom, in
 * 1 L steps, or 0.5 L steps when that stays at or under 2 L. The goal is always inside.
 */
export function waterAxis(highestMl: number, goalMl: number): Axis {
  const top = Math.ceil((Math.max(goalMl, highestMl, 0) * 1.05) / 500) * 500 || 500
  const step = top <= 2000 ? 500 : 1000
  return niceAxis({ min: 0, max: top, headroom: 0, step, format: fmtLitres })
}
