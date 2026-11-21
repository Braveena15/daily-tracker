// "Today's purpose" at the top of the Today page: what the day is about, up to 3 focus values from
// your core values, up to 5 small intentions to tick off, and an evening reflection.
//
// One purpose per day, editable only during that day (Asia/Colombo; the server enforces it too):
// - a past day shows its purpose read-only, locked;
// - today shows the saved purpose with an Edit button, intentions you can tick and the reflection.
// The card is given `isToday` from a clock, so it locks by itself at midnight.
import { useState, type FormEvent } from 'react'
import { Check, Copy, Moon, Pencil, Plus, Star, Target, X } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Section } from '@/components/CheckinFields'
import { useFetch } from '@/hooks/useFetch'
import type { DayActions } from '@/hooks/useDay'
import { EditableUntilLabel, LockedLabel, PurposeDayView } from '@/components/purpose/PurposeDayView'
import { useNow } from '@/hooks/useClock'
import { hourInTimezone } from '@/lib/dates'
import { timeOf } from '@/lib/healthSync'
import type { Purpose } from '@/lib/mind'
import { MAX_FOCUS_VALUES, MAX_INTENTIONS, type DailyPurpose } from '@/lib/purpose'
import { toneChipOn } from '@/lib/tones'
import { cn } from '@/lib/utils'

const EVENING_HOUR = 18
// From 23:00 there's one hour left before the day locks
const LAST_HOUR = 23

type Actions = Pick<DayActions, 'savePurpose' | 'addIntention' | 'updateIntention' | 'removeIntention' | 'saveReflection'>

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

export function PurposeCard({ purpose, isToday, actions }: { purpose: DailyPurpose | null; isToday: boolean; actions: Actions }) {
  // Locked: a past day (also right after midnight, when the page moves on by itself)
  if (!isToday) {
    return (
      <Section title="Purpose" hint={purpose ? undefined : 'No purpose was set for this day.'} icon={Target} tone="mental" aside={<LockedLabel />}>
        {purpose && <PurposeDayView purpose={purpose} />}
      </Section>
    )
  }
  return <TodayPurpose purpose={purpose} actions={actions} />
}

function TodayPurpose({ purpose, actions }: { purpose: DailyPurpose | null; actions: Actions }) {
  const [editing, setEditing] = useState(false)
  const { data } = useFetch<{ purpose: Purpose }>('/purpose')
  const main = data?.purpose
  const hour = hourInTimezone(undefined, useNow())

  if (!purpose && !editing) {
    return (
      <Section title="Today's purpose" hint="Optional: one line on what today is about." icon={Target} tone="mental">
        <Button type="button" variant="outline" className="w-full border-dashed sm:w-auto" onClick={() => setEditing(true)}>
          <Target aria-hidden /> Set today's purpose
        </Button>
      </Section>
    )
  }

  const reminders = [
    hour >= LAST_HOUR && '1 hour left to edit today\'s purpose',
    hour >= EVENING_HOUR && !purpose?.reflection && 'Reflect on today before midnight',
  ].filter((r): r is string => Boolean(r))

  return (
    <Section
      title="Today's purpose"
      hint="What do I want today to be about?"
      icon={Target}
      tone="mental"
      aside={
        !editing && purpose ? (
          <Button type="button" variant="outline" size="sm" onClick={() => setEditing(true)}>
            <Pencil aria-hidden /> Edit
          </Button>
        ) : undefined
      }
    >
      <EditableUntilLabel />
      {reminders.length > 0 && (
        <ul className="space-y-1 rounded-xl bg-mental-soft/50 px-3 py-2 text-sm text-mental-foreground" role="status">
          {reminders.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      )}

      {editing || !purpose ? (
        <>
          <PurposeText purpose={purpose} statement={main?.purposeStatement ?? ''} onSave={(text) => actions.savePurpose({ text })} />
          <FocusValues
            chosen={purpose?.focusValues ?? []}
            coreValues={main?.coreValues ?? []}
            onChange={(focusValues) => attempt(() => actions.savePurpose({ focusValues }))}
          />
          <Intentions purpose={purpose} actions={actions} editable />
          {purpose && (
            <div className="flex justify-end">
              <Button type="button" onClick={() => setEditing(false)}>
                <Check aria-hidden /> Done
              </Button>
            </div>
          )}
        </>
      ) : (
        <>
          {(purpose.text || purpose.focusValues.length > 0) && (
            <PurposeDayView purpose={{ ...purpose, intentions: [], reflection: null }} />
          )}
          <Intentions purpose={purpose} actions={actions} editable={false} />
          <EveningReflection purpose={purpose} hour={hour} onSave={actions.saveReflection} />
        </>
      )}
    </Section>
  )
}

function PurposeText({ purpose, statement, onSave }: { purpose: DailyPurpose | null; statement: string; onSave: (text: string) => Promise<unknown> }) {
  const saved = purpose?.text ?? ''
  const [text, setText] = useState(saved)
  const [busy, setBusy] = useState(false)
  const dirty = text.trim() !== saved

  async function save(value: string) {
    if (busy || value.trim() === saved) return
    setBusy(true)
    if (await attempt(() => onSave(value.trim()))) toast.success("Today's purpose saved")
    setBusy(false)
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    void save(text)
  }

  return (
    <form className="space-y-2" onSubmit={submit} noValidate>
      <Label htmlFor="daily-purpose" className="sr-only">
        What do I want today to be about?
      </Label>
      <Textarea
        id="daily-purpose"
        className="min-h-20 font-serif text-lg leading-relaxed md:text-lg"
        rows={2}
        maxLength={500}
        placeholder={statement ? `Inspired by your purpose: “${statement}”` : 'What do I want today to be about?'}
        value={text}
        onChange={(e) => setText(e.target.value)}
        // Saved when you leave the box too, so it can't be lost by tapping elsewhere
        onBlur={() => void save(text)}
        aria-describedby="daily-purpose-hint"
      />
      <p id="daily-purpose-hint" className="sr-only">
        Saved when you leave the box
      </p>
      {(dirty || (statement && !text.trim())) && (
        <div className="flex flex-wrap items-center justify-end gap-2">
          {statement && !text.trim() && (
            // Your main purpose statement as today's purpose, ready to save or adjust
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => {
                setText(statement)
                void save(statement)
              }}
            >
              <Copy aria-hidden /> Use my purpose statement
            </Button>
          )}
          {dirty && (
            <Button loading={busy} type="submit" size="sm" disabled={busy}>
              Save purpose
            </Button>
          )}
        </div>
      )}
    </form>
  )
}

function FocusValues({ chosen, coreValues, onChange }: { chosen: string[]; coreValues: string[]; onChange: (values: string[]) => void }) {
  if (coreValues.length === 0) {
    return <p className="text-sm text-muted-foreground">Add core values on the Purpose page to pick today's focus values.</p>
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
function Intentions({ purpose, actions, editable }: { purpose: DailyPurpose | null; actions: Actions; editable: boolean }) {
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const intentions = purpose?.intentions ?? []
  const full = intentions.length >= MAX_INTENTIONS
  if (!editable && intentions.length === 0) return null

  async function add(e: FormEvent) {
    e.preventDefault()
    if (!draft.trim()) return
    setBusy(true)
    if (await attempt(() => actions.addIntention(draft.trim()))) setDraft('')
    setBusy(false)
  }

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">
        Intentions <span className="font-normal text-muted-foreground">(up to {MAX_INTENTIONS})</span>
      </p>
      {intentions.length > 0 && (
        <ul className="space-y-1.5">
          {intentions.map((i) => (
            <li key={i.id} className="flex items-center gap-3 rounded-xl bg-muted/60 px-3 py-2">
              <Checkbox
                id={`intention-${i.id}`}
                checked={i.done}
                // Ticking saves straight away, with the time
                onCheckedChange={(checked) => attempt(() => actions.updateIntention(i.id, { done: checked === true }))}
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
                  onClick={() => attempt(() => actions.removeIntention(i.id))}
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

function EveningReflection({ purpose, hour, onSave }: { purpose: DailyPurpose | null; hour: number; onSave: Actions['saveReflection'] }) {
  const saved = purpose?.reflection ?? null
  // Shown from 18:00, once reflected, or any time with a tap
  const [opened, setOpened] = useState(false)
  const [rating, setRating] = useState<number | null>(saved?.rating ?? null)
  const [note, setNote] = useState(saved?.note ?? '')
  const [busy, setBusy] = useState(false)
  const show = opened || saved !== null || hour >= EVENING_HOUR

  if (!show) {
    return (
      <Button type="button" variant="ghost" size="sm" className="text-muted-foreground" onClick={() => setOpened(true)}>
        <Moon aria-hidden /> Reflect on today now
      </Button>
    )
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (rating === null) return
    setBusy(true)
    if (await attempt(() => onSave({ rating, note: note.trim() || null }))) toast.success('Reflection saved')
    setBusy(false)
  }

  const dirty = rating !== (saved?.rating ?? null) || note.trim() !== (saved?.note ?? '')

  return (
    <form className="space-y-2 rounded-xl bg-mental-soft/50 p-3" onSubmit={submit} noValidate>
      <p className="flex items-center gap-1.5 text-sm font-medium">
        <Moon className="size-4 text-mental" aria-hidden /> How well did I live my purpose today?
      </p>
      <div role="radiogroup" aria-label="How well did I live my purpose today, 1 to 5" className="flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={rating === n}
            aria-label={`${n} out of 5`}
            onClick={() => setRating(n)}
            className={cn(
              'grid size-11 place-items-center rounded-lg transition-transform outline-none focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-90',
              rating !== null && n <= rating ? 'text-learning' : 'text-muted-foreground/60',
            )}
          >
            <Star className={cn('size-6', rating !== null && n <= rating && 'fill-current')} aria-hidden />
          </button>
        ))}
      </div>
      <Textarea aria-label="Reflection note (optional)" placeholder="A note (optional)" rows={2} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} />
      <div className="flex justify-end">
        <Button loading={busy} type="submit" size="sm" disabled={busy || rating === null || !dirty}>
          Save reflection
        </Button>
      </div>
    </form>
  )
}
