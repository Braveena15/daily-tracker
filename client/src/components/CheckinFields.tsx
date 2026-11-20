// Building blocks for the daily check-in form.
import { useId, useState, type KeyboardEvent, type ReactNode } from 'react'
import { Check, Plus, Watch, X, type LucideIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { IconBubble } from '@/components/IconBubble'
import { InputWithUnit } from '@/components/InputWithUnit'
import { newKey, type ActivityRow, type LearningRow, type TextRow } from '@/lib/checkinForm'
import { toneChipOn, type Tone } from '@/lib/tones'
import { cn } from '@/lib/utils'

/** One card of the form, with an icon in the area's colour. */
export function Section({
  title,
  hint,
  icon,
  tone = 'primary',
  aside,
  children,
}: {
  title: string
  hint?: string
  icon: LucideIcon
  tone?: Tone
  /** Shown at the end of the heading row, e.g. a badge */
  aside?: ReactNode
  children: ReactNode
}) {
  const headingId = useId()
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
      <CardContent className="space-y-5">{children}</CardContent>
    </Card>
  )
}

/** Ten tappable emoji buttons for a 1–10 rating. */
export function RatingPicker({
  label,
  value,
  onChange,
  emoji,
}: {
  label: string
  value: number | null
  onChange: (value: number) => void
  emoji: (value: number) => string
}) {
  return (
    <div role="radiogroup" aria-label={label}>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium">{label}</span>
        <span className="text-sm text-muted-foreground tabular-nums">
          {value === null ? 'Tap to choose' : `${emoji(value)} ${value}/10`}
        </span>
      </div>
      <div className="grid grid-cols-5 gap-2 sm:grid-cols-10">
        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => {
          const selected = value === n
          return (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={`${label} ${n} out of 10`}
              onClick={() => onChange(n)}
              className={cn(
                'flex h-14 flex-col items-center justify-center gap-0.5 rounded-xl border bg-card text-xs font-semibold text-muted-foreground tabular-nums transition-all outline-none hover:-translate-y-0.5 hover:border-primary/40 hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-95 dark:bg-input/30',
                selected &&
                  'border-primary bg-primary text-primary-foreground shadow-soft hover:border-primary hover:bg-primary dark:bg-primary',
              )}
            >
              <span className={cn('text-xl leading-none transition-opacity', !selected && 'opacity-75')} aria-hidden>
                {emoji(n)}
              </span>
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
}) {
  const id = useId()
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
      />
    </div>
  )
}

/** A small ⌚ for values that came from Apple Health. */
export function WatchMark({ className }: { className?: string }) {
  return (
    <span className={cn('text-physical-foreground', className)} title="From Apple Watch">
      <Watch className="inline size-3.5 align-[-2px]" aria-hidden />
      <span className="sr-only">(from Apple Watch)</span>
    </span>
  )
}

function RemoveButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label={label}
      onClick={onClick}
      className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
    >
      <X />
    </Button>
  )
}

/** Quick-add chips plus editable rows of { name, minutes, notes }. */
export function ActivityList({
  rows,
  onChange,
  chips,
  itemLabel,
  tone,
  minutesRequired = false,
}: {
  rows: ActivityRow[]
  onChange: (rows: ActivityRow[]) => void
  chips: string[]
  itemLabel: string
  tone: Tone
  minutesRequired?: boolean
}) {
  // Focus goes to the new row's minutes (chip) or name (custom)
  const [focus, setFocus] = useState<{ key: string; field: 'type' | 'durationMin' } | null>(null)

  function add(type: string) {
    const row = { key: newKey(), type, durationMin: '', notes: '' }
    onChange([...rows, row])
    setFocus({ key: row.key, field: type ? 'durationMin' : 'type' })
  }

  function update(key: string, field: keyof Omit<ActivityRow, 'key'>, value: string) {
    onChange(rows.map((r) => (r.key === key ? { ...r, [field]: value } : r)))
  }

  const added = new Set(rows.map((r) => r.type.trim().toLowerCase()))

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {chips.map((chip) => {
          const on = added.has(chip.toLowerCase())
          return (
            <Badge
              key={chip}
              asChild
              variant="outline"
              className={cn(
                'h-9 gap-1.5 rounded-full px-3.5 text-sm transition-all hover:-translate-y-0.5 hover:bg-muted active:scale-95',
                on && toneChipOn[tone],
              )}
            >
              <button type="button" onClick={() => add(chip)} aria-label={`Add ${chip}`}>
                {on ? <Check aria-hidden /> : <Plus aria-hidden />}
                {chip}
              </button>
            </Badge>
          )
        })}
        <Badge
          asChild
          variant="outline"
          className="h-9 gap-1.5 rounded-full border-dashed px-3.5 text-sm text-muted-foreground transition-all hover:-translate-y-0.5 hover:bg-muted hover:text-foreground active:scale-95"
        >
          <button type="button" onClick={() => add('')}>
            <Plus aria-hidden />
            Custom
          </button>
        </Badge>
      </div>

      {rows.length > 0 && (
        <ul className="space-y-3">
          {rows.map((row) => (
            <li
              key={row.key}
              className="grid animate-in grid-cols-[minmax(0,1fr)_6.5rem_auto] gap-2 rounded-xl bg-muted/60 p-3 duration-200 fade-in-0 slide-in-from-top-1"
            >
              <Input
                aria-label={`${itemLabel} name`}
                placeholder={`${itemLabel} name`}
                maxLength={100}
                value={row.type}
                autoFocus={focus?.key === row.key && focus.field === 'type'}
                onChange={(e) => update(row.key, 'type', e.target.value)}
              />
              <InputWithUnit
                unit="min"
                type="number"
                inputMode="numeric"
                min={minutesRequired ? 1 : 0}
                max={1440}
                step="1"
                aria-label={`${row.type || itemLabel} minutes`}
                placeholder={minutesRequired ? 'Mins' : 'Opt.'}
                value={row.durationMin}
                autoFocus={focus?.key === row.key && focus.field === 'durationMin'}
                onChange={(e) => update(row.key, 'durationMin', e.target.value)}
              />
              <RemoveButton
                label={`Remove ${row.type || itemLabel}`}
                onClick={() => onChange(rows.filter((r) => r.key !== row.key))}
              />
              {row.source === 'watch' && (
                <p className="col-span-3 -mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <WatchMark />
                  From Apple Watch{row.calories != null && ` · ${row.calories.toLocaleString()} kcal`} · replaced on the
                  next sync
                </p>
              )}
              <Input
                className="col-span-3"
                aria-label={`${row.type || itemLabel} notes`}
                placeholder="Notes (optional)"
                maxLength={500}
                value={row.notes}
                onChange={(e) => update(row.key, 'notes', e.target.value)}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** A list of short text items with add and remove. */
export function TextList({
  rows,
  onChange,
  placeholder,
  maxLength,
}: {
  rows: TextRow[]
  onChange: (rows: TextRow[]) => void
  placeholder: string
  maxLength: number
}) {
  const [draft, setDraft] = useState('')

  function add() {
    const text = draft.trim()
    if (!text) return
    onChange([...rows, { key: newKey(), text }])
    setDraft('')
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    // Enter adds the item instead of submitting the whole form
    if (e.key === 'Enter') {
      e.preventDefault()
      add()
    }
  }

  return (
    <div className="space-y-3">
      {rows.length > 0 && (
        <ul className="space-y-2">
          {rows.map((row) => (
            <li key={row.key} className="flex animate-in items-center gap-2 duration-200 fade-in-0">
              <span className="text-lg" aria-hidden>
                ✨
              </span>
              <Input
                aria-label="Good thing"
                maxLength={maxLength}
                value={row.text}
                onChange={(e) => onChange(rows.map((r) => (r.key === row.key ? { ...r, text: e.target.value } : r)))}
              />
              <RemoveButton
                label={`Remove "${row.text}"`}
                onClick={() => onChange(rows.filter((r) => r.key !== row.key))}
              />
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        <Input
          aria-label="Add a good thing"
          placeholder={placeholder}
          maxLength={maxLength}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
        />
        <Button type="button" variant="secondary" onClick={add} disabled={!draft.trim()}>
          <Plus aria-hidden />
          Add
        </Button>
      </div>
    </div>
  )
}

/** Learnings: topic, optional minutes and details, with add and remove. */
export function LearningList({ rows, onChange }: { rows: LearningRow[]; onChange: (rows: LearningRow[]) => void }) {
  const [focusKey, setFocusKey] = useState<string | null>(null)

  function update(key: string, field: keyof Omit<LearningRow, 'key'>, value: string) {
    onChange(rows.map((r) => (r.key === key ? { ...r, [field]: value } : r)))
  }

  function add() {
    const row = { key: newKey(), topic: '', details: '', minutes: '' }
    onChange([...rows, row])
    setFocusKey(row.key)
  }

  return (
    <div className="space-y-3">
      {rows.length > 0 && (
        <ul className="space-y-3">
          {rows.map((row) => (
            <li
              key={row.key}
              className="grid animate-in grid-cols-[minmax(0,1fr)_6.5rem_auto] gap-2 rounded-xl bg-muted/60 p-3 duration-200 fade-in-0 slide-in-from-top-1"
            >
              <Input
                aria-label="Learning topic"
                placeholder="What did you learn about?"
                maxLength={200}
                value={row.topic}
                autoFocus={focusKey === row.key}
                onChange={(e) => update(row.key, 'topic', e.target.value)}
              />
              <InputWithUnit
                unit="min"
                type="number"
                inputMode="numeric"
                min={0}
                max={1440}
                step="1"
                aria-label="Learning minutes"
                placeholder="Opt."
                value={row.minutes}
                onChange={(e) => update(row.key, 'minutes', e.target.value)}
              />
              <RemoveButton
                label={`Remove ${row.topic || 'learning'}`}
                onClick={() => onChange(rows.filter((r) => r.key !== row.key))}
              />
              <Textarea
                className="col-span-3 min-h-20"
                aria-label="Learning details"
                placeholder="Details (optional)"
                maxLength={2000}
                rows={2}
                value={row.details}
                onChange={(e) => update(row.key, 'details', e.target.value)}
              />
            </li>
          ))}
        </ul>
      )}
      <Button type="button" variant="outline" className="w-full border-dashed sm:w-auto" onClick={add}>
        <Plus aria-hidden />
        Add a learning
      </Button>
    </div>
  )
}
