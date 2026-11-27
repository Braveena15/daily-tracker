// /journey/new — start a program, step by step: 1) length, start and name · 2) where I am now ·
// 3) where I want to be · 4) the daily plan · 5) review & start. Nothing is saved until "Start";
// Back keeps what was typed. ?days=90 picks a length; ?from=<id> pre-fills goals and plan from an
// earlier program.
import { useEffect, useState, type ReactNode } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, ArrowRight, ChevronDown, Rocket } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { InputWithUnit } from '@/components/InputWithUnit'
import { PageHeader } from '@/components/PageHeader'
import { ErrorNotice } from '@/components/StatusViews'
import {
  Field,
  ListEditor,
  MeasurementsEditor,
  PhotoPicker,
  RatingsEditor,
  type PickedPhoto,
} from '@/components/journey/ProgramFields'
import { useToday } from '@/hooks/useClock'
import { api } from '@/lib/api'
import { addDays, formatLongDate } from '@/lib/dates'
import {
  EMPTY_MEASUREMENTS,
  FOCUS_AREAS,
  MEASUREMENTS,
  PROGRAM_LENGTH,
  PROGRAM_PRESETS,
  RATING_KEYS,
  RATING_LABELS,
  numOrNull,
  uploadProgramPhoto,
  type MeasurementsForm,
  type Program,
  type ProgramInput,
  type Ratings,
} from '@/lib/program'
import type { SummaryResponse } from '@/lib/profile'
import { cn } from '@/lib/utils'

const STEPS = ['Length', 'Where I am now', 'Where I want to be', 'Daily plan', 'Review & start'] as const

type Form = {
  lengthDays: string
  startDate: string
  name: string
  nameEdited: boolean
  weightKg: string
  measurements: MeasurementsForm
  ratings: Ratings
  habits: string[]
  whyText: string
  photos: PickedPhoto[]
  goalWeightKg: string
  goalRatings: Ratings
  goalHabits: string[]
  focusAreas: string[]
  goalNotes: string
  waterMl: string
  calorieTarget: string
  sleepHours: string
  workoutsPerWeek: string
  learningMinutes: string
  customHabits: string[]
}

const str = (n: number | null | undefined) => (n == null ? '' : String(n))
const defaultName = (days: string) => `${days || '?'}-day transformation`

type ProfileResponse = { profile: { currentWeightKg: number | null; goalWeightKg: number | null }; goals: { waterGoalMl: number; learningMinutesGoal: number } }

export function JourneyNew() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const today = useToday()
  const [step, setStep] = useState(0)
  const [form, setForm] = useState<Form | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // Pre-fill from the profile (weights, water, learning, calories) and, with ?from=, an earlier program
  useEffect(() => {
    const presetDays = Number(params.get('days'))
    const days = PROGRAM_PRESETS.includes(presetDays as (typeof PROGRAM_PRESETS)[number]) ? String(presetDays) : '100'
    const fromId = params.get('from')
    Promise.all([
      api.get<ProfileResponse>('/profile'),
      api.get<SummaryResponse>('/profile/summary').catch(() => null),
      fromId ? api.get<{ program: Program }>(`/programs/${fromId}`).then((r) => r.program, () => null) : Promise.resolve(null),
    ])
      .then(([profile, summary, from]) =>
        setForm({
          lengthDays: from ? String(from.lengthDays) : days,
          startDate: today,
          name: defaultName(from ? String(from.lengthDays) : days),
          nameEdited: false,
          weightKg: str(profile.profile.currentWeightKg),
          measurements: EMPTY_MEASUREMENTS,
          ratings: { custom: [] },
          habits: [],
          whyText: '',
          photos: [],
          goalWeightKg: str(from?.goals.goalWeightKg ?? profile.profile.goalWeightKg),
          goalRatings: from?.goals.ratings ?? { custom: [] },
          goalHabits: from?.goals.habits ?? [],
          focusAreas: from?.goals.focusAreas ?? [],
          goalNotes: from?.goals.notes ?? '',
          waterMl: str(from?.plan.waterMl ?? profile.goals.waterGoalMl),
          calorieTarget: str(from?.plan.calorieTarget ?? (summary?.complete ? summary.summary.calorieTarget : null)),
          sleepHours: str(from?.plan.sleepHours ?? 8),
          workoutsPerWeek: str(from?.plan.workoutsPerWeek ?? 3),
          learningMinutes: str(from?.plan.learningMinutes ?? profile.goals.learningMinutesGoal),
          customHabits: from?.plan.customHabits.map((h) => h.label) ?? [],
        }),
      )
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Could not load your profile'))
    // Only once, on opening
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => (f ? { ...f, [key]: value } : f))

  function checkStep(): string | null {
    if (!form) return null
    if (step === 0) {
      const days = Number(form.lengthDays)
      if (!Number.isInteger(days) || days < PROGRAM_LENGTH.min || days > PROGRAM_LENGTH.max) return `Choose a length from ${PROGRAM_LENGTH.min} to ${PROGRAM_LENGTH.max} days`
      if (!form.startDate) return 'Choose a start date'
      if (form.startDate > addDays(today, 60)) return 'The start date can be at most 60 days ahead'
      if (!form.name.trim()) return 'Give your journey a name'
    }
    const bad = [form.weightKg, form.goalWeightKg, form.waterMl, form.calorieTarget, form.sleepHours, form.workoutsPerWeek, form.learningMinutes, ...Object.values(form.measurements)].some(
      (v) => v.trim() !== '' && !Number.isFinite(numOrNull(v)),
    )
    return bad ? 'Please enter numbers only' : null
  }

  function next() {
    const problem = checkStep()
    setError(problem)
    if (!problem) {
      setStep((s) => s + 1)
      window.scrollTo({ top: 0 })
    }
  }

  async function start() {
    if (!form) return
    setSaving(true)
    setError(null)
    const measurements = Object.fromEntries(MEASUREMENTS.map((m) => [m.key, numOrNull(form.measurements[m.key])]))
    const body: ProgramInput = {
      name: form.name.trim(),
      lengthDays: Number(form.lengthDays),
      startDate: form.startDate,
      baseline: { weightKg: numOrNull(form.weightKg), ...measurements, ratings: form.ratings, habits: form.habits, text: form.whyText || null },
      goals: { goalWeightKg: numOrNull(form.goalWeightKg), ratings: form.goalRatings, habits: form.goalHabits, focusAreas: form.focusAreas, notes: form.goalNotes || null },
      plan: {
        waterMl: numOrNull(form.waterMl),
        calorieTarget: numOrNull(form.calorieTarget),
        sleepHours: numOrNull(form.sleepHours),
        workoutsPerWeek: numOrNull(form.workoutsPerWeek),
        learningMinutes: numOrNull(form.learningMinutes),
        customHabits: form.customHabits,
      },
    }
    try {
      const { program } = await api.post<{ program: Program }>('/programs', body)
      // Photos after the program exists; one that fails doesn't undo the start
      let failed = 0
      for (const p of form.photos) await uploadProgramPhoto(program.id, 'baseline', p.blob, p.filename).catch(() => failed++)
      if (failed) toast.error(`${failed} photo${failed === 1 ? '' : 's'} couldn't be uploaded. You can add them later.`)
      toast.success('Your journey has started — day by day.')
      navigate('/journey', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start your journey')
      setSaving(false)
    }
  }

  return (
    <>
      <PageHeader title="Start your journey" back={{ to: '/journey', label: 'My Journey' }} />
      {!form ? (
        error ? <ErrorNotice>{error}</ErrorNotice> : <Skeleton className="h-96 w-full max-w-2xl rounded-2xl" />
      ) : (
        <div className="max-w-2xl space-y-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium text-muted-foreground" aria-live="polite">
              Step {step + 1} of {STEPS.length} · {STEPS[step]}
            </p>
            <ol className="flex gap-1.5" aria-hidden>
              {STEPS.map((s, i) => (
                <li key={s} className={cn('h-2 rounded-full transition-all motion-reduce:transition-none', i === step ? 'w-6 bg-primary' : i < step ? 'w-2 bg-primary/50' : 'w-2 bg-muted')} />
              ))}
            </ol>
          </div>

          <Card>
            <CardContent key={step} className="animate-in space-y-6 duration-200 fade-in-0 motion-reduce:animate-none">
              {error && <ErrorNotice>{error}</ErrorNotice>}
              {step === 0 && <LengthStep form={form} set={set} today={today} />}
              {step === 1 && <NowStep form={form} set={set} />}
              {step === 2 && <GoalStep form={form} set={set} />}
              {step === 3 && <PlanStep form={form} set={set} />}
              {step === 4 && <ReviewStep form={form} />}
            </CardContent>
          </Card>

          <div className="flex items-center justify-between gap-2">
            <Button variant="ghost" onClick={() => setStep((s) => s - 1)} disabled={step === 0 || saving}>
              <ArrowLeft aria-hidden /> Back
            </Button>
            {step < STEPS.length - 1 ? (
              <Button onClick={next}>
                Next <ArrowRight aria-hidden />
              </Button>
            ) : (
              <Button size="lg" loading={saving} disabled={saving} onClick={() => void start()}>
                <Rocket aria-hidden /> Start my journey
              </Button>
            )}
          </div>
        </div>
      )}
    </>
  )
}

type StepProps = { form: Form; set: <K extends keyof Form>(key: K, value: Form[K]) => void }

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        {hint && <p className="text-sm text-muted-foreground">{hint}</p>}
      </div>
      {children}
    </section>
  )
}

function LengthStep({ form, set, today }: StepProps & { today: string }) {
  const custom = !PROGRAM_PRESETS.includes(Number(form.lengthDays) as (typeof PROGRAM_PRESETS)[number])
  const pickLength = (days: string) => {
    set('lengthDays', days)
    if (!form.nameEdited) set('name', defaultName(days))
  }
  return (
    <>
      <Section title="How long?" hint="Pick a length that feels doable. You can end it any day.">
        <div role="radiogroup" aria-label="Length" className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {PROGRAM_PRESETS.map((d) => (
            <button
              key={d}
              type="button"
              role="radio"
              aria-checked={form.lengthDays === String(d)}
              onClick={() => pickLength(String(d))}
              className={cn(
                'rounded-xl border p-3 text-center outline-none hover:bg-accent/40 focus-visible:ring-3 focus-visible:ring-ring/50',
                form.lengthDays === String(d) && 'border-primary bg-primary/5 ring-1 ring-primary',
              )}
            >
              <span className="block font-heading text-2xl font-semibold">{d}</span>
              <span className="text-xs text-muted-foreground">days</span>
            </button>
          ))}
          <div className={cn('rounded-xl border p-2', custom && 'border-primary ring-1 ring-primary')}>
            <InputWithUnit
              aria-label="Custom length in days"
              unit="days"
              type="number"
              inputMode="numeric"
              min={PROGRAM_LENGTH.min}
              max={PROGRAM_LENGTH.max}
              placeholder="Custom"
              value={custom ? form.lengthDays : ''}
              onChange={(e) => pickLength(e.target.value)}
            />
          </div>
        </div>
      </Section>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Start date" htmlFor="startDate" hint={form.startDate === today ? 'Today is day 1' : form.startDate ? formatLongDate(form.startDate) : undefined}>
          <Input id="startDate" type="date" max={addDays(today, 60)} value={form.startDate} onChange={(e) => set('startDate', e.target.value)} />
        </Field>
        <Field label="Name" htmlFor="programName">
          <Input
            id="programName"
            maxLength={80}
            value={form.name}
            onChange={(e) => {
              set('name', e.target.value)
              set('nameEdited', true)
            }}
          />
        </Field>
      </div>
    </>
  )
}

function NowStep({ form, set }: StepProps) {
  return (
    <>
      <Section title="Where I am now" hint="Honest numbers make the final comparison mean more. Everything here is optional.">
        <Field label="Weight" htmlFor="weightKg" className="max-w-xs">
          <InputWithUnit id="weightKg" unit="kg" type="number" inputMode="decimal" step="0.1" value={form.weightKg} onChange={(e) => set('weightKg', e.target.value)} />
        </Field>
        <details className="group rounded-xl border">
          <summary className="flex cursor-pointer list-none items-center justify-between p-3 text-sm font-medium [&::-webkit-details-marker]:hidden">
            Measurements (optional)
            <ChevronDown className="size-4 text-muted-foreground transition-transform group-open:rotate-180 motion-reduce:transition-none" aria-hidden />
          </summary>
          <div className="px-3 pb-3">
            <MeasurementsEditor idPrefix="now" value={form.measurements} onChange={(v) => set('measurements', v)} />
          </div>
        </details>
      </Section>
      <Section title="How I rate myself today" hint="1 = very low, 10 = excellent. Tap again to clear.">
        <RatingsEditor value={form.ratings} onChange={(r) => set('ratings', r)} />
      </Section>
      <ListEditor label="My habits right now" items={form.habits} onChange={(v) => set('habits', v)} placeholder="e.g. Late-night scrolling" suggestions={['Skipping breakfast', 'Late nights', 'Little exercise']} />
      <Field label="Why I'm doing this" htmlFor="whyText" hint="Private and encrypted. Never sent to the AI.">
        <Textarea id="whyText" rows={3} maxLength={4000} value={form.whyText} onChange={(e) => set('whyText', e.target.value)} />
      </Field>
      <Field label="Progress photos">
        <PhotoPicker photos={form.photos} onChange={(p) => set('photos', p)} />
      </Field>
    </>
  )
}

function GoalStep({ form, set }: StepProps) {
  const toggleArea = (area: string) => set('focusAreas', form.focusAreas.includes(area) ? form.focusAreas.filter((a) => a !== area) : [...form.focusAreas, area])
  return (
    <>
      <Section title="Where I want to be" hint="Where you'd like to be by the last day.">
        <Field label="Goal weight" htmlFor="goalWeightKg" className="max-w-xs">
          <InputWithUnit id="goalWeightKg" unit="kg" type="number" inputMode="decimal" step="0.1" value={form.goalWeightKg} onChange={(e) => set('goalWeightKg', e.target.value)} />
        </Field>
      </Section>
      <Section title="Focus areas">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Focus areas">
          {FOCUS_AREAS.map((a) => (
            <button
              key={a.value}
              type="button"
              aria-pressed={form.focusAreas.includes(a.value)}
              onClick={() => toggleArea(a.value)}
              className={cn('rounded-full border px-4 py-1.5 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50', form.focusAreas.includes(a.value) ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-accent/40')}
            >
              {a.label}
            </button>
          ))}
        </div>
        <ListEditor
          label="Your own focus areas"
          items={form.focusAreas.filter((a) => !FOCUS_AREAS.some((f) => f.value === a))}
          onChange={(own) => set('focusAreas', [...form.focusAreas.filter((a) => FOCUS_AREAS.some((f) => f.value === a)), ...own])}
          placeholder="e.g. Relationships"
          max={6}
        />
      </Section>
      <Section title="Target ratings" hint={`Where you'd like ${RATING_KEYS.map((k) => RATING_LABELS[k].toLowerCase()).slice(0, 2).join(', ')} and the rest to be.`}>
        <RatingsEditor value={form.goalRatings} onChange={(r) => set('goalRatings', r)} compareTo={form.ratings} />
      </Section>
      <ListEditor label="Habits to build" items={form.goalHabits} onChange={(v) => set('goalHabits', v)} placeholder="e.g. Walk after dinner" suggestions={['Sleep by 11', 'Walk every day', 'Read 20 minutes']} />
      <Field label="Notes about my goals" htmlFor="goalNotes" hint="Private and encrypted. Never sent to the AI.">
        <Textarea id="goalNotes" rows={3} maxLength={4000} value={form.goalNotes} onChange={(e) => set('goalNotes', e.target.value)} />
      </Field>
    </>
  )
}

function PlanStep({ form, set }: StepProps) {
  const num = (key: 'waterMl' | 'calorieTarget' | 'sleepHours' | 'workoutsPerWeek' | 'learningMinutes', label: string, unit: string, hint?: string, step = '1') => (
    <Field label={label} htmlFor={key} hint={hint}>
      <InputWithUnit id={key} unit={unit} type="number" inputMode="decimal" step={step} value={form[key]} onChange={(e) => set(key, e.target.value)} />
    </Field>
  )
  return (
    <>
      <Section title="My daily plan" hint="Daily targets. The Weekly review shows which ones you hit each day.">
        <div className="grid gap-4 sm:grid-cols-2">
          {num('waterMl', 'Water', 'ml', 'Per day')}
          {num('calorieTarget', 'Calories', 'kcal', 'From your profile’s plan — change it if you like')}
          {num('sleepHours', 'Sleep', 'h', 'Per night', '0.5')}
          {num('workoutsPerWeek', 'Workouts', 'per week')}
          {num('learningMinutes', 'Learning', 'min', 'Per day')}
        </div>
      </Section>
      <ListEditor
        label="My own daily habits (ticked each day on Today)"
        items={form.customHabits}
        onChange={(v) => set('customHabits', v)}
        placeholder="e.g. No sugar"
        max={8}
        suggestions={form.goalHabits}
      />
    </>
  )
}

function ReviewStep({ form }: { form: Form }) {
  const rated = (r: Ratings) => [...RATING_KEYS.filter((k) => r[k]).map((k) => `${RATING_LABELS[k]} ${r[k]}`), ...(r.custom ?? []).filter((c) => c.value).map((c) => `${c.label} ${c.value}`)]
  const rows: [string, string][] = [
    ['Journey', `${form.name} · ${form.lengthDays} days from ${formatLongDate(form.startDate)}`],
    ['Weight', [form.weightKg && `now ${form.weightKg} kg`, form.goalWeightKg && `goal ${form.goalWeightKg} kg`].filter(Boolean).join(' → ') || '—'],
    ['Ratings now', rated(form.ratings).join(' · ') || '—'],
    ['Target ratings', rated(form.goalRatings).join(' · ') || '—'],
    ['Focus areas', form.focusAreas.map((a) => FOCUS_AREAS.find((f) => f.value === a)?.label ?? a).join(', ') || '—'],
    [
      'Daily plan',
      [
        form.waterMl && `${form.waterMl} ml water`,
        form.calorieTarget && `${form.calorieTarget} kcal`,
        form.sleepHours && `${form.sleepHours} h sleep`,
        form.workoutsPerWeek && `${form.workoutsPerWeek} workouts/week`,
        form.learningMinutes && `${form.learningMinutes} min learning`,
      ]
        .filter(Boolean)
        .join(' · ') || '—',
    ],
    ['Daily habits', form.customHabits.join(', ') || '—'],
    ['Photos', form.photos.length ? `${form.photos.length} (encrypted)` : 'None'],
  ]
  return (
    <Section title="Ready?" hint="You can change your goals and plan later on My Journey.">
      <dl className="divide-y rounded-xl border">
        {rows.map(([k, v]) => (
          <div key={k} className="grid gap-1 p-3 sm:grid-cols-[9rem_1fr]">
            <dt className="text-sm text-muted-foreground">{k}</dt>
            <dd className="text-sm">{v}</dd>
          </div>
        ))}
      </dl>
    </Section>
  )
}
