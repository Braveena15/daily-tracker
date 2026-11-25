// "Today's purposes" at the top of the Today page: up to 5 things today is about. Each purpose is
// its own small block with up to 3 focus values from your core values, up to 5 intentions to tick
// off and, in the evening, its own 1–5 rating. One evening note covers the whole day.
//
// Editable only during that day (Asia/Colombo; the server enforces it too):
// - a past day shows its purposes read-only, locked;
// - today shows each purpose with Edit and Delete, intentions you can tick and the evening rating.
// The card is given `isToday` from a clock, so it locks by itself at midnight.
import { useState, type FormEvent } from 'react'
import { Check, Copy, Moon, NotebookPen, Pencil, Plus, Star, Target, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Section } from '@/components/CheckinFields'
import { useFetch } from '@/hooks/useFetch'
import type { PurposeActions } from '@/hooks/useDay'
import { EditableUntilLabel, FocusValueChips, LockedLabel, PurposeDayView } from '@/components/purpose/PurposeDayView'
import { useNow } from '@/hooks/useClock'
import { hourInTimezone } from '@/lib/dates'
import { timeOf } from '@/lib/healthSync'
import type { Purpose } from '@/lib/mind'
import { MAX_FOCUS_VALUES, MAX_INTENTIONS, MAX_PURPOSES, daySummary, type DayPurpose, type DayPurposes } from '@/lib/purpose'
import { toneChipOn } from '@/lib/tones'
import { cn } from '@/lib/utils'

const EVENING_HOUR = 18
// From 23:00 there's one hour left before the day locks
const LAST_HOUR = 23

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
  // Locked: a past day (also right after midnight, when the page moves on by itself)
  if (!isToday) {
    const empty = day.purposes.length === 0 && !day.reflectionNote
    return (
      <Section
        title="Purposes"
        hint={empty ? 'No purpose was set for this day.' : day.purposes.length > 0 ? daySummary(day) : undefined}
        icon={Target}
        tone="mental"
        aside={<LockedLabel />}
      >
        {!empty && <PurposeDayView day={day} />}
      </Section>
    )
  }
  return <TodayPurposes day={day} actions={actions} />
}

function TodayPurposes({ day, actions }: { day: DayPurposes; actions: Actions }) {
  const [adding, setAdding] = useState(false)
  const { data } = useFetch<{ purpose: Purpose }>('/purpose')
  const main = data?.purpose
  const hour = hourInTimezone(undefined, useNow())
  const { purposes } = day
  const full = purposes.length >= MAX_PURPOSES

  if (purposes.length === 0 && !adding && !day.reflectionNote) {
    return (
      <Section title="Today's purposes" hint="Optional: what today is about — one or several." icon={Target} tone="mental">
        <Button type="button" variant="outline" className="w-full border-dashed sm:w-auto" onClick={() => setAdding(true)}>
          <Target aria-hidden /> Add today's purpose
        </Button>
      </Section>
    )
  }

  const reminders = [
    hour >= LAST_HOUR && "1 hour left to edit today's purposes",
    hour >= EVENING_HOUR && purposes.some((p) => p.rating === null) && 'Rate each purpose before midnight',
  ].filter((r): r is string => Boolean(r))

  return (
    <Section
      title={purposes.length === 1 ? "Today's purpose" : "Today's purposes"}
      hint={purposes.length > 0 ? daySummary(day) : 'What do I want today to be about?'}
      icon={Target}
      tone="mental"
    >
      <EditableUntilLabel />
      {reminders.length > 0 && (
        <ul className="space-y-1 rounded-xl bg-mental-soft/50 px-3 py-2 text-sm text-mental-foreground" role="status">
          {reminders.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      )}

      {purposes.length > 0 && (
        <ul className="space-y-3" aria-label={`Today's purposes, ${purposes.length} of ${MAX_PURPOSES}`}>
          {purposes.map((p, i) => (
            <PurposeBlock key={p.id} purpose={p} index={i} coreValues={main?.coreValues ?? []} hour={hour} actions={actions} />
          ))}
        </ul>
      )}

      {adding || purposes.length === 0 ? (
        <NewPurposeForm
          first={purposes.length === 0}
          statement={main?.purposeStatement ?? ''}
          coreValues={main?.coreValues ?? []}
          actions={actions}
          onDone={() => setAdding(false)}
        />
      ) : (
        !full && (
          <Button type="button" variant="outline" className="w-full border-dashed" onClick={() => setAdding(true)}>
            <Plus aria-hidden /> Add another purpose
          </Button>
        )
      )}

      <EveningNote saved={day.reflectionNote} hour={hour} onSave={actions.saveReflectionNote} />
    </Section>
  )
}

/** A new purpose: its text and (optionally) focus values. The first one can be your purpose statement. */
function NewPurposeForm({
  first,
  statement,
  coreValues,
  actions,
  onDone,
}: {
  first: boolean
  statement: string
  coreValues: string[]
  actions: Actions
  onDone: () => void
}) {
  const [text, setText] = useState('')
  const [values, setValues] = useState<string[]>([])
  const [busy, setBusy] = useState(false)

  async function add(value: string) {
    if (!value.trim() || busy) return
    setBusy(true)
    if (await attempt(() => actions.addPurpose({ text: value.trim(), ...(values.length > 0 && { focusValues: values }) }))) {
      setText('')
      setValues([])
      toast.success('Purpose added')
      onDone()
    }
    setBusy(false)
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    void add(text)
  }

  return (
    <form className="space-y-3 rounded-2xl border border-dashed p-3" onSubmit={submit} noValidate>
      <div className="space-y-1.5">
        <Label htmlFor="new-purpose">{first ? 'What do I want today to be about?' : 'Another purpose for today'}</Label>
        <Input
          id="new-purpose"
          autoFocus={!first}
          className="font-serif text-lg md:text-lg"
          maxLength={500}
          placeholder={first && statement ? `Inspired by your purpose: “${statement}”` : 'e.g. Be patient with the kids'}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </div>
      <FocusValuePicker chosen={values} coreValues={coreValues} onChange={setValues} />
      <div className="flex flex-wrap items-center justify-end gap-2">
        {first && statement && !text.trim() && (
          // Your main purpose statement as today's first purpose
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
          <Plus aria-hidden /> Add purpose
        </Button>
      </div>
    </form>
  )
}

/** One of today's purposes: view (tick intentions, rate it in the evening), edit, or delete (asks first). */
function PurposeBlock({
  purpose,
  index,
  coreValues,
  hour,
  actions,
}: {
  purpose: DayPurpose
  index: number
  coreValues: string[]
  hour: number
  actions: Actions
}) {
  const [editing, setEditing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const label = purpose.text || `Purpose ${index + 1}`

  async function remove() {
    setDeleting(true)
    if (await attempt(() => actions.removePurpose(purpose.id))) toast.success('Purpose deleted')
    else setDeleting(false)
  }

  return (
    <li className="space-y-3 rounded-2xl bg-muted/40 p-3 ring-1 ring-foreground/5">
      {editing ? (
        <PurposeTextEditor purpose={purpose} index={index} actions={actions} />
      ) : (
        <div className="flex items-start gap-2">
          <Target className="mt-1.5 size-4 shrink-0 text-mental" aria-hidden />
          <p className={cn('min-w-0 flex-1 font-serif text-lg leading-snug break-words', !purpose.text && 'text-muted-foreground italic')}>
            {purpose.text || 'Intentions for the day'}
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
      )}

      {confirmDelete && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-destructive/10 px-3 py-2 text-sm" role="alert">
          <span>Delete this purpose{purpose.intentions.length > 0 ? ' and its intentions' : ''}?</span>
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

      {editing ? (
        <FocusValuePicker
          chosen={purpose.focusValues}
          coreValues={coreValues}
          onChange={(focusValues) => void attempt(() => actions.updatePurpose(purpose.id, { focusValues }))}
        />
      ) : (
        <FocusValueChips values={purpose.focusValues} />
      )}

      <Intentions purpose={purpose} actions={actions} editable={editing} />

      {editing ? (
        <div className="flex justify-end">
          <Button type="button" size="sm" onClick={() => setEditing(false)}>
            <Check aria-hidden /> Done
          </Button>
        </div>
      ) : (
        <PurposeRating purpose={purpose} hour={hour} onRate={(rating) => actions.updatePurpose(purpose.id, { rating })} />
      )}
    </li>
  )
}

/** The purpose's text, saved when you leave the box or press Enter. */
function PurposeTextEditor({ purpose, index, actions }: { purpose: DayPurpose; index: number; actions: Actions }) {
  const [text, setText] = useState(purpose.text)
  const [busy, setBusy] = useState(false)
  const id = `purpose-${purpose.id}`

  async function save() {
    const value = text.trim()
    if (busy || value === purpose.text) return
    if (!value) return setText(purpose.text) // emptying the text doesn't delete it; use Delete
    setBusy(true)
    if (await attempt(() => actions.updatePurpose(purpose.id, { text: value }))) toast.success('Purpose saved')
    setBusy(false)
  }

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>Purpose {index + 1}</Label>
      <Input
        id={id}
        autoFocus
        className="font-serif text-lg md:text-lg"
        maxLength={500}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => void save()}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            void save()
          }
        }}
      />
    </div>
  )
}

function FocusValuePicker({ chosen, coreValues, onChange }: { chosen: string[]; coreValues: string[]; onChange: (values: string[]) => void }) {
  if (coreValues.length === 0) {
    return <p className="text-sm text-muted-foreground">Add core values on the Purpose page to pick focus values.</p>
  }
  const isOn = (v: string) => chosen.some((c) => c.toLowerCase() === v.toLowerCase())
  const full = chosen.length >= MAX_FOCUS_VALUES

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">
        Focus values <span className="font-normal text-muted-foreground">(up to {MAX_FOCUS_VALUES})</span>
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

/** `editable`: add and remove intentions (edit mode); ticking works in both modes. */
function Intentions({ purpose, actions, editable }: { purpose: DayPurpose; actions: Actions; editable: boolean }) {
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const { intentions } = purpose
  const full = intentions.length >= MAX_INTENTIONS
  if (!editable && intentions.length === 0) return null

  async function add(e: FormEvent) {
    e.preventDefault()
    if (!draft.trim()) return
    setBusy(true)
    if (await attempt(() => actions.addIntention(purpose.id, draft.trim()))) setDraft('')
    setBusy(false)
  }

  return (
    <div className="space-y-2">
      {editable && (
        <p className="text-sm font-medium">
          Intentions <span className="font-normal text-muted-foreground">(up to {MAX_INTENTIONS})</span>
        </p>
      )}
      {intentions.length > 0 && (
        <ul className="space-y-1.5">
          {intentions.map((i) => (
            <li key={i.id} className="flex items-center gap-3 rounded-xl bg-card/80 px-3 py-2">
              <Checkbox
                id={`intention-${i.id}`}
                checked={i.done}
                // Ticking saves straight away, with the time
                onCheckedChange={(checked) => attempt(() => actions.updateIntention(purpose.id, i.id, { done: checked === true }))}
              />
              <Label htmlFor={`intention-${i.id}`} className={cn('min-w-0 flex-1 font-normal break-words', i.done && 'text-muted-foreground line-through')}>
                {i.text}
              </Label>
              {i.done && i.doneAt && <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{timeOf(i.doneAt)}</span>}
              {editable && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="-my-1 shrink-0 text-muted-foreground hover:text-destructive"
                  aria-label={`Remove "${i.text}"`}
                  onClick={() => attempt(() => actions.removeIntention(purpose.id, i.id))}
                >
                  <X />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {editable && !full && (
        <form className="flex gap-2" onSubmit={add} noValidate>
          <Input aria-label="Add an intention" placeholder="e.g. Go cycling, Call Amma, Study 1 hour" maxLength={200} value={draft} onChange={(e) => setDraft(e.target.value)} />
          <Button loading={busy} type="submit" variant="secondary" disabled={busy || !draft.trim()}>
            <Plus aria-hidden /> Add
          </Button>
        </form>
      )}
    </div>
  )
}

/** "How well did I live this purpose today?" 1–5, saved on tap. Shown from 18:00, once rated, or with a tap. */
function PurposeRating({ purpose, hour, onRate }: { purpose: DayPurpose; hour: number; onRate: (rating: number) => Promise<unknown> }) {
  const [opened, setOpened] = useState(false)
  const [busy, setBusy] = useState(false)
  const rating = purpose.rating
  const show = opened || rating !== null || hour >= EVENING_HOUR

  if (!show) {
    return (
      <Button type="button" variant="ghost" size="sm" className="-ml-2 text-muted-foreground" onClick={() => setOpened(true)}>
        <Moon aria-hidden /> Rate this purpose now
      </Button>
    )
  }

  async function rate(n: number) {
    if (busy || n === rating) return
    setBusy(true)
    if (await attempt(() => onRate(n))) toast.success('Rating saved')
    setBusy(false)
  }

  const question = 'How well did I live this purpose today?'
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Moon className="size-4 text-mental" aria-hidden /> {question}
      </p>
      <div role="radiogroup" aria-label={`${question} 1 to 5`} aria-busy={busy} className="flex">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={rating === n}
            aria-label={`${n} out of 5`}
            disabled={busy}
            onClick={() => void rate(n)}
            className={cn(
              'grid size-10 place-items-center rounded-lg transition-transform outline-none focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-90',
              rating !== null && n <= rating ? 'text-learning' : 'text-muted-foreground/60',
            )}
          >
            <Star className={cn('size-5', rating !== null && n <= rating && 'fill-current')} aria-hidden />
          </button>
        ))}
      </div>
    </div>
  )
}

/** One evening note for the whole day, below all the purposes. Shown from 18:00, once written, or with a tap. */
function EveningNote({ saved, hour, onSave }: { saved: string; hour: number; onSave: Actions['saveReflectionNote'] }) {
  const [opened, setOpened] = useState(false)
  const [note, setNote] = useState(saved)
  const [busy, setBusy] = useState(false)
  const show = opened || saved !== '' || hour >= EVENING_HOUR

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
        <span className="font-normal text-muted-foreground">(for the whole day, optional)</span>
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
