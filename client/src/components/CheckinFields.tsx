// Building blocks for the Today page's cards and fields.
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { Plus, Watch, type LucideIcon } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { IconBubble } from '@/components/IconBubble'
import { InputWithUnit } from '@/components/InputWithUnit'
import type { Tone } from '@/lib/tones'
import { cn } from '@/lib/utils'

/** One card of the form, with an icon in the area's colour. */
export function Section({
  title,
  hint,
  icon,
  tone = 'primary',
  aside,
  collapsedLabel,
  children,
}: {
  title: string
  hint?: string
  icon: LucideIcon
  tone?: Tone
  /** Shown at the end of the heading row, e.g. a badge */
  aside?: ReactNode
  /**
   * "Add workout": while the section is empty it shows as one short row with this button, and
   * opens on a tap. Leave it out (or pass undefined once there are entries) to always show it.
   */
  collapsedLabel?: string
  children: ReactNode
}) {
  const headingId = useId()
  const [opened, setOpened] = useState(false)
  const contentRef = useRef<HTMLDivElement>(null)

  // After "Add …", move focus into the form so typing can start straight away
  useEffect(() => {
    if (!opened) return
    contentRef.current?.querySelector<HTMLElement>('input, textarea, button:not([disabled])')?.focus({ preventScroll: true })
  }, [opened])

  if (collapsedLabel && !opened) {
    return (
      <Card role="group" aria-labelledby={headingId} size="sm" className="relative">
        <div className="flex items-center gap-3 px-(--card-spacing)">
          <IconBubble icon={icon} tone={tone} />
          <div className="min-w-0 flex-1">
            <h2 id={headingId} className="text-lg leading-tight font-semibold">
              {title}
            </h2>
            {hint && <p className="mt-0.5 truncate text-sm text-muted-foreground">{hint}</p>}
          </div>
          {/* The whole row is the button (after:inset-0), so it's an easy tap target */}
          <button
            type="button"
            aria-expanded={false}
            onClick={() => setOpened(true)}
            className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl px-3 text-sm font-medium text-primary outline-none after:absolute after:inset-0 after:rounded-2xl hover:bg-secondary focus-visible:after:ring-3 focus-visible:after:ring-ring/50"
          >
            <Plus className="size-4" aria-hidden />
            {collapsedLabel}
          </button>
        </div>
      </Card>
    )
  }

  return (
    <Card role="group" aria-labelledby={headingId} className="gap-5">
      <div className="flex flex-wrap items-center gap-3 px-(--card-spacing)">
        <IconBubble icon={icon} tone={tone} />
        <div className="min-w-0">
          <h2 id={headingId} className="text-lg leading-tight font-semibold">
            {title}
          </h2>
          {hint && <p className="mt-0.5 text-sm text-muted-foreground">{hint}</p>}
        </div>
        {aside && <div className="ml-auto shrink-0">{aside}</div>}
      </div>
      <CardContent ref={contentRef} className={cn('space-y-5', opened && 'animate-in duration-200 fade-in-0 slide-in-from-top-1')}>
        {children}
      </CardContent>
    </Card>
  )
}

/** Ten tappable buttons for a 1–10 rating, each with its face (or icon) and word. */
export function RatingPicker({
  label,
  value,
  onChange,
  scale,
}: {
  label: string
  value: number | null
  onChange: (value: number) => void
  /** The word, icon and colour for a value (lib/mood.ts) */
  scale: (value: number) => { word: string; icon: LucideIcon; text?: string }
}) {
  const chosen = value === null ? null : scale(value)
  return (
    <div role="radiogroup" aria-label={label}>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium">{label}</span>
        <span className="flex items-center gap-1.5 text-sm text-muted-foreground tabular-nums" aria-live="polite">
          {chosen === null ? (
            'Tap to choose'
          ) : (
            <>
              <chosen.icon className={cn('size-4', chosen.text)} aria-hidden />
              <span className="font-medium text-foreground">{chosen.word}</span> · {value}/10
            </>
          )}
        </span>
      </div>
      <div className="grid grid-cols-5 gap-2 sm:grid-cols-10">
        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => {
          const selected = value === n
          const { icon: Icon, text, word } = scale(n)
          return (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={`${label} ${n} out of 10, ${word}`}
              onClick={() => onChange(n)}
              className={cn(
                'flex h-14 flex-col items-center justify-center gap-0.5 rounded-xl border bg-card text-xs font-semibold text-muted-foreground tabular-nums transition-all outline-none hover:-translate-y-0.5 hover:border-primary/40 hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-95 dark:bg-input/30',
                selected &&
                  'border-primary bg-primary text-primary-foreground shadow-soft hover:border-primary hover:bg-primary dark:bg-primary',
              )}
            >
              <Icon className={cn('size-5', selected ? 'text-primary-foreground' : text)} aria-hidden />
              {n}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/** A labelled number input with a unit shown inside it. */
export function NumberField({
  label,
  unit,
  value,
  onChange,
  step = 'any',
  min,
  max,
  placeholder,
  fromWatch = false,
  hint,
}: {
  label: string
  unit?: string
  value: string
  onChange: (value: string) => void
  step?: string
  min?: number
  max?: number
  placeholder?: string
  /** Shows a ⌚: the value came from Apple Health (it can still be edited) */
  fromWatch?: boolean
  /** A small line under the input */
  hint?: string
}) {
  const id = useId()
  const hintId = useId()
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>
        {label}
        {fromWatch && <WatchMark />}
      </Label>
      <InputWithUnit
        id={id}
        unit={unit}
        type="number"
        inputMode="decimal"
        step={step}
        min={min}
        max={max}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-describedby={hint ? hintId : undefined}
      />
      {hint && (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
    </div>
  )
}

/** A small ⌚ for values that came from Apple Health. */
export function WatchMark({ className }: { className?: string }) {
  return (
    <span className={cn('text-physical-foreground', className)} title="From Apple Watch">
      <Watch className="inline size-4 align-[-2px]" aria-hidden />
      <span className="sr-only">(from Apple Watch)</span>
    </span>
  )
}
