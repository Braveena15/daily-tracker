// Water on the Today page: a ring showing "1.25 / 2.0 L", quick-add buttons that save straight away,
// an "Undo" for a few seconds after each add, and the day's drinks with their times.
// Water isn't part of the daily scores.
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Check, GlassWater, Plus, Undo2, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { InputWithUnit } from '@/components/InputWithUnit'
import { ProgressRing } from '@/components/ProgressRing'
import { Section } from '@/components/CheckinFields'
import { TimeField } from '@/components/day/TimeField'
import { useFetch } from '@/hooks/useFetch'
import { useTimeInput } from '@/hooks/useTimeInput'
import type { DayActions } from '@/hooks/useDay'
import type { DayResponse, WaterLog } from '@/lib/entries'
import { timeOf } from '@/lib/healthSync'
import { DEFAULT_GLASS_ML, DEFAULT_WATER_GOAL_ML, WATER_MAX_ML, WATER_MIN_ML, litres, litres1, waterTotalOf } from '@/lib/water'

const UNDO_MS = 6000

type Added = { id: string; amountMl: number }

export function WaterCard({
  logs,
  isToday,
  actions,
}: {
  logs: WaterLog[]
  isToday: boolean
  actions: Pick<DayActions, 'add' | 'remove'>
}) {
  const { data } = useFetch<{ goals: { waterGoalMl: number; glassSizeMl: number } }>('/profile')
  const goalMl = data?.goals.waterGoalMl ?? DEFAULT_WATER_GOAL_ML
  const glassMl = data?.goals.glassSizeMl ?? DEFAULT_GLASS_ML
  const total = waterTotalOf(logs)
  const reached = total >= goalMl
  const time = useTimeInput({ isToday })

  const [busy, setBusy] = useState(false)
  const [added, setAdded] = useState<Added | null>(null)
  const [customOpen, setCustomOpen] = useState(false)
  const [custom, setCustom] = useState('')
  const [customError, setCustomError] = useState<string | null>(null)
  const undoTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(undoTimer.current), [])

  async function add(amountMl: number) {
    const timeError = time.error()
    if (timeError) return toast.error(timeError)
    setBusy(true)
    try {
      const res = (await actions.add('water', { amountMl, ...time.body(false) })) as DayResponse & { id?: string }
      if (res.id) {
        setAdded({ id: res.id, amountMl })
        clearTimeout(undoTimer.current)
        undoTimer.current = setTimeout(() => setAdded(null), UNDO_MS)
      }
      return true
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not add water')
      return false
    } finally {
      setBusy(false)
    }
  }

  async function undo() {
    if (!added) return
    clearTimeout(undoTimer.current)
    const { id } = added
    setAdded(null)
    try {
      await actions.remove('water', id)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not undo')
    }
  }

  async function submitCustom(e: FormEvent) {
    e.preventDefault()
    const ml = Number(custom)
    if (!Number.isInteger(ml) || ml < WATER_MIN_ML || ml > WATER_MAX_ML) {
      return setCustomError(`Enter a whole number from ${WATER_MIN_ML} to ${WATER_MAX_ML} ml`)
    }
    setCustomError(null)
    if (await add(ml)) {
      setCustom('')
      setCustomOpen(false)
    }
  }

  return (
    <Section
      title="Water"
      hint={reached ? 'Goal reached for today' : `Goal ${litres1(goalMl)} · change it on your Profile`}
      icon={GlassWater}
      tone="outdoor"
    >
      <div className="flex flex-wrap items-center gap-5">
        <ProgressRing
          value={total}
          max={goalMl}
          size={112}
          stroke={10}
          className="stroke-outdoor"
          label={`${litres(total)} of ${litres1(goalMl)} water${reached ? ', goal reached' : ''}`}
        >
          <div className="text-center leading-tight">
            {reached ? (
              <Check className="mx-auto mb-0.5 size-5 text-outdoor-foreground" aria-hidden />
            ) : (
              <GlassWater className="mx-auto mb-0.5 size-5 text-outdoor-foreground" aria-hidden />
            )}
            <p className="font-heading text-lg font-semibold tabular-nums">{(total / 1000).toFixed(2).replace(/0$/, '')}</p>
            <p className="text-xs text-muted-foreground tabular-nums">/ {litres1(goalMl)}</p>
          </div>
        </ProgressRing>

        <div className="min-w-0 flex-1 basis-48 space-y-3">
          {reached && (
            <p className="flex items-center gap-1.5 rounded-xl bg-outdoor-soft px-3 py-2 text-sm text-outdoor-foreground">
              <Check className="size-4 shrink-0" aria-hidden /> Goal reached — nicely done.
            </p>
          )}
          {!isToday && <TimeField input={time} />}
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" disabled={busy} onClick={() => void add(glassMl)}>
              <Plus aria-hidden /> 1 glass ({glassMl} ml)
            </Button>
            <Button type="button" variant="secondary" disabled={busy} onClick={() => void add(500)}>
              <Plus aria-hidden /> 500 ml
            </Button>
            <Button type="button" variant="outline" aria-expanded={customOpen} onClick={() => setCustomOpen((o) => !o)}>
              Custom
            </Button>
          </div>

          {customOpen && (
            <form className="flex flex-wrap items-start gap-2" onSubmit={submitCustom} noValidate>
              <div className="w-36 space-y-1">
                <Label htmlFor="water-custom" className="sr-only">
                  Amount in ml
                </Label>
                <InputWithUnit
                  id="water-custom"
                  unit="ml"
                  inputMode="numeric"
                  placeholder="e.g. 330"
                  value={custom}
                  onChange={(e) => setCustom(e.target.value.replace(/[^\d]/g, ''))}
                  aria-invalid={customError ? true : undefined}
                  aria-describedby={customError ? 'water-custom-error' : undefined}
                  autoFocus
                />
              </div>
              <Button type="submit" loading={busy}>
                <Plus aria-hidden /> Add
              </Button>
              {customError && (
                <p id="water-custom-error" className="basis-full text-sm text-destructive" role="alert">
                  {customError}
                </p>
              )}
            </form>
          )}

          {/* "✓ Added" with an Undo for a few seconds */}
          <div aria-live="polite" className="min-h-6">
            {added && (
              <p className="flex animate-in items-center gap-2 text-sm duration-200 fade-in-0">
                <Check className="size-4 text-success" aria-hidden />
                <span>Added {added.amountMl} ml</span>
                <Button type="button" variant="ghost" size="sm" className="text-muted-foreground" onClick={() => void undo()}>
                  <Undo2 aria-hidden /> Undo
                </Button>
              </p>
            )}
          </div>
        </div>
      </div>

      {logs.length > 0 && (
        <ul className="divide-y rounded-xl bg-muted/60" aria-label="Water today">
          {logs.map((log) => (
            <li key={log.id} className="flex items-center gap-3 py-1 pr-1 pl-3 text-sm">
              <time dateTime={log.loggedAt} className="w-11 shrink-0 font-medium text-muted-foreground tabular-nums">
                {timeOf(log.loggedAt)}
              </time>
              <span className="flex-1 tabular-nums">{log.amountMl} ml</span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="text-muted-foreground hover:text-destructive"
                aria-label={`Remove ${log.amountMl} ml at ${timeOf(log.loggedAt)}`}
                onClick={() =>
                  void actions.remove('water', log.id).catch((err: unknown) => toast.error(err instanceof Error ? err.message : 'Could not remove'))
                }
              >
                <X />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
}
