// Small forms for adding (or editing) one timestamped entry. After a successful add the form clears,
// ready for the next one. Each form builds the request body for POST/PATCH /api/entries/:date/:kind.
import { useState, type FormEvent, type ReactNode } from 'react'
import { Check, Loader2, Plus } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { InputWithUnit } from '@/components/InputWithUnit'
import { TimeField } from '@/components/day/TimeField'
import { useTimeInput } from '@/hooks/useTimeInput'
import { RatingPicker } from '@/components/CheckinFields'
import { timeOf } from '@/lib/healthSync'
import { type Activity, type Learning, type MoodLog } from '@/lib/entries'
import { energyBand, moodBand } from '@/lib/mood'
import { toneChipOn, type Tone } from '@/lib/tones'
import { cn } from '@/lib/utils'

type Body = Record<string, unknown>

/** What every form gets. `initial` set means editing an existing entry. */
type FormProps<T> = {
  initial?: T
  isToday: boolean
  onSubmit: (body: Body) => Promise<unknown>
  onCancel?: () => void
}

/** An empty optional field: left out when adding, null (cleared) when editing. */
const blank = (editing: boolean) => (editing ? null : undefined)
const optionalText = (value: string, editing: boolean) => value.trim() || blank(editing)
const optionalNumber = (value: string, editing: boolean) => (value.trim() === '' ? blank(editing) : Number(value))

/** Busy state and the server's error message for one form. */
function useSubmit(onSubmit: (body: Body) => Promise<unknown>) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function run(body: Body | string, onDone: () => void) {
    if (typeof body === 'string') return setError(body)
    setBusy(true)
    setError(null)
    try {
      await onSubmit(body)
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save')
    } finally {
      setBusy(false)
    }
  }
  return { busy, error, run, clearError: () => setError(null) }
}

function FormFooter({
  busy,
  error,
  editing,
  label,
  onCancel,
  disabled,
  children,
}: {
  busy: boolean
  error: string | null
  editing: boolean
  label: string
  onCancel?: () => void
  disabled?: boolean
  children?: ReactNode
}) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-end gap-2">
        {children}
        <div className="ml-auto flex gap-2">
          {onCancel && (
            <Button type="button" variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
          )}
          <Button type="submit" disabled={busy || disabled}>
            {busy ? <Loader2 className="animate-spin" aria-hidden /> : editing ? <Check aria-hidden /> : <Plus aria-hidden />}
            {editing ? 'Save' : label}
          </Button>
        </div>
      </div>
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

const formClass = 'space-y-3'
const editClass = 'rounded-xl bg-muted/60 p-3'

// ---------- Mood check-in ----------

export function MoodForm({ initial, isToday, onSubmit, onCancel }: FormProps<MoodLog>) {
  const editing = initial !== undefined
  const [mood, setMood] = useState<number | null>(initial?.mood ?? null)
  const [energy, setEnergy] = useState<number | null>(initial?.energy ?? null)
  const [note, setNote] = useState(initial?.note ?? '')
  const time = useTimeInput({ isToday, initial: initial ? timeOf(initial.loggedAt) : undefined })
  const { busy, error, run, clearError } = useSubmit(onSubmit)

  function submit(e: FormEvent) {
    e.preventDefault()
    const timeError = time.error()
    if (timeError) return run(timeError, () => {})
    if (mood === null) return run('Tap your mood (1–10)', () => {})
    if (energy === null) return run('Tap your energy (1–10)', () => {})
    void run({ mood, energy, note: optionalText(note, editing), ...time.body(editing) }, () => {
      if (editing) return
      setMood(null)
      setEnergy(null)
      setNote('')
      time.reset()
    })
  }

  return (
    <form className={cn(formClass, editing && editClass)} onSubmit={submit} noValidate>
      <RatingPicker label="Mood" value={mood} onChange={(v) => (setMood(v), clearError())} scale={moodBand} />
      <RatingPicker label="Energy" value={energy} onChange={(v) => (setEnergy(v), clearError())} scale={energyBand} />
      <Input aria-label="Note (optional)" placeholder="A note (optional)" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
      <FormFooter busy={busy} error={error} editing={editing} label="Save check-in" onCancel={onCancel}>
        <TimeField input={time} />
      </FormFooter>
    </form>
  )
}

// ---------- Workouts, mental strength, outdoor ----------

export function ActivityForm({
  initial,
  isToday,
  onSubmit,
  onCancel,
  chips,
  tone,
  itemLabel,
  minutesRequired = false,
}: FormProps<Activity> & { chips: string[]; tone: Tone; itemLabel: string; minutesRequired?: boolean }) {
  const editing = initial !== undefined
  const [type, setType] = useState(initial?.type ?? '')
  const [minutes, setMinutes] = useState(initial?.durationMin != null ? String(initial.durationMin) : '')
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const time = useTimeInput({ isToday, initial: initial ? timeOf(initial.loggedAt) : undefined })
  const { busy, error, run } = useSubmit(onSubmit)

  function submit(e: FormEvent) {
    e.preventDefault()
    const timeError = time.error()
    if (timeError) return run(timeError, () => {})
    const name = type.trim()
    if (!name) return run(`Give the ${itemLabel.toLowerCase()} a name`, () => {})
    if (minutesRequired && !(Number(minutes) >= 1)) return run(`Enter how many minutes "${name}" took`, () => {})
    void run(
      {
        type: name,
        durationMin: minutesRequired ? Number(minutes) : optionalNumber(minutes, editing),
        notes: optionalText(notes, editing),
        ...time.body(editing),
      },
      () => {
        if (editing) return
        setType('')
        setMinutes('')
        setNotes('')
        time.reset()
      },
    )
  }

  return (
    <form className={cn(formClass, editing && editClass)} onSubmit={submit} noValidate>
      {!editing && (
        <div className="flex flex-wrap gap-2">
          {chips.map((chip) => {
            const on = type.trim().toLowerCase() === chip.toLowerCase()
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
                <button type="button" onClick={() => setType(chip)} aria-pressed={on}>
                  {on ? <Check aria-hidden /> : <Plus aria-hidden />}
                  {chip}
                </button>
              </Badge>
            )
          })}
        </div>
      )}
      <div className="grid grid-cols-[minmax(0,1fr)_6.5rem] gap-2">
        <Input aria-label={`${itemLabel} name`} placeholder={`${itemLabel} name`} maxLength={100} value={type} onChange={(e) => setType(e.target.value)} />
        <InputWithUnit
          unit="min"
          type="number"
          inputMode="numeric"
          min={minutesRequired ? 1 : 0}
          max={1440}
          step="1"
          aria-label={`${type || itemLabel} minutes`}
          placeholder={minutesRequired ? 'Mins' : 'Opt.'}
          value={minutes}
          onChange={(e) => setMinutes(e.target.value)}
        />
      </div>
      <Input aria-label="Notes (optional)" placeholder="Notes (optional)" maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} />
      <FormFooter busy={busy} error={error} editing={editing} label="Add" onCancel={onCancel}>
        <TimeField input={time} />
      </FormFooter>
    </form>
  )
}

// ---------- Good things, present moments ----------

export function TextForm({
  initial,
  isToday,
  onSubmit,
  onCancel,
  placeholder,
  label,
  maxLength,
  multiline = false,
}: FormProps<{ text: string; loggedAt: string }> & { placeholder: string; label: string; maxLength: number; multiline?: boolean }) {
  const editing = initial !== undefined
  const [text, setText] = useState(initial?.text ?? '')
  const time = useTimeInput({ isToday, initial: initial ? timeOf(initial.loggedAt) : undefined })
  const { busy, error, run } = useSubmit(onSubmit)

  function submit(e: FormEvent) {
    e.preventDefault()
    const timeError = time.error()
    if (timeError) return run(timeError, () => {})
    if (!text.trim()) return run('Write a few words first', () => {})
    void run({ text: text.trim(), ...time.body(editing) }, () => {
      if (editing) return
      setText('')
      time.reset()
    })
  }

  return (
    <form className={cn(formClass, editing && editClass)} onSubmit={submit} noValidate>
      {multiline ? (
        <div className="space-y-1.5">
          <Textarea
            className="min-h-28 font-serif text-lg leading-relaxed md:text-lg"
            aria-label={label}
            rows={3}
            maxLength={maxLength}
            placeholder={placeholder}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <p className="text-right text-xs text-muted-foreground tabular-nums">
            {text.length} / {maxLength}
          </p>
        </div>
      ) : (
        <Input aria-label={label} placeholder={placeholder} maxLength={maxLength} value={text} onChange={(e) => setText(e.target.value)} />
      )}
      <FormFooter busy={busy} error={error} editing={editing} label="Add" onCancel={onCancel} disabled={!text.trim()}>
        <TimeField input={time} />
      </FormFooter>
    </form>
  )
}

// ---------- Learnings ----------

export function LearningForm({ initial, isToday, onSubmit, onCancel }: FormProps<Learning>) {
  const editing = initial !== undefined
  const [topic, setTopic] = useState(initial?.topic ?? '')
  const [minutes, setMinutes] = useState(initial?.minutes != null ? String(initial.minutes) : '')
  const [details, setDetails] = useState(initial?.details ?? '')
  const time = useTimeInput({ isToday, initial: initial ? timeOf(initial.loggedAt) : undefined })
  const { busy, error, run } = useSubmit(onSubmit)

  function submit(e: FormEvent) {
    e.preventDefault()
    const timeError = time.error()
    if (timeError) return run(timeError, () => {})
    if (!topic.trim()) return run('Give the learning a topic', () => {})
    void run(
      { topic: topic.trim(), minutes: optionalNumber(minutes, editing), details: optionalText(details, editing), ...time.body(editing) },
      () => {
        if (editing) return
        setTopic('')
        setMinutes('')
        setDetails('')
        time.reset()
      },
    )
  }

  return (
    <form className={cn(formClass, editing && editClass)} onSubmit={submit} noValidate>
      <div className="grid grid-cols-[minmax(0,1fr)_6.5rem] gap-2">
        <Input aria-label="Learning topic" placeholder="What did you learn about?" maxLength={200} value={topic} onChange={(e) => setTopic(e.target.value)} />
        <InputWithUnit
          unit="min"
          type="number"
          inputMode="numeric"
          min={0}
          max={1440}
          step="1"
          aria-label="Learning minutes"
          placeholder="Opt."
          value={minutes}
          onChange={(e) => setMinutes(e.target.value)}
        />
      </div>
      <Textarea
        className="min-h-20"
        aria-label="Learning details"
        placeholder="Details (optional)"
        maxLength={2000}
        rows={2}
        value={details}
        onChange={(e) => setDetails(e.target.value)}
      />
      <FormFooter busy={busy} error={error} editing={editing} label="Add learning" onCancel={onCancel}>
        <TimeField input={time} />
      </FormFooter>
    </form>
  )
}
