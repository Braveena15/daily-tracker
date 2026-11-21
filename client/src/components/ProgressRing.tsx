import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/** A circular progress bar with content in the middle. `value` past `max` shows a full ring. */
export function ProgressRing({
  value,
  max,
  size = 160,
  stroke = 14,
  label,
  className,
  children,
}: {
  value: number
  max: number
  size?: number
  stroke?: number
  /** Read out by screen readers instead of the centre text */
  label: string
  /** Colour of the filled part, e.g. "stroke-primary" */
  className?: string
  children?: ReactNode
}) {
  const r = (size - stroke) / 2
  const circumference = 2 * Math.PI * r
  const fraction = max > 0 ? Math.min(Math.max(value / max, 0), 1) : 0

  return (
    <div className="relative grid shrink-0 place-items-center" style={{ width: size, height: size }} {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-muted" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - fraction)}
          className={cn('stroke-primary transition-[stroke-dashoffset] duration-700 ease-out', className)}
          // Hide the round cap "dot" when nothing has been eaten yet
          opacity={fraction === 0 ? 0 : 1}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center" aria-hidden>
        {children}
      </div>
    </div>
  )
}
