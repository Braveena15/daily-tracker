// The day's single values: weight, steps and active calories (one value each), typed in by hand.
// Saving replaces the stored value; clearing a box clears it.
import { useState, type FormEvent } from 'react'
import { Check, Ruler } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { NumberField, Section } from '@/components/CheckinFields'
import type { DailyEntry, DailyInput, DayResponse } from '@/lib/entries'
import { FormError } from '@/components/StatusViews'

type Field = 'weightKg' | 'steps' | 'activeCalories'
const FIELDS: Field[] = ['weightKg', 'steps', 'activeCalories']

const str = (n: number | null | undefined) => (n == null ? '' : String(n))
const fromEntry = (entry: DailyEntry | null) => Object.fromEntries(FIELDS.map((f) => [f, str(entry?.[f])])) as Record<Field, string>

export function BodyCard({
  entry,
  onSave,
}: {
  entry: DailyEntry | null
  onSave: (body: DailyInput) => Promise<DayResponse>
}) {
  const stored = fromEntry(entry)
  const [values, setValues] = useState(stored)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // A save from another tab or device replaces what's shown, unless you're in the middle of editing
  const [lastStored, setLastStored] = useState(stored)
  if (FIELDS.some((f) => stored[f] !== lastStored[f])) {
    setLastStored(stored)
    if (FIELDS.every((f) => values[f] === lastStored[f])) setValues(stored)
  }

  const changed = FIELDS.filter((f) => values[f].trim() !== stored[f])

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
      toast.success('Saved', { description: data.profileWeightUpdated ? 'Your profile weight was updated too.' : undefined })
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
    >
      <form className="space-y-4" onSubmit={submit} noValidate>
        <div className="grid gap-4 sm:grid-cols-3">
          <NumberField label="Weight" unit="kg" step="0.1" min={30} max={300} value={values.weightKg} onChange={set('weightKg')} />
          <NumberField
            label="Steps"
            unit="steps"
            step="1"
            min={0}
            max={200000}
            placeholder="0"
            value={values.steps}
            onChange={set('steps')}
          />
          <NumberField
            label="Active calories"
            unit="kcal"
            step="1"
            min={0}
            max={10000}
            placeholder="0"
            value={values.activeCalories}
            onChange={set('activeCalories')}
          />
        </div>
        <div className="flex justify-end">
          <Button loading={busy} type="submit" variant="secondary" disabled={busy || changed.length === 0} className="ml-auto">
            <Check aria-hidden />
            Save
          </Button>
        </div>
        {error && (
          <FormError>{error}</FormError>
        )}
      </form>
    </Section>
  )
}
