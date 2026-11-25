// The weekly review's "Your week": average scores and the week's numbers, each card opening a
// day-by-day sheet. Averages only use days that have the data (a day without a mood check-in is
// never a mood of 0); workouts and learning are weekly totals. Wording stays gentle: a missing day
// is "Not logged" (with its reason, if one was noted), never a failure.
import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowDown,
  ArrowUp,
  BookOpen,
  Brain,
  CalendarCheck,
  Check,
  Dumbbell,
  Gauge,
  GlassWater,
  Moon,
  Smile,
  UtensilsCrossed,
  Wallet,
  Wheat,
  type LucideIcon,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { CardChevron } from '@/components/CardChevron'
import { IconBubble } from '@/components/IconBubble'
import { InfoTip } from '@/components/InfoTip'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { relativeDay } from '@/lib/dates'
import { kcal } from '@/lib/meals'
import { notLoggedText } from '@/lib/missed'
import type { MetricKey, ReviewDay, WeekMetric, WeeklyReviewResponse } from '@/lib/progress'
import type { Tone } from '@/lib/tones'
import { cn } from '@/lib/utils'
import { litres } from '@/lib/water'
import { money } from '@/lib/expenses'

type Direction = 'higher-is-good' | 'neutral'

export function Delta({ diff, unit = '', direction = 'higher-is-good', digits = 0 }: { diff: number | null; unit?: string; direction?: Direction; digits?: number }) {
  if (diff === null) return null
  const rounded = Number(diff.toFixed(digits))
  if (rounded === 0) return <span className="text-xs text-muted-foreground">Same as last week</span>

  const up = rounded > 0
  const Icon = up ? ArrowUp : ArrowDown
  // Up on a "more is better" number is a soft green; down is shown calmly in grey, never red
  const colour = direction === 'neutral' || !up ? 'bg-muted text-muted-foreground' : 'bg-success/15 text-success'
  return (
    <span className={cn('inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-medium tabular-nums', colour)}>
      <Icon className="size-4" aria-hidden />
      <span className="sr-only">{up ? 'up' : 'down'}</span>
      {Math.abs(rounded).toFixed(digits)}
      {unit}
      <span className="max-sm:sr-only">&nbsp;vs last week</span>
    </span>
  )
}

const plural = (n: number, word: string, words = `${word}s`) => `${n} ${n === 1 ? word : words}`

/** Which day-by-day sheet a card opens */
type SheetKind = 'scores' | 'workouts' | 'learning' | 'sleep' | 'mood' | 'kcal' | 'fiber' | 'water' | 'expenses' | 'days'

type CardSpec = {
  key: string
  icon: LucideIcon
  tone?: Tone
  label: string
  /** null: nothing this week */
  value: string | null
  /** One sentence: how the number is worked out */
  info: string
  /** "based on 3 of 5 days" (left out for totals that don't need it) */
  basedOn?: string
  /** Shown instead of the value when there's nothing this week */
  empty: string
  emptyLink?: { to: string; label: string }
  /** undefined: first week (no line at all); null: last week existed but had none */
  lastWeek?: string | null
  delta?: ReactNode
  sheet: SheetKind
}

function WeekCard({ spec, onOpen }: { spec: CardSpec; onOpen: () => void }) {
  return (
    <Card size="sm" className="group relative transition-all hover:bg-accent/40 hover:ring-primary/30 has-[button.card-open:focus-visible]:ring-3 has-[button.card-open:focus-visible]:ring-ring/50">
      <CardContent className="space-y-2">
        <div className="flex items-center gap-2">
          <IconBubble icon={spec.icon} tone={spec.tone ?? 'primary'} className="size-8 shrink-0 rounded-lg [&_svg]:size-4" />
          {/* The whole card opens the day-by-day sheet (the ⓘ sits above it) */}
          <button type="button" className="card-open min-w-0 flex-1 text-left text-sm leading-tight text-muted-foreground outline-none after:absolute after:inset-0 after:rounded-[inherit]" onClick={onOpen}>
            {spec.label}
            <span className="sr-only">, show day by day</span>
          </button>
          <InfoTip title={spec.label} className="relative z-10">
            {spec.info}
          </InfoTip>
          <CardChevron className="size-4" />
        </div>
        {spec.value === null ? (
          <div className="space-y-0.5 text-sm">
            <p className="text-foreground/80">{spec.empty}</p>
            {spec.emptyLink && (
              <Link to={spec.emptyLink.to} className="relative z-10 text-xs font-medium text-primary underline-offset-4 hover:underline">
                {spec.emptyLink.label}
              </Link>
            )}
          </div>
        ) : (
          <>
            <p className="font-heading text-xl font-semibold text-balance tabular-nums sm:text-2xl">{spec.value}</p>
            {spec.basedOn && <p className="text-xs text-muted-foreground">{spec.basedOn}</p>}
          </>
        )}
        {spec.lastWeek !== undefined && (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {spec.value !== null && spec.lastWeek !== null && spec.delta}
            <span className="text-xs text-muted-foreground">{spec.lastWeek === null ? 'Not logged last week' : `Last week: ${spec.lastWeek}`}</span>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export function YourWeek({ data, today }: { data: WeeklyReviewResponse; today: string }) {
  const { thisWeek: w, lastWeek: p, differences: d, metrics: m, lastWeekMetrics: lm } = data
  const currency = data.currency ?? 'LKR'
  const [open, setOpen] = useState<{ kind: SheetKind; title: string } | null>(null)
  // No line at all in the first week; "Not logged last week" when last week was there but empty
  const firstWeek = p.daysTracked === 0
  const last = (metric: WeekMetric, format: (v: number) => string) => (firstWeek ? undefined : metric.value === null ? null : format(metric.value))
  const basedOn = (metric: WeekMetric, unit: string, units = `${unit}s`) =>
    `based on ${metric.daysWithData} of ${plural(metric.daysInWeekSoFar, unit, units)}`
  const n = (x: number) => x.toLocaleString()

  const score = (key: 'overall' | 'physical' | 'mental' | 'learning', label: string, icon: LucideIcon, tone?: Tone): CardSpec => ({
    key,
    icon,
    tone,
    label,
    value: m[key].value === null ? null : n(m[key].value!),
    info: `Average of your daily ${label.toLowerCase()} score (out of 100) on the ${plural(m[key].daysWithData, 'day')} you logged; days without a check-in aren't counted.`,
    basedOn: basedOn(m[key], 'day'),
    empty: 'No logged days this week yet',
    emptyLink: { to: '/today', label: 'Log today' },
    lastWeek: last(lm[key], n),
    delta: <Delta diff={d[`avg${label}` as keyof typeof d] ?? null} />,
    sheet: 'scores',
  })

  const scores: CardSpec[] = [
    score('overall', 'Overall', Gauge),
    score('physical', 'Physical', Dumbbell, 'physical'),
    score('mental', 'Mental', Brain, 'mental'),
    score('learning', 'Learning', BookOpen, 'learning'),
  ]

  const totalLearning = m.learningMinutes.value ?? 0
  const cards: CardSpec[] = [
    {
      key: 'workouts',
      icon: Dumbbell,
      tone: 'physical',
      label: 'Workouts',
      value: m.workouts.value === null ? null : `${m.workouts.value} · ${n(m.workoutMinutes.value ?? 0)} min`,
      info: `Total for the week: ${plural(m.workouts.value ?? 0, 'workout')} on ${plural(m.workouts.daysWithData, 'day')}, adding up their minutes.`,
      empty: 'No workouts this week yet',
      emptyLink: { to: '/today#workouts', label: 'Log a workout' },
      lastWeek: firstWeek ? undefined : lm.workouts.value === null ? null : `${lm.workouts.value} · ${n(lm.workoutMinutes.value ?? 0)} min`,
      delta: <Delta diff={d.workoutMinutes} unit=" min" />,
      sheet: 'workouts',
    },
    {
      key: 'learning',
      icon: BookOpen,
      tone: 'learning',
      label: 'Learning',
      value: m.learnings.value === null ? null : totalLearning > 0 ? `${n(totalLearning)} min` : plural(m.learnings.value, 'learning'),
      info: `Total for the week: ${plural(m.learnings.value ?? 0, 'learning')} on ${plural(m.learnings.daysWithData, 'day')}, adding up the minutes you entered.`,
      empty: 'No learning this week yet',
      emptyLink: { to: '/today#learnings', label: 'Log a learning' },
      lastWeek: firstWeek ? undefined : lm.learnings.value === null ? null : (lm.learningMinutes.value ?? 0) > 0 ? `${n(lm.learningMinutes.value!)} min` : plural(lm.learnings.value, 'learning'),
      delta: <Delta diff={d.learningMinutes} unit=" min" />,
      sheet: 'learning',
    },
    {
      key: 'sleep',
      icon: Moon,
      tone: 'mental',
      label: 'Average sleep',
      value: m.sleepHours.value === null ? null : `${m.sleepHours.value} h`,
      info: `Average of the ${plural(m.sleepHours.daysWithData, 'night')} with sleep this week (from your watch or your own entry).`,
      basedOn: basedOn(m.sleepHours, 'night'),
      empty: 'No sleep logged this week yet',
      emptyLink: { to: '/today#sleep', label: 'Add sleep' },
      lastWeek: last(lm.sleepHours, (v) => `${v} h`),
      delta: <Delta diff={d.avgSleepHours} unit=" h" digits={1} direction="neutral" />,
      sheet: 'sleep',
    },
    {
      key: 'sleepScore',
      icon: Moon,
      tone: 'mental',
      label: 'Average sleep score',
      value: m.sleepScore.value === null ? null : `${m.sleepScore.value}/100`,
      info: `Average of the ${plural(m.sleepScore.daysWithData, 'night')} that have a sleep score this week.`,
      basedOn: basedOn(m.sleepScore, 'night'),
      empty: 'No sleep scores this week yet',
      emptyLink: { to: '/today#sleep', label: 'Add sleep' },
      lastWeek: last(lm.sleepScore, (v) => `${v}/100`),
      delta: <Delta diff={d.avgSleepScore} />,
      sheet: 'sleep',
    },
    {
      key: 'mood',
      icon: Smile,
      tone: 'mental',
      label: 'Average mood',
      value: m.mood.value === null ? null : `${m.mood.value}/10`,
      info: `Average of your daily mood on the ${plural(m.mood.daysWithData, 'day')} you checked in (each day's check-ins are averaged first).`,
      basedOn: basedOn(m.mood, 'day'),
      empty: 'No mood check-ins this week yet',
      emptyLink: { to: '/today#mood', label: 'Check in' },
      lastWeek: last(lm.mood, (v) => `${v}/10`),
      delta: <Delta diff={d.avgMood} digits={1} />,
      sheet: 'mood',
    },
    {
      key: 'kcal',
      icon: UtensilsCrossed,
      label: 'Average calories',
      value: m.kcal.value === null ? null : `${kcal(m.kcal.value)} kcal`,
      info: `Average of the ${plural(m.kcal.daysWithData, 'day')} you logged meals${data.calorieTarget !== null ? `, compared with your ${kcal(data.calorieTarget)} kcal target` : ''}.`,
      basedOn: basedOn(m.kcal, 'day'),
      empty: 'No meals logged this week yet',
      emptyLink: { to: '/meals', label: 'Log a meal' },
      lastWeek: last(lm.kcal, (v) => `${kcal(v)} kcal`),
      delta:
        data.calorieTarget !== null && m.kcal.value !== null ? (
          <span className="text-xs text-muted-foreground">
            {kcal(Math.abs(m.kcal.value - data.calorieTarget))} {m.kcal.value >= data.calorieTarget ? 'over' : 'under'} target
          </span>
        ) : undefined,
      sheet: 'kcal',
    },
    {
      key: 'fiber',
      icon: Wheat,
      tone: 'outdoor',
      label: 'Average fibre',
      value: m.fiberG.value === null ? null : `${m.fiberG.value} g / day`,
      info: `Average of the ${plural(m.fiberG.daysWithData, 'day')} your meals had fibre information.`,
      basedOn: basedOn(m.fiberG, 'day'),
      empty: 'No fibre info this week yet',
      emptyLink: { to: '/meals', label: 'Log a meal' },
      lastWeek: last(lm.fiberG, (v) => `${v} g`),
      delta: <Delta diff={d.avgFiberG} unit=" g" digits={1} />,
      sheet: 'fiber',
    },
    {
      key: 'water',
      icon: GlassWater,
      tone: 'outdoor',
      label: 'Average water',
      value: m.waterMl.value === null ? null : `${litres(m.waterMl.value)} / day`,
      info: `Average of the ${plural(m.waterMl.daysWithData, 'day')} you logged water.`,
      basedOn: basedOn(m.waterMl, 'day'),
      empty: 'No water logged this week yet',
      emptyLink: { to: '/today#water', label: 'Log water' },
      lastWeek: last(lm.waterMl, (v) => litres(v)),
      delta: <Delta diff={d.avgWaterMl === null ? null : d.avgWaterMl / 1000} unit=" L" digits={2} />,
      sheet: 'water',
    },
    {
      key: 'waterGoal',
      icon: GlassWater,
      tone: 'outdoor',
      label: `Water goal (${litres(data.waterGoalMl)})`,
      value: w.waterDays === 0 ? null : `${w.waterGoalDays} of ${plural(w.waterDays, 'logged day')}`,
      info: `Days your water reached ${litres(data.waterGoalMl)}, out of the days you logged water.`,
      empty: 'No water logged this week yet',
      emptyLink: { to: '/today#water', label: 'Log water' },
      lastWeek: firstWeek ? undefined : p.waterDays === 0 ? null : `${p.waterGoalDays} of ${p.waterDays}`,
      delta: <Delta diff={d.waterGoalDays} unit={Math.abs(d.waterGoalDays ?? 0) === 1 ? ' day' : ' days'} />,
      sheet: 'water',
    },
    {
      key: 'expenses',
      icon: Wallet,
      label: 'Expenses',
      value: m.spent.value === null ? null : money(m.spent.value, currency),
      info: `Total spent this week (in ${currency}), from the ${plural(m.spent.daysWithData, 'day')} with expenses.`,
      empty: 'No expenses this week yet',
      emptyLink: { to: '/expenses?add=1', label: 'Add an expense' },
      lastWeek: last(lm.spent, (v) => money(v, currency)),
      sheet: 'expenses',
    },
    {
      key: 'days',
      icon: CalendarCheck,
      label: 'Days logged',
      value: `${w.daysLogged} of ${w.daysTracked}`,
      info: 'Days with anything you logged yourself. A note about why you couldn’t log doesn’t count as logging.',
      empty: 'No days logged yet',
      lastWeek: firstWeek ? undefined : `${p.daysLogged} of ${p.daysTracked}`,
      delta: <Delta diff={d.daysLogged} unit={Math.abs(d.daysLogged ?? 0) === 1 ? ' day' : ' days'} />,
      sheet: 'days',
    },
  ]

  const scoresBasedOn = m.overall.daysWithData

  return (
    <section aria-labelledby="week-heading" className="space-y-4">
      <h2 id="week-heading" className="text-xl font-semibold">
        Your week
      </h2>

      {w.daysLogged < w.daysTracked && (
        // One gentle note, never shaming
        <p className="rounded-xl bg-muted/60 px-4 py-3 text-sm text-muted-foreground">
          You logged {w.daysLogged} of {plural(w.daysTracked, 'day')}. Even a quick check-in each day helps you see your real patterns.
        </p>
      )}

      <div className="space-y-2">
        <div>
          <h3 className="font-semibold">Average scores</h3>
          <p className="text-sm text-muted-foreground">
            Out of 100, based on {scoresBasedOn} of {plural(w.daysTracked, 'day')}. Tap a card to see each day.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {scores.map((s) => (
            <WeekCard key={s.key} spec={s} onOpen={() => setOpen({ kind: s.sheet, title: 'Scores' })} />
          ))}
        </div>
      </div>

      {/* Two columns even on phones (one below 360px), so the page stays short */}
      <div className="grid grid-cols-2 gap-3 max-[360px]:grid-cols-1 lg:grid-cols-3">
        {cards.map((c) => (
          <WeekCard key={c.key} spec={c} onOpen={() => setOpen({ kind: c.sheet, title: c.label })} />
        ))}
      </div>

      <DaysSheet open={open} onClose={() => setOpen(null)} data={data} today={today} />
    </section>
  )
}

// ---------- Day by day ----------

/** What a day shows in a sheet, or null when it has nothing for that kind. */
function dayContent(kind: SheetKind, day: ReviewDay, data: WeeklyReviewResponse): ReactNode | null {
  const minutes = (min: number | null) => (min ? ` · ${min} min` : '')
  switch (kind) {
    case 'scores':
      return day.overall === null ? null : (
        <span className="tabular-nums">
          Physical {day.physical} · Mental {day.mental} · Learning {day.learning} · <span className="font-medium">Overall {day.overall}</span>
        </span>
      )
    case 'workouts':
      return day.workoutItems?.length ? <List items={day.workoutItems.map((w) => `${w.type}${minutes(w.minutes)}`)} /> : null
    case 'learning':
      return day.learningItems?.length ? <List items={day.learningItems.map((l) => `${l.topic}${minutes(l.minutes)}`)} /> : null
    case 'sleep':
      return day.sleepHours === null && day.sleepScore === null ? null : (
        <span className="tabular-nums">
          {[
            day.sleepHours !== null && `${day.sleepHours} h`,
            day.sleepScore !== null && `score ${day.sleepScore}/100`,
            day.bedtime && day.wakeTime && `${day.bedtime} → ${day.wakeTime}`,
          ]
            .filter(Boolean)
            .join(' · ')}
        </span>
      )
    case 'mood':
      return day.mood === null ? null : (
        <div className="space-y-1">
          <p className="tabular-nums">
            Average {day.mood}/10{day.energy != null && ` · energy ${day.energy}/10`}
          </p>
          {day.moodCheckins && day.moodCheckins.length > 1 && (
            <List items={day.moodCheckins.map((c) => `${c.time} · mood ${c.mood} · energy ${c.energy}`)} muted />
          )}
        </div>
      )
    case 'kcal':
      return day.kcal === null ? null : (
        <span className="tabular-nums">
          {kcal(day.kcal)} kcal
          {data.calorieTarget !== null && ` · ${kcal(Math.abs(day.kcal - data.calorieTarget))} ${day.kcal >= data.calorieTarget ? 'over' : 'under'} target`}
        </span>
      )
    case 'fiber':
      return day.fiberG === null ? null : <span className="tabular-nums">{day.fiberG} g</span>
    case 'water':
      return day.waterMl === 0 ? null : (
        <span className="flex items-center gap-1.5 tabular-nums">
          {litres(day.waterMl)} of {litres(data.waterGoalMl)}
          {day.waterMl >= data.waterGoalMl && <Check className="size-4 text-success" aria-label="goal reached" />}
        </span>
      )
    case 'expenses':
      return day.expenseItems?.length ? <List items={day.expenseItems.map((x) => `${x.title} · ${money(x.amount, data.currency ?? 'LKR')}`)} /> : null
    case 'days':
      return day.logged ?? day.overall !== null ? (
        <span className="flex items-center gap-1.5">
          <Check className="size-4 text-success" aria-hidden /> Logged
        </span>
      ) : null
  }
}

function List({ items, muted = false }: { items: string[]; muted?: boolean }) {
  return (
    <ul className={cn('space-y-0.5', muted && 'text-xs text-muted-foreground')}>
      {items.map((t, i) => (
        <li key={i} className="break-words">
          {t}
        </li>
      ))}
    </ul>
  )
}

const EMPTY_FOR: Record<SheetKind, string> = {
  scores: 'Not logged',
  workouts: 'No workout',
  learning: 'No learning',
  sleep: 'No sleep logged',
  mood: 'No check-in',
  kcal: 'No meals logged',
  fiber: 'No fibre info',
  water: 'No water logged',
  expenses: 'No expenses',
  days: 'Not logged',
}

function DaysSheet({
  open,
  onClose,
  data,
  today,
}: {
  open: { kind: SheetKind; title: string } | null
  onClose: () => void
  data: WeeklyReviewResponse
  today: string
}) {
  const desktop = useMediaQuery('(min-width: 768px)')
  return (
    <Sheet open={open !== null} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side={desktop ? 'right' : 'bottom'}
        className={cn('gap-0 p-0', desktop ? 'w-full sm:max-w-md' : 'max-h-[85dvh] rounded-t-2xl pb-[env(safe-area-inset-bottom)]')}
      >
        <SheetHeader className="border-b px-5 pt-5 pb-4">
          <SheetTitle className="text-xl font-semibold">{open?.title ?? ''}</SheetTitle>
          <SheetDescription>Day by day this week</SheetDescription>
        </SheetHeader>
        {open && (
          <ol className="divide-y overflow-y-auto px-5">
            {[...data.days].reverse().map((day) => {
              const content = dayContent(open.kind, day, data)
              // A day with nothing logged shows its reason, if one was noted
              const unlogged = !(day.logged ?? day.overall !== null)
              return (
                <li key={day.date} className="space-y-1 py-3 text-sm">
                  <Link to={`/history/${day.date}`} className="font-heading font-semibold hover:underline">
                    {relativeDay(day.date, today)}
                  </Link>
                  {content ?? <p className="text-muted-foreground">{unlogged ? notLoggedText(day.missedReason) : EMPTY_FOR[open.kind]}</p>}
                </li>
              )
            })}
          </ol>
        )}
      </SheetContent>
    </Sheet>
  )
}

/** The metric keys the cards read (kept in one place for the types) */
export type { MetricKey }
