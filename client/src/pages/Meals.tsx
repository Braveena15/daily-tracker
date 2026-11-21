import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { BookMarked, Check, Copy, Flame, Heart, Loader2, Plus, RotateCw, Watch, X } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { AddFoodSheet } from '@/components/AddFoodSheet'
import { DateBar } from '@/components/DateBar'
import { IconBubble } from '@/components/IconBubble'
import { PageHeader } from '@/components/PageHeader'
import { ProgressRing } from '@/components/ProgressRing'
import { Progress } from '@/components/ui/progress'
import { ServingsStepper } from '@/components/ServingsStepper'
import { ErrorNotice } from '@/components/StatusViews'
import { useDateParam } from '@/hooks/useDateParam'
import { api } from '@/lib/api'
import { addDays, timeInTimezone } from '@/lib/dates'
import {
  MEALS,
  formatServings,
  itemKcal,
  kcal,
  totals,
  type DaySummary,
  type MealDayResponse,
  type MealItem,
  type MealType,
  type Totals,
} from '@/lib/meals'
import { cn, newKey } from '@/lib/utils'

type Row = MealItem & { key: string }
type SaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error'

const AUTOSAVE_DELAY_MS = 800
const toRows = (items: MealItem[]): Row[] => items.map((i) => ({ ...i, key: newKey() }))
const toItems = (rows: Row[]): MealItem[] =>
  rows.map((row) => {
    const item: MealItem & { key?: string } = { ...row }
    delete item.key // the row key only exists in the browser
    return item
  })
const errorMessage = (err: unknown, fallback: string) => (err instanceof Error ? err.message : fallback)

export function Meals() {
  const { date, today, goTo } = useDateParam()

  return (
    <>
      <PageHeader
        title="Meals"
        action={
          <Button asChild variant="outline" size="sm" className="h-10 rounded-xl">
            <Link to="/foods">
              <BookMarked aria-hidden /> My Foods
            </Link>
          </Button>
        }
      />
      <div className="space-y-4 md:space-y-6">
        <LowIntakeNote />
        <DateBar date={date} today={today} onChange={goTo} />
        {/* key: a fresh editor (and a fresh load) for each date */}
        <MealEditor key={date} date={date} today={today} />
      </div>
    </>
  )
}

/** A gentle note when the last few logged days were well under what the body needs. No numbers. */
function LowIntakeNote() {
  const [low, setLow] = useState(false)

  useEffect(() => {
    api
      .get<{ lowIntake: boolean }>('/meals/stats/low-intake')
      .then((data) => setLow(data.lowIntake))
      .catch(() => setLow(false)) // only a nudge; stay quiet if it can't load
  }, [])

  if (!low) return null
  return (
    <Card size="sm" className="animate-in bg-secondary/60 ring-primary/15 fade-in-0">
      <CardContent className="flex items-start gap-3">
        <IconBubble icon={Heart} className="bg-card" />
        <p className="text-sm leading-relaxed text-secondary-foreground">
          You've eaten quite a bit less than your body needs for a few days. Fuelling well helps your energy, mood and
          progress.
        </p>
      </CardContent>
    </Card>
  )
}

/**
 * Saves the whole day a moment after each change. Only one save runs at a time; changes
 * made while saving are sent straight after. Anything unsaved is sent when leaving the page.
 */
function useAutosave(date: string, onSaved: (summary: DaySummary) => void) {
  const latest = useRef<Row[]>([])
  const version = useRef(0) // bumped on every change
  const savedVersion = useRef(0) // the version the server has
  const inFlight = useRef<Promise<void> | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const onSavedRef = useRef(onSaved)
  const [status, setStatus] = useState<SaveStatus>('idle')

  useEffect(() => {
    onSavedRef.current = onSaved
  }, [onSaved])

  const flush = useCallback(async (): Promise<boolean> => {
    clearTimeout(timer.current)
    while (inFlight.current) await inFlight.current
    if (savedVersion.current === version.current) return true

    const v = version.current
    setStatus('saving')
    let ok = false
    inFlight.current = api
      .put<MealDayResponse>(`/meals/${date}`, { items: toItems(latest.current) })
      .then((data) => {
        ok = true
        savedVersion.current = v
        onSavedRef.current(data.summary)
        if (version.current === v) {
          setStatus('saved')
          toast.success('Saved', { id: 'meals-saved', duration: 1500 })
        }
      })
      .catch((err: unknown) => {
        setStatus('error')
        toast.error(errorMessage(err, 'Could not save your meals'), { id: 'meals-saved' })
      })
      .finally(() => {
        inFlight.current = null
      })
    await inFlight.current
    return ok
  }, [date])

  /** Record a change and save it shortly. */
  const change = useCallback(
    (rows: Row[]) => {
      latest.current = rows
      version.current += 1
      setStatus('pending')
      clearTimeout(timer.current)
      timer.current = setTimeout(() => void flush(), AUTOSAVE_DELAY_MS)
    },
    [flush],
  )

  /** Take rows from the server as the saved state (after loading or copying). */
  const reset = useCallback((rows: Row[]) => {
    latest.current = rows
    version.current += 1
    savedVersion.current = version.current
  }, [])

  // Leaving the page or the date: send anything unsaved now
  useEffect(
    () => () => {
      if (savedVersion.current !== version.current) void flush()
    },
    [flush],
  )

  // Closing the tab with unsaved changes: ask first
  const unsaved = status === 'pending' || status === 'saving' || status === 'error'
  useEffect(() => {
    if (!unsaved) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [unsaved])

  return { status, change, flush, reset }
}

function MealEditor({ date, today }: { date: string; today: string }) {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [summary, setSummary] = useState<DaySummary | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [copying, setCopying] = useState<MealType | 'day' | null>(null)
  const [sheet, setSheet] = useState<{ open: boolean; meal: MealType }>({ open: false, meal: 'breakfast' })
  const { status, change, flush, reset } = useAutosave(date, setSummary)
  const yesterday = addDays(date, -1)

  useEffect(() => {
    let cancelled = false
    api
      .get<MealDayResponse>(`/meals/${date}`)
      .then((data) => {
        if (cancelled) return
        const loaded = toRows(data.items)
        reset(loaded)
        setRows(loaded)
        setSummary(data.summary)
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoadError(errorMessage(err, 'Could not load this day'))
      })
    return () => {
      cancelled = true
    }
  }, [date, reset])

  function update(next: Row[]) {
    setRows(next)
    change(next)
  }

  async function copyFromYesterday(mealType?: MealType) {
    setCopying(mealType ?? 'day')
    try {
      // Save pending edits first so the copy is added on top of them
      if (!(await flush())) return
      const data = await api.post<MealDayResponse>(`/meals/${date}/copy`, { fromDate: yesterday, ...(mealType && { mealType }) })
      const copied = toRows(data.items)
      reset(copied)
      setRows(copied)
      setSummary(data.summary)
      const added = data.items.length - (rows?.length ?? 0)
      toast.success(`Copied ${added} item${added === 1 ? '' : 's'} from yesterday`, { id: 'meals-saved' })
    } catch (err) {
      toast.error(errorMessage(err, 'Could not copy'), { id: 'meals-saved' })
    } finally {
      setCopying(null)
    }
  }

  if (loadError) return <ErrorNotice>{loadError}</ErrorNotice>
  if (!rows || !summary) return <MealsSkeleton />

  const sheetMeal = MEALS.find((m) => m.type === sheet.meal)!

  return (
    <div className="space-y-4 md:space-y-6">
      <SummaryCard rows={rows} summary={summary} status={status} onRetry={() => void flush()} />

      <div className="grid gap-4 md:gap-6 lg:grid-cols-2">
        {MEALS.map((meal) => {
          const mealRows = rows.filter((r) => r.mealType === meal.type)
          return (
            <MealSection
              key={meal.type}
              meal={meal}
              rows={mealRows}
              subtotal={totals(mealRows)}
              copying={copying === meal.type}
              onAdd={() => setSheet({ open: true, meal: meal.type })}
              onCopy={() => void copyFromYesterday(meal.type)}
              onServings={(key, servings) => update(rows.map((r) => (r.key === key ? { ...r, servings } : r)))}
              onRemove={(key) => update(rows.filter((r) => r.key !== key))}
            />
          )
        })}
      </div>

      {rows.length === 0 && (
        <div className="flex justify-center">
          <Button variant="ghost" disabled={copying !== null} onClick={() => void copyFromYesterday()}>
            {copying === 'day' ? <Loader2 className="animate-spin" aria-hidden /> : <Copy aria-hidden />}
            Copy all of yesterday's meals
          </Button>
        </div>
      )}

      <AddFoodSheet
        open={sheet.open}
        onOpenChange={(open) => setSheet((s) => ({ ...s, open }))}
        mealType={sheet.meal}
        mealLabel={sheetMeal.label}
        onAdd={(item) =>
          update([...rows, { ...item, key: newKey(), ...(date === today && { time: timeInTimezone() }) }])
        }
      />
    </div>
  )
}

function SaveIndicator({ status, onRetry }: { status: SaveStatus; onRetry: () => void }) {
  if (status === 'error') {
    return (
      <Button variant="outline" size="sm" onClick={onRetry} className="text-destructive">
        <RotateCw aria-hidden /> Retry save
      </Button>
    )
  }
  const text = status === 'pending' || status === 'saving' ? 'Saving…' : status === 'saved' ? 'Saved' : ''
  return (
    <span
      role="status"
      className={cn('min-w-16 text-right text-xs', status === 'saved' ? 'text-success' : 'text-muted-foreground')}
    >
      {text}
    </span>
  )
}

function SummaryCard({
  rows,
  summary,
  status,
  onRetry,
}: {
  rows: Row[]
  summary: DaySummary
  status: SaveStatus
  onRetry: () => void
}) {
  // Totals come from the rows on screen, so they update instantly; target and burn come from the server
  const day = totals(rows)
  const target = summary.calorieTarget
  const burn = summary.estimatedBurn
  const remaining = target !== null ? target - day.kcal : null
  const over = remaining !== null && remaining < 0
  const net = burn ? day.kcal - burn.burn : null
  const hasMacros = day.proteinG !== null || day.carbsG !== null || day.fatG !== null || day.fiberG !== null
  const fiberGoal = summary.fiberGoalG ?? 30
  const fiber = day.fiberG ?? 0

  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-6 sm:flex-row sm:items-center">
        <ProgressRing
          value={day.kcal}
          max={target ?? 0}
          size={168}
          className={over ? 'stroke-muted-foreground/60' : undefined}
          label={
            target !== null
              ? `${day.kcal} of ${target} kcal eaten`
              : `${day.kcal} kcal eaten`
          }
        >
          <div>
            <p className="font-heading text-3xl font-semibold tabular-nums">{kcal(day.kcal)}</p>
            <p className="text-xs text-muted-foreground">
              {target !== null ? `of ${kcal(target)} kcal` : 'kcal eaten'}
            </p>
          </div>
        </ProgressRing>

        <div className="w-full min-w-0 flex-1 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              {remaining === null ? (
                <>
                  <p className="text-lg font-semibold">{kcal(day.kcal)} kcal eaten</p>
                  <p className="text-sm text-muted-foreground">
                    <Link to="/profile" className="font-medium text-primary underline-offset-4 hover:underline">
                      Complete your profile
                    </Link>{' '}
                    to see your daily target.
                  </p>
                </>
              ) : over ? (
                <>
                  <p className="text-lg font-semibold">Over by {kcal(-remaining)} kcal</p>
                  <p className="text-sm text-muted-foreground">That's okay — one day is just one day.</p>
                </>
              ) : (
                <>
                  <p className="text-lg font-semibold">{kcal(remaining)} kcal remaining</p>
                  <p className="text-sm text-muted-foreground">of your daily target</p>
                </>
              )}
            </div>
            <SaveIndicator status={status} onRetry={onRetry} />
          </div>

          {burn && burn.soFar && (
            <div className="space-y-1 rounded-xl bg-muted/60 px-3 py-2.5 text-sm">
              <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
                <Flame className="size-4 text-physical" aria-hidden />
                Burned so far: <span className="font-semibold tabular-nums">{kcal(burn.burn)}</span> kcal
                <span className="text-muted-foreground tabular-nums">
                  {burn.active !== null ? (
                    <>
                      (resting {kcal(burn.resting)} + active {kcal(burn.active)}{' '}
                      <Watch className="inline size-4 align-[-2px]" aria-label="from Apple Watch" />)
                    </>
                  ) : (
                    '(estimated · no watch sync yet today)'
                  )}
                </span>
              </p>
              <p className="text-xs text-muted-foreground tabular-nums">Expected by end of day: ~{kcal(burn.projected)} kcal</p>
              {day.kcal > 0 && (
                <p className="text-xs text-muted-foreground tabular-nums">
                  So far you’ve eaten {kcal(day.kcal)} kcal and burned {kcal(burn.burn)} kcal.
                </p>
              )}
            </div>
          )}

          {burn && !burn.soFar && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl bg-muted/60 px-3 py-2.5 text-sm">
              <span className="flex items-center gap-1.5">
                <Flame className="size-4 text-physical" aria-hidden />
                Burn <span className="font-semibold tabular-nums">{kcal(burn.burn)}</span> kcal
              </span>
              <Badge variant="outline" className="gap-1 bg-card">
                {burn.source === 'watch' ? (
                  <>
                    <Watch aria-hidden /> from Apple Watch
                  </>
                ) : (
                  'estimated'
                )}
              </Badge>
              {net !== null && day.kcal > 0 && (
                <span className="w-full text-xs text-muted-foreground">
                  {net === 0
                    ? 'You ate about what you burned.'
                    : `You ate ${kcal(Math.abs(net))} kcal ${net < 0 ? 'less' : 'more'} than you burned.`}
                </span>
              )}
            </div>
          )}

          {hasMacros && (
            <dl className="grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
              {(
                [
                  ['Protein', day.proteinG],
                  ['Carbs', day.carbsG],
                  ['Fat', day.fatG],
                  ['Fibre', day.fiberG],
                ] as const
              ).map(([label, grams]) => (
                <div key={label} className="rounded-xl border px-2 py-2">
                  <dt className="text-xs text-muted-foreground">{label}</dt>
                  <dd className="font-semibold tabular-nums">{grams === null ? '—' : `${Math.round(grams)} g`}</dd>
                </div>
              ))}
            </dl>
          )}

          {day.kcal > 0 && (
            <div className="space-y-1.5">
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className="font-medium">Fibre</span>
                <span className="text-muted-foreground tabular-nums">
                  {day.fiberG === null ? `No fibre info yet · goal ${fiberGoal} g` : `${Math.round(fiber)} / ${fiberGoal} g`}
                  {fiber >= fiberGoal && (
                    <>
                      <Check className="ml-1 inline size-4 align-[-2px] text-success" aria-hidden />
                      <span className="sr-only"> (goal reached)</span>
                    </>
                  )}
                </span>
              </div>
              <Progress value={Math.min(100, (fiber / fiberGoal) * 100)} aria-label={`Fibre ${Math.round(fiber)} of ${fiberGoal} grams`} />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function MealSection({
  meal,
  rows,
  subtotal,
  copying,
  onAdd,
  onCopy,
  onServings,
  onRemove,
}: {
  meal: (typeof MEALS)[number]
  rows: Row[]
  subtotal: Totals
  copying: boolean
  onAdd: () => void
  onCopy: () => void
  onServings: (key: string, servings: number) => void
  onRemove: (key: string) => void
}) {
  const headingId = `meal-${meal.type}`

  return (
    <Card role="group" aria-labelledby={headingId} className="gap-4">
      <div className="flex items-center gap-3 px-(--card-spacing)">
        <IconBubble icon={meal.icon} />
        <h2 id={headingId} className="flex-1 text-lg leading-tight font-semibold">
          {meal.label}
        </h2>
        <p className="text-sm text-muted-foreground tabular-nums">
          <span className="font-semibold text-foreground">{kcal(subtotal.kcal)}</span> kcal
        </p>
      </div>

      <CardContent className="space-y-4">
        {rows.length === 0 ? (
          <p className="rounded-xl border border-dashed px-4 py-3 text-center text-sm text-muted-foreground">
            Nothing logged yet
          </p>
        ) : (
          <ul className="divide-y">
            {rows.map((row) => (
              <li
                key={row.key}
                className="flex animate-in flex-wrap items-center gap-x-3 gap-y-2 py-3 duration-200 fade-in-0 first:pt-0 last:pb-0"
              >
                <div className="min-w-0 flex-1 basis-40">
                  <p className="truncate font-medium">{row.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {formatServings(row.servings)} × {row.servingDescription ?? 'serving'}
                    {row.time && ` · ${row.time}`}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <ServingsStepper
                    value={row.servings}
                    onChange={(v) => onServings(row.key, v)}
                    label={`Servings of ${row.name}`}
                  />
                  <span className="w-16 text-right text-sm font-semibold tabular-nums">{kcal(itemKcal(row))}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Remove ${row.name}`}
                    onClick={() => onRemove(row.key)}
                    className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  >
                    <X />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" onClick={onAdd}>
            <Plus aria-hidden /> Add food
          </Button>
          <Button type="button" variant="ghost" className="text-muted-foreground" disabled={copying} onClick={onCopy}>
            {copying ? <Loader2 className="animate-spin" aria-hidden /> : <Copy aria-hidden />}
            Copy from yesterday
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function MealsSkeleton() {
  return (
    <div className="space-y-4 md:space-y-6" aria-busy="true" aria-label="Loading meals">
      <Card>
        <CardContent className="flex flex-col items-center gap-6 sm:flex-row">
          <Skeleton className="size-[168px] rounded-full" />
          <div className="w-full flex-1 space-y-3">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-11 w-full rounded-xl" />
          </div>
        </CardContent>
      </Card>
      <div className="grid gap-4 md:gap-6 lg:grid-cols-2">
        {[0, 1, 2, 3].map((i) => (
          <Card key={i}>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3">
                <Skeleton className="size-10 rounded-xl" />
                <Skeleton className="h-5 w-28" />
              </div>
              <Skeleton className="h-11 w-full rounded-xl" />
              <Skeleton className="h-10 w-28 rounded-xl" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
