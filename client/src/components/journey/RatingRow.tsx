// One rating as a bar: where I started (light), now (solid) and a tick at my goal.
import { ratingLabel, type CompareRow } from '@/lib/program'

export function RatingRow({ row }: { row: CompareRow }) {
  const pct = (v: number | null) => (v === null ? 0 : v * 10)
  return (
    <li className="space-y-1">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="font-medium">{ratingLabel(row)}</span>
        <span className="text-muted-foreground tabular-nums">
          {row.before ?? '—'} → {row.latest ?? '—'}
          {row.goal !== null && ` (goal ${row.goal})`}
        </span>
      </div>
      {/* Started (light), now (solid) and a tick at the goal */}
      <div className="relative h-2.5 rounded-full bg-muted" aria-hidden>
        <div className="absolute inset-y-0 left-0 rounded-full bg-primary/30" style={{ width: `${pct(row.before)}%` }} />
        {row.latest !== null && <div className="absolute inset-y-0 left-0 rounded-full bg-primary" style={{ width: `${pct(row.latest)}%` }} />}
        {row.goal !== null && <div className="absolute -inset-y-0.5 w-0.5 rounded bg-foreground/70" style={{ left: `calc(${pct(row.goal)}% - 1px)` }} />}
      </div>
    </li>
  )
}
