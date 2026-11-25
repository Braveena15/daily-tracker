// Water on the Today page (and on past days opened from History): a ring showing "1.25 / 2.0 L",
// quick-add buttons that save straight away, an "Undo" for a few seconds after each add, and an
// Edit button to set the day's total directly. The individual drinks aren't listed.
// Water isn't part of the daily scores.
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Check, GlassWater, Minus, Pencil, Plus, Undo2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { InputWithUnit } from '@/components/InputWithUnit'
import { ProgressRing } from '@/components/ProgressRing'
import { Section } from '@/components/CheckinFields'
import { TimeField } from '@/components/day/TimeField'
import { useFetch } from '@/hooks/useFetch'
import { useTimeInput } from '@/hooks/useTimeInput'
import type { DayActions } from '@/hooks/useDay'
import type { DayResponse, WaterLog } from '@/lib/entries'
import {
  DEFAULT_GLASS_ML,
  DEFAULT_WATER_GOAL_ML,
  WATER_MAX_ML,
  WATER_MIN_ML,
  litres,
  litres1,
  parseWaterAmount,
  waterTotalMax,
  waterTotalOf,
} from '@/lib/water'

const UNDO_MS = 6000
const STEP_ML = 250

/** What the line under the buttons says: "Added 500 ml · Undo", or "Water updated ✓" after an edit */
type Status = { kind: 'added'; id: string; amountMl: number } | { kind: 'updated' }

export function WaterCard({
  logs,
  isToday,
  actions,
}: {
  logs: WaterLog[]
  isToday: boolean
  actions: Pick<DayActions, 'add' | 'remove' | 'setWaterTotal'>
}) {
  const { data } = useFetch<{ goals: { waterGoalMl: number; glassSizeMl: number } }>('/profile')
  const goalMl = data?.goals.waterGoalMl ?? DEFAULT_WATER_GOAL_ML
  const glassMl = data?.goals.glassSizeMl ?? DEFAULT_GLASS_ML
  const total = waterTotalOf(logs)
  const reached = total >= goalMl
  const time = useTimeInput({ isToday })
  const dayName = isToday ? 'today' : 'this day'

  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<Status | null>(null)
  const [customOpen, setCustomOpen] = useState(false)
  const [custom, setCustom] = useState('')
  const [customError, setCustomError] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const statusTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(statusTimer.current), [])

  function show(next: Status) {
    setStatus(next)
    clearTimeout(statusTimer.current)
    statusTimer.current = setTimeout(() => setStatus(null), UNDO_MS)
  }

  async function add(amountMl: number) {
    const timeError = time.error()
    if (timeError) return toast.error(timeError)
    setBusy(true)
    try {
      const res = (await actions.add('water', { amountMl, ...time.body(false) })) as DayResponse & { id?: string }
      if (res.id) show({ kind: 'added', id: res.id, amountMl })
      return true
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not add water')
      return false
    } finally {
      setBusy(false)
    }
  }

  async function undo() {
    if (status?.kind !== 'added') return
    clearTimeout(statusTimer.current)
    const { id } = status
    setStatus(null)
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
      hint={reached ? `Goal reached for ${dayName}` : `Goal ${litres1(goalMl)} · change it on your Profile`}
      icon={GlassWater}
      tone="outdoor"
    >
      <div className="flex flex-wrap items-center gap-5">
        <div className="flex flex-col items-center gap-1">
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
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            aria-label={`Edit ${dayName}'s water total`}
            onClick={() => setEditing(true)}
          >
            <Pencil aria-hidden /> Edit
          </Button>
        </div>

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

          {/* "✓ Added 500 ml · Undo" for a few seconds after an add, or "Water updated ✓" after an edit */}
          <div aria-live="polite" className="min-h-6">
            {status?.kind === 'added' && (
              <p className="flex animate-in items-center gap-2 text-sm duration-200 fade-in-0">
                <Check className="size-4 text-success" aria-hidden />
                <span>Added {status.amountMl} ml</span>
                <Button type="button" variant="ghost" size="sm" className="text-muted-foreground" onClick={() => void undo()}>
                  <Undo2 aria-hidden /> Undo
                </Button>
              </p>
            )}
            {status?.kind === 'updated' && (
              <p className="flex animate-in items-center gap-2 text-sm duration-200 fade-in-0">
                <span>Water updated</span>
                <Check className="size-4 text-success" aria-label="done" />
              </p>
            )}
          </div>
        </div>
      </div>

      {editing && (
        <EditTotalDialog
          totalMl={total}
          goalMl={goalMl}
          dayName={dayName}
          onClose={() => setEditing(false)}
          onSave={async (ml) => {
            await actions.setWaterTotal(ml)
            setEditing(false)
            show({ kind: 'updated' })
          }}
        />
      )}
    </Section>
  )
}

/** "Today's water": the total in ml or litres ("1500", "1.5 L"), with − / + 250 ml steps. */
function EditTotalDialog({
  totalMl,
  goalMl,
  dayName,
  onClose,
  onSave,
}: {
  totalMl: number
  goalMl: number
  dayName: string
  onClose: () => void
  onSave: (ml: number) => Promise<void>
}) {
  const max = waterTotalMax(goalMl)
  const [text, setText] = useState(String(totalMl))
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const parsed = parseWaterAmount(text)
  const title = dayName === 'today' ? "Today's water" : "This day's water"

  /** − / + 250 ml from what's typed (or from the saved total when the box doesn't hold an amount) */
  function step(delta: number) {
    const from = parsed ?? totalMl
    setText(String(Math.min(max, Math.max(0, from + delta))))
    setError(null)
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (parsed === null) return setError('Enter an amount like "1500" or "1.5 L"')
    if (parsed > max) return setError(`That's more than ${litres(max)} (2 × your goal). Enter up to ${max} ml.`)
    setError(null)
    setBusy(true)
    try {
      await onSave(parsed)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save')
      setBusy(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <form onSubmit={submit} noValidate className="space-y-4">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>
              Set the total for {dayName}, in ml or litres. From 0 to {litres(max)}.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="water-total">{title}</Label>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" size="icon" aria-label={`${STEP_ML} ml less`} disabled={busy || (parsed ?? totalMl) <= 0} onClick={() => step(-STEP_ML)}>
                <Minus />
              </Button>
              <Input
                id="water-total"
                className="text-center text-lg tabular-nums"
                inputMode="decimal"
                autoComplete="off"
                value={text}
                onChange={(e) => {
                  setText(e.target.value)
                  setError(null)
                }}
                aria-invalid={error ? true : undefined}
                aria-describedby="water-total-hint"
                autoFocus
              />
              <Button type="button" variant="outline" size="icon" aria-label={`${STEP_ML} ml more`} disabled={busy || (parsed ?? totalMl) >= max} onClick={() => step(STEP_ML)}>
                <Plus />
              </Button>
            </div>
            <p id="water-total-hint" className={error ? 'text-sm text-destructive' : 'text-sm text-muted-foreground tabular-nums'} role={error ? 'alert' : undefined}>
              {error ?? (parsed === null ? 'e.g. 1500 or 1.5 L' : `= ${parsed.toLocaleString()} ml`)}
            </p>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" loading={busy} disabled={busy}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
