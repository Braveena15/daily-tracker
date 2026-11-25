// The Today page's Sleep card: the watch first, your own numbers as a fallback.
// - With the watch's sleep for the night: the ring, hours and stages, and an Edit to override the
//   hours or score (saved as "manual", so a later sync never overwrites them).
// - Without it: "Hours slept" and an optional "Sleep score (0–100)" to type in.
// Scores, charts and the weekly review use whichever value the day has.
import { useState, type FormEvent } from 'react'
import { Check, Moon, Pencil, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { NumberField, Section } from '@/components/CheckinFields'
import { SleepCard } from '@/components/SleepCard'
import { FormError } from '@/components/StatusViews'
import { manualSleep, type DailyEntry, type DailyInput, type DayResponse } from '@/lib/entries'

const str = (n: number | null | undefined) => (n == null ? '' : String(n))

export function SleepSection({ entry, onSave }: { entry: DailyEntry | null; onSave: (body: DailyInput) => Promise<DayResponse> }) {
  const [editing, setEditing] = useState(false)
  const watch = entry?.sleep ?? null
  const manual = manualSleep(entry)
  const hasManual = manual.hours !== null || manual.score !== null

  return (
    <Section
      title="Sleep"
      icon={Moon}
      tone="mental"
      aside={
        watch && !editing ? (
          <Button type="button" variant="outline" size="sm" aria-label="Edit sleep" onClick={() => setEditing(true)}>
            <Pencil aria-hidden /> Edit
          </Button>
        ) : undefined
      }
    >
      {watch && !editing ? (
        <SleepCard sleep={watch} override={hasManual ? manual : undefined} />
      ) : (
        <SleepForm
          // Without the watch's night, the form shows whatever the day has; while overriding it, only your own numbers
          initial={watch ? manual : { hours: entry?.sleepHours ?? null, score: entry?.sleepScoreValue ?? null }}
          withWatch={watch !== null}
          canReset={watch !== null && hasManual}
          onSave={onSave}
          onDone={() => setEditing(false)}
        />
      )}
    </Section>
  )
}

function SleepForm({
  initial,
  withWatch,
  canReset,
  onSave,
  onDone,
}: {
  initial: { hours: number | null; score: number | null }
  withWatch: boolean
  canReset: boolean
  onSave: (body: DailyInput) => Promise<DayResponse>
  onDone: () => void
}) {
  const [hours, setHours] = useState(str(initial.hours))
  const [score, setScore] = useState(str(initial.score))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const changed = hours.trim() !== str(initial.hours) || score.trim() !== str(initial.score)

  async function save(body: DailyInput, message: string) {
    setBusy(true)
    setError(null)
    try {
      await onSave(body)
      toast.success(message)
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save')
    } finally {
      setBusy(false)
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    const h = hours.trim()
    const s = score.trim()
    const hoursValue = h === '' ? null : Number(h)
    const scoreValue = s === '' ? null : Number(s)
    if (hoursValue !== null && (!Number.isFinite(hoursValue) || hoursValue < 0 || hoursValue > 24)) return setError('Hours slept must be from 0 to 24')
    if (scoreValue !== null && (!Number.isInteger(scoreValue) || scoreValue < 0 || scoreValue > 100)) {
      return setError('Sleep score must be a whole number from 0 to 100')
    }
    // An empty box goes back to the watch's value (or clears it when there's no watch data)
    void save({ sleepHours: hoursValue, sleepScoreValue: scoreValue }, 'Sleep saved')
  }

  return (
    <form className="space-y-4" onSubmit={submit} noValidate>
      {!withWatch && <p className="text-sm text-muted-foreground">No sleep from your watch for this night. Add it yourself if you like.</p>}
      <div className="grid gap-4 sm:grid-cols-2">
        <NumberField
          label="Hours slept"
          unit="h"
          step="0.25"
          min={0}
          max={24}
          placeholder="e.g. 7.5"
          value={hours}
          onChange={(v) => {
            setHours(v)
            setError(null)
          }}
          hint={withWatch ? 'Leave empty to use your watch' : undefined}
        />
        <NumberField
          label="Sleep score (optional, 0–100)"
          unit="/100"
          step="1"
          min={0}
          max={100}
          placeholder="e.g. 80"
          value={score}
          onChange={(v) => {
            setScore(v)
            setError(null)
          }}
          hint={withWatch ? 'Leave empty to use the calculated score' : undefined}
        />
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2">
        {canReset && (
          <Button
            type="button"
            variant="ghost"
            className="mr-auto text-muted-foreground"
            disabled={busy}
            onClick={() => void save({ sleepHours: null, sleepScoreValue: null }, 'Using your watch again')}
          >
            <RotateCcw aria-hidden /> Use watch values
          </Button>
        )}
        {withWatch && (
          <Button type="button" variant="outline" disabled={busy} onClick={onDone}>
            Cancel
          </Button>
        )}
        <Button loading={busy} type="submit" variant="secondary" disabled={busy || !changed}>
          <Check aria-hidden /> Save
        </Button>
      </div>
      {error && <FormError>{error}</FormError>}
    </form>
  )
}
