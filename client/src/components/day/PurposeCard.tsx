// "What matters to me today" at the top of the Today page: up to 5 things today is about, each with
// how strongly I feel it (intensity 0–10) and optional focus values from my core values. One evening
// note covers the whole day.
//
// Today and past days are edited the same way (no lock at midnight); future days can't have any.
import { useId, useState, type FormEvent } from 'react'
import { Check, Copy, NotebookPen, Pencil, Plus, Target, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { Textarea } from '@/components/ui/textarea'
import { Section } from '@/components/CheckinFields'
import { useFetch } from '@/hooks/useFetch'
import type { PurposeActions } from '@/hooks/useDay'
import { FocusValueChips, IntensityBadge } from '@/components/purpose/PurposeDayView'
import type { Purpose } from '@/lib/mind'
import {
  DEFAULT_INTENSITY,
  MAX_FOCUS_VALUES,
  MAX_PURPOSES,
  daySummary,
  matchSuggestions,
  type DayPurpose,
  type DayPurposes,
} from '@/lib/purpose'
import { toneChipOn } from '@/lib/tones'
import { cn } from '@/lib/utils'

const TITLE = 'What matters to me today'

type Actions = PurposeActions

/** Runs a save, showing the server's message if it fails. */
async function attempt(run: () => Promise<unknown>): Promise<boolean> {
  try {
    await run()
    return true
  } catch (err) {
    toast.error(err instanceof Error ? err.message : 'Could not save')
    return false
  }
}

export function PurposeCard({ day, isToday, actions }: { day: DayPurposes; isToday: boolean; actions: Actions }) {
  return <TodayPurposes day={day} isToday={isToday} actions={actions} />
}

function TodayPurposes({ day, isToday, actions }: { day: DayPurposes; isToday: boolean; actions: Actions }) {
  const [adding, setAdding] = useState(false)
  const { data } = useFetch<{ purpose: Purpose }>('/purpose')
  // Wordings used on earlier days, offered while typing (the same thing, worded the same way)
  const { data: earlier } = useFetch<{ suggestions: string[] }>('/purpose/suggestions')
  const main = data?.purpose
  const { purposes } = day
  const title = isToday ? TITLE : 'What mattered'
  const full = purposes.length >= MAX_PURPOSES

  if (purposes.length === 0 && !adding && !day.reflectionNote) {
    return (
      <Section title={title} hint="Optional: one thing or several, and how strongly you feel each." icon={Target} tone="mental">
        <Button type="button" variant="outline" className="w-full border-dashed sm:w-auto" onClick={() => setAdding(true)}>
          <Target aria-hidden /> Add what matters today
        </Button>
      </Section>
    )
  }

  return (
    <Section title={title} hint={purposes.length > 0 ? daySummary(day) : 'What do I want today to be about?'} icon={Target} tone="mental">

      {purposes.length > 0 && (
        <ul className="space-y-3" aria-label={`${TITLE}: ${purposes.length} of ${MAX_PURPOSES}`}>
          {purposes.map((p, i) => (
            <PurposeBlock key={p.id} purpose={p} index={i} coreValues={main?.coreValues ?? []} actions={actions} />
          ))}
        </ul>
      )}

      {adding || purposes.length === 0 ? (
        <NewPurposeForm
          first={purposes.length === 0}
          statement={main?.purposeStatement ?? ''}
          coreValues={main?.coreValues ?? []}
          // Today's own items aren't suggested back
          suggestions={(earlier?.suggestions ?? []).filter((s) => !purposes.some((p) => p.text.trim().toLowerCase() === s.trim().toLowerCase()))}
          actions={actions}
          onDone={() => setAdding(false)}
        />
      ) : (
        !full && (
          <Button type="button" variant="outline" className="w-full border-dashed" onClick={() => setAdding(true)}>
            <Plus aria-hidden /> Add another
          </Button>
        )
      )}

      <EveningNote saved={day.reflectionNote} onSave={actions.saveReflectionNote} />
    </Section>
  )
}

/** "How strongly do I feel this?" 0–10, with the number shown. */
function IntensitySlider({ value, onChange, disabled }: { value: number; onChange: (n: number) => void; disabled?: boolean }) {
  const id = useId()
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <Label id={id}>How strongly do I feel this?</Label>
        <span className="font-heading text-lg font-semibold text-mental-foreground tabular-nums" aria-hidden>
          {value}/10
        </span>
      </div>
      <Slider
        aria-labelledby={id}
        aria-valuetext={`${value} out of 10`}
        min={0}
        max={10}
        step={1}
        value={[value]}
        onValueChange={([n]) => onChange(n ?? value)}
        disabled={disabled}
        className="py-2"
      />
      <div className="flex justify-between text-xs text-muted-foreground" aria-hidden>
        <span>0 · barely</span>
        <span>10 · very strongly</span>
      </div>
    </div>
  )
}

/** A new item: its text (with earlier wordings offered while typing), intensity and optional focus values. */
function NewPurposeForm({
  first,
  statement,
  coreValues,
  suggestions,
  actions,
  onDone,
}: {
  first: boolean
  statement: string
  coreValues: string[]
  suggestions: string[]
  actions: Actions
  onDone: () => void
}) {
  const [text, setText] = useState('')
  const [intensity, setIntensity] = useState(DEFAULT_INTENSITY)
  const [values, setValues] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const matches = matchSuggestions(suggestions, text)

  async function add(value: string) {
    if (!value.trim() || busy) return
    setBusy(true)
    const body = { text: value.trim(), intensity, ...(values.length > 0 && { focusValues: values }) }
    if (await attempt(() => actions.addPurpose(body))) {
      setText('')
      setIntensity(DEFAULT_INTENSITY)
      setValues([])
      toast.success('Added')
      onDone()
    }
    setBusy(false)
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    void add(text)
  }

  return (
    <form className="space-y-4 rounded-2xl border border-dashed p-3" onSubmit={submit} noValidate>
      <div className="space-y-1.5">
        <Label htmlFor="new-purpose">{first ? 'What matters to me today?' : 'Something else that matters today'}</Label>
        <Input
          id="new-purpose"
          autoFocus={!first}
          autoComplete="off"
          className="font-serif text-lg md:text-lg"
          maxLength={500}
          placeholder={first && statement ? `Inspired by your purpose: “${statement}”` : 'e.g. Be patient with the kids'}
          value={text}
          onChange={(e) => setText(e.target.value)}
          aria-describedby={matches.length > 0 ? 'purpose-suggestions' : undefined}
        />
        {matches.length > 0 && (
          // Earlier wordings, so the same thing is written the same way (and counts as recurring)
          <div id="purpose-suggestions" className="flex flex-wrap items-center gap-1.5 pt-1" role="group" aria-label="Used before">
            <span className="text-xs text-muted-foreground">Used before:</span>
            {matches.map((s) => (
              <Badge key={s} asChild variant="outline" className="h-8 max-w-full rounded-full px-3 text-sm font-normal">
                <button type="button" onClick={() => setText(s)} className="truncate">
                  {s}
                </button>
              </Badge>
            ))}
          </div>
        )}
      </div>

      <IntensitySlider value={intensity} onChange={setIntensity} disabled={busy} />
      <FocusValuePicker chosen={values} coreValues={coreValues} onChange={setValues} optional />

      <div className="flex flex-wrap items-center justify-end gap-2">
        {first && statement && !text.trim() && (
          // Your main purpose statement as today's first item
          <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => void add(statement)}>
            <Copy aria-hidden /> Use my purpose statement
          </Button>
        )}
        {!first && (
          <Button type="button" variant="ghost" size="sm" onClick={onDone}>
            Cancel
          </Button>
        )}
        <Button loading={busy} type="submit" disabled={busy || !text.trim()}>
          <Plus aria-hidden /> Add
        </Button>
      </div>
    </form>
  )
}

/** One item: view (with its intensity, and intentions to tick when opened), edit, or delete (asks first). */
function PurposeBlock({ purpose, index, coreValues, actions }: { purpose: DayPurpose; index: number; coreValues: string[]; actions: Actions }) {
  const [editing, setEditing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const label = purpose.text || `Item ${index + 1}`

  async function remove() {
    setDeleting(true)
    if (await attempt(() => actions.removePurpose(purpose.id))) toast.success('Deleted')
    else setDeleting(false)
  }

  if (editing) {
    return (
      <li className="space-y-4 rounded-2xl bg-muted/40 p-3 ring-1 ring-foreground/5">
        <PurposeEditor purpose={purpose} index={index} actions={actions} onDone={() => setEditing(false)} />
        <FocusValuePicker
          chosen={purpose.focusValues}
          coreValues={coreValues}
          onChange={(focusValues) => void attempt(() => actions.updatePurpose(purpose.id, { focusValues }))}
          optional
        />
      </li>
    )
  }

  return (
    <li className="space-y-3 rounded-2xl bg-muted/40 p-3 ring-1 ring-foreground/5">
      <div className="flex items-start gap-2">
        <Target className="mt-1.5 size-4 shrink-0 text-mental" aria-hidden />
        <p className={cn('min-w-0 flex-1 font-serif text-lg leading-snug break-words', !purpose.text && 'text-muted-foreground italic')}>
          {purpose.text || 'Untitled'}
        </p>
        <div className="-my-1 flex shrink-0">
          <Button type="button" variant="ghost" size="icon" aria-label={`Edit "${label}"`} onClick={() => setEditing(true)}>
            <Pencil />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="text-muted-foreground hover:text-destructive"
            aria-label={`Delete "${label}"`}
            aria-expanded={confirmDelete}
            onClick={() => setConfirmDelete(true)}
          >
            <Trash2 />
          </Button>
        </div>
      </div>

      {confirmDelete && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-destructive/10 px-3 py-2 text-sm" role="alert">
          <span>Delete this?</span>
          <span className="flex gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmDelete(false)} disabled={deleting}>
              Keep it
            </Button>
            <Button type="button" variant="destructive" size="sm" loading={deleting} onClick={() => void remove()}>
              <Trash2 aria-hidden /> Delete
            </Button>
          </span>
        </div>
      )}

      {/* Under the text, so the text keeps the full width on a phone */}
      {(purpose.intensity !== null || purpose.focusValues.length > 0) && (
        <div className="flex flex-wrap items-center gap-1.5 pl-6">
          <IntensityBadge intensity={purpose.intensity} />
          <FocusValueChips values={purpose.focusValues} />
        </div>
      )}
    </li>
  )
}

/** The item's text and intensity, saved together. */
function PurposeEditor({ purpose, index, actions, onDone }: { purpose: DayPurpose; index: number; actions: Actions; onDone: () => void }) {
  const [text, setText] = useState(purpose.text)
  // Older items (from before intensity existed) start at the middle
  const [intensity, setIntensity] = useState(purpose.intensity ?? DEFAULT_INTENSITY)
  const [busy, setBusy] = useState(false)
  const id = `purpose-${purpose.id}`
  const changed = text.trim() !== purpose.text || intensity !== purpose.intensity

  async function save(e: FormEvent) {
    e.preventDefault()
    const value = text.trim()
    if (!value) return toast.error("It can't be empty — use Delete to remove it")
    if (!changed) return onDone()
    setBusy(true)
    const body = { ...(value !== purpose.text && { text: value }), ...(intensity !== purpose.intensity && { intensity }) }
    if (await attempt(() => actions.updatePurpose(purpose.id, body))) {
      toast.success('Saved')
      onDone()
    }
    setBusy(false)
  }

  return (
    <form className="space-y-4" onSubmit={save} noValidate>
      <div className="space-y-1.5">
        <Label htmlFor={id}>What matters ({index + 1})</Label>
        <Input id={id} autoFocus className="font-serif text-lg md:text-lg" maxLength={500} value={text} onChange={(e) => setText(e.target.value)} />
      </div>
      <IntensitySlider value={intensity} onChange={setIntensity} disabled={busy} />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onDone} disabled={busy}>
          Cancel
        </Button>
        <Button type="submit" size="sm" loading={busy} disabled={busy}>
          <Check aria-hidden /> Save
        </Button>
      </div>
    </form>
  )
}

function FocusValuePicker({
  chosen,
  coreValues,
  onChange,
  optional = false,
}: {
  chosen: string[]
  coreValues: string[]
  onChange: (values: string[]) => void
  optional?: boolean
}) {
  if (coreValues.length === 0) return null
  const isOn = (v: string) => chosen.some((c) => c.toLowerCase() === v.toLowerCase())
  const full = chosen.length >= MAX_FOCUS_VALUES

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">
        Focus values <span className="font-normal text-muted-foreground">({optional ? 'optional, ' : ''}up to {MAX_FOCUS_VALUES})</span>
      </p>
      <div className="flex flex-wrap gap-2">
        {coreValues.map((v) => {
          const on = isOn(v)
          return (
            <Badge
              key={v}
              asChild
              variant="outline"
              className={cn('h-9 rounded-full px-3.5 text-sm transition-all active:scale-95', on && toneChipOn.mental, !on && full && 'opacity-50')}
            >
              <button
                type="button"
                aria-pressed={on}
                disabled={!on && full}
                onClick={() => onChange(on ? chosen.filter((c) => c.toLowerCase() !== v.toLowerCase()) : [...chosen, v])}
              >
                {v}
              </button>
            </Badge>
          )
        })}
      </div>
    </div>
  )
}

/** One evening note for the whole day, below all the items: shown once written, or with a tap. */
function EveningNote({ saved, onSave }: { saved: string; onSave: Actions['saveReflectionNote'] }) {
  const [opened, setOpened] = useState(false)
  const [note, setNote] = useState(saved)
  const [busy, setBusy] = useState(false)
  const show = opened || saved !== ''

  if (!show) {
    return (
      <Button type="button" variant="ghost" size="sm" className="text-muted-foreground" onClick={() => setOpened(true)}>
        <NotebookPen aria-hidden /> Write an evening note
      </Button>
    )
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    if (await attempt(() => onSave(note.trim() || null))) toast.success(note.trim() ? 'Evening note saved' : 'Evening note cleared')
    setBusy(false)
  }

  const dirty = note.trim() !== saved

  return (
    <form className="space-y-2 rounded-xl bg-mental-soft/50 p-3" onSubmit={submit} noValidate>
      <Label htmlFor="evening-note" className="flex items-center gap-1.5">
        <NotebookPen className="size-4 text-mental" aria-hidden /> Evening note
      </Label>
      <Textarea id="evening-note" placeholder="How did today go?" rows={2} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} />
      <div className="flex justify-end">
        <Button loading={busy} type="submit" size="sm" disabled={busy || !dirty}>
          Save note
        </Button>
      </div>
    </form>
  )
}
