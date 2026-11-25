import { moodBand } from '@/lib/mood'

type DotProps = { cx?: number; cy?: number; index?: number; payload?: { mood?: number | null } }

/** A chart dot in the mood's colour (lib/mood.ts), with a thin card-coloured ring. */
export function MoodDot({ cx, cy, index, payload }: DotProps) {
  if (cx == null || cy == null || payload?.mood == null) return <g key={index} />
  return <circle key={index} cx={cx} cy={cy} r={4} fill={moodBand(payload.mood).color} stroke="var(--card)" strokeWidth={1.5} />
}
