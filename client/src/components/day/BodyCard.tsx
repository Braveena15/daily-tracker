// The day's single values: weight, steps and active calories (one value each).
// Steps and calories usually come from the watch (⌚); typing a value always replaces it.
import { useState, type FormEvent } from 'react'
import { Check, Loader2, Ruler } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { NumberField, Section, WatchMark } from '@/components/CheckinFields'
import { dayOf, formatSyncTime, timeOf } from '@/lib/healthSync'
import type { DailyEntry, DailyInput, DayResponse, HealthSyncField } from '@/lib/entries'

type Field = 'weightKg' | 'steps' | 'activeCalories'
const FIELDS: Field[] = ['weightKg', 'steps', 'activeCalories']

const str = (n: number | null | undefined) => (n == null ? '' : String(n))
const fromEntry = (entry: DailyEntry | null) => Object.fromEntries(FIELDS.map((f) => [f, str(entry?.[f])])) as Record<Field, string>

export function BodyCard({
  date,
  today,
  entry,
  onSave,
}: {
  date: string
  today: string
  entry: DailyEntry | null
  onSave: (body: DailyInput) => Promise<DayResponse>
}) {
  const stored = fromEntry(entry)
  const [values, setValues] = useState(stored)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // A new sync (or save) replaces what's shown, unless you're in the middle of editing
  const [lastStored, setLastStored] = useState(stored)
  if (FIELDS.some((f) => stored[f] !== lastStored[f])) {
    setLastStored(stored)
    if (FIELDS.every((f) => values[f] === lastStored[f])) setValues(stored)
  }

  const changed = FIELDS.filter((f) => values[f].trim() !== stored[f])
  const synced = new Set<HealthSyncField>(entry?.healthSync?.fields ?? [])
  const fromWatch = (f: Field) => synced.has(f) && values[f] === stored[f]
  const sync = entry?.healthSync
  const syncLabel = sync ? (dayOf(sync.syncedAt) === date ? timeOf(sync.syncedAt) : formatSyncTime(sync.syncedAt, today)) : null
  const extras = [
    entry?.restingCalories != null && `Resting ${entry.restingCalories.toLocaleString()} kcal`,
    entry?.exerciseMinutes != null && `Exercise ${entry.exerciseMinutes} min`,
  ].filter(Boolean)

  async function submit(e: FormEvent) {
    e.preventDefault()
    const body: DailyInput = {}
    for (const f of changed) {
      const text = values[f].trim()
      const n = Number(text)
      if (text !== '' && !Number.isFinite(n)) return setError('Please enter numbers only')
      body[f] = text === '' ? null : n
    }
    setBusy(true)
    setError(null)
    try {
      const data = await onSave(body)
      setValues(fromEntry(data.entry))
      toast.success('Saved ✓', { description: data.profileWeightUpdated ? 'Your profile weight was updated too.' : undefined })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save')
    } finally {
      setBusy(false)
    }
  }

  const set = (f: Field) => (v: string) => {
    setValues((old) => ({ ...old, [f]: v }))
    setError(null)
  }

  return (
    <Section
      title="Body"
      hint="One value each for the day."
      icon={Ruler}
      tone="physical"
      aside={
        syncLabel && (
          <Badge variant="outline" className="gap-1 bg-card text-physical-foreground">
            <span aria-hidden>⌚</span> Synced · {syncLabel}
          </Badge>
        )
      }
    >
      <form className="space-y-4" onSubmit={submit} noValidate>
        <div className="grid gap-4 sm:grid-cols-3">
          <NumberField label="Weight" unit="kg" step="0.1" min={30} max={300} value={values.weightKg} onChange={set('weightKg')} fromWatch={fromWatch('weightKg')} />
          <NumberField label="Steps" unit="steps" step="1" min={0} max={200000} value={values.steps} onChange={set('steps')} fromWatch={fromWatch('steps')} />
          <NumberField
            label="Active calories"
            unit="kcal"
            step="1"
            min={0}
            max={10000}
            value={values.activeCalories}
            onChange={set('activeCalories')}
            fromWatch={fromWatch('activeCalories')}
          />
        </div>
        {extras.length > 0 && (
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <WatchMark /> {extras.join(' · ')}
          </p>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">Watch syncs only ever raise steps and calories. A value you type replaces them.</p>
          <Button type="submit" variant="secondary" disabled={busy || changed.length === 0} className="ml-auto">
            {busy ? <Loader2 className="animate-spin" aria-hidden /> : <Check aria-hidden />}
            Save
          </Button>
        </div>
        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
      </form>
    </Section>
  )
}
