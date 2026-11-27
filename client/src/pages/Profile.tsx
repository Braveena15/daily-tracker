import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { ChevronRight, Compass, Flame, Route, Save, Settings as SettingsIcon } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/context/useAuth'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { IconBubble } from '@/components/IconBubble'
import { InputWithUnit } from '@/components/InputWithUnit'
import { PageHeader } from '@/components/PageHeader'
import { ErrorNotice } from '@/components/StatusViews'
import { api } from '@/lib/api'
import {
  ACTIVITY_OPTIONS,
  WEEKLY_GOAL_OPTIONS,
  type ActivityLevel,
  type Profile as ProfileData,
  type Sex,
  type SummaryResponse,
  type WeeklyGoalKg,
} from '@/lib/profile'
import { cn } from '@/lib/utils'

// Form inputs hold strings; an empty string means "not set".
type FormState = { [K in keyof ProfileData]: string }

const EMPTY_FORM: FormState = {
  heightCm: '',
  birthYear: '',
  sex: '',
  currentWeightKg: '',
  goalWeightKg: '',
  activityLevel: '',
  weeklyGoalKg: '',
}

function toForm(profile: ProfileData): FormState {
  const form = { ...EMPTY_FORM }
  for (const key of Object.keys(EMPTY_FORM) as (keyof ProfileData)[]) {
    const value = profile[key]
    form[key] = value === null || value === undefined ? '' : String(value)
  }
  return form
}

function toNumber(value: string): number | null {
  return value.trim() === '' ? null : Number(value)
}

function toProfile(form: FormState): ProfileData {
  return {
    heightCm: toNumber(form.heightCm),
    birthYear: toNumber(form.birthYear),
    sex: (form.sex || null) as Sex | null,
    currentWeightKg: toNumber(form.currentWeightKg),
    goalWeightKg: toNumber(form.goalWeightKg),
    activityLevel: (form.activityLevel || null) as ActivityLevel | null,
    weeklyGoalKg: toNumber(form.weeklyGoalKg) as WeeklyGoalKg | null,
  }
}

const thisYear = new Date().getFullYear()

function Field({
  id,
  label,
  hint,
  className,
  children,
}: {
  id: string
  label: string
  hint?: ReactNode
  className?: string
  children: ReactNode
}) {
  return (
    <div className={cn('space-y-2', className)}>
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

// ---------- Goals ----------

type NumberGoal =
  | 'stepGoal'
  | 'activeCalorieGoal'
  | 'workoutMinutesGoal'
  | 'learningMinutesGoal'
  | 'fiberGoalG'
  | 'waterGoalMl'
  | 'glassSizeMl'
type Goals = Record<NumberGoal, number>
type GoalsForm = Record<NumberGoal, string>
type ProfileResponse = { profile: ProfileData; goals: Goals }

const GOAL_INPUTS: { key: NumberGoal; label: string; unit: string; min: number; max: number; hint: string }[] = [
  { key: 'stepGoal', label: 'Daily steps', unit: 'steps', min: 1000, max: 50000, hint: 'Default 8,000' },
  { key: 'activeCalorieGoal', label: 'Active calories', unit: 'kcal', min: 50, max: 3000, hint: 'Used when no steps are logged · default 400' },
  { key: 'workoutMinutesGoal', label: 'Workout time', unit: 'min', min: 5, max: 300, hint: 'Per day · default 30' },
  { key: 'learningMinutesGoal', label: 'Learning time', unit: 'min', min: 5, max: 600, hint: 'Per day · default 30' },
  { key: 'fiberGoalG', label: 'Fibre', unit: 'g', min: 5, max: 100, hint: 'Per day · default 30' },
  {
    key: 'waterGoalMl',
    label: 'Water',
    unit: 'ml',
    min: 500,
    max: 6000,
    hint: 'Per day · default 2,000. A common starting point is about 2–2.5 L a day; needs vary with heat, activity and health — adjust as needed.',
  },
  { key: 'glassSizeMl', label: 'Glass size', unit: 'ml', min: 50, max: 1000, hint: 'For the "+1 glass" button · default 250' },
]

function toGoalsForm(goals: Goals): GoalsForm {
  return {
    stepGoal: String(goals.stepGoal),
    activeCalorieGoal: String(goals.activeCalorieGoal),
    workoutMinutesGoal: String(goals.workoutMinutesGoal),
    learningMinutesGoal: String(goals.learningMinutesGoal),
    fiberGoalG: String(goals.fiberGoalG),
    waterGoalMl: String(goals.waterGoalMl),
    glassSizeMl: String(goals.glassSizeMl),
  }
}

/** Empty goal boxes go back to their defaults (null). The journey's dates live on My Journey. */
function toGoalsBody(form: GoalsForm) {
  const numbers = Object.fromEntries(
    GOAL_INPUTS.map(({ key }) => [key, form[key].trim() === '' ? null : Number(form[key])]),
  ) as Record<NumberGoal, number | null>
  return numbers
}

export function Profile() {
  const { user } = useAuth()
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [goals, setGoals] = useState<GoalsForm>({
    stepGoal: '',
    activeCalorieGoal: '',
    workoutMinutesGoal: '',
    learningMinutesGoal: '',
    fiberGoalG: '',
    waterGoalMl: '',
    glassSizeMl: '',
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // The daily calorie target comes from the plan (body stats + weekly goal), not a box of its own
  const [plan, setPlan] = useState<SummaryResponse | null>(null)

  function show(data: ProfileResponse) {
    setForm(toForm(data.profile))
    setGoals(toGoalsForm(data.goals))
    api.get<SummaryResponse>('/profile/summary').then(setPlan, () => setPlan(null))
  }

  useEffect(() => {
    api
      .get<ProfileResponse>('/profile')
      .then(show)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Could not load your profile'))
      .finally(() => setLoading(false))
  }, [])

  function update(field: keyof FormState, value: string) {
    setForm((f) => ({ ...f, [field]: value }))
  }

  function updateGoal(field: keyof GoalsForm, value: string) {
    setGoals((g) => ({ ...g, [field]: value }))
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)

    const profile = toProfile(form)
    const goalsBody = toGoalsBody(goals)
    const badNumber = Object.entries({ ...profile, ...goalsBody }).find(([, v]) => typeof v === 'number' && Number.isNaN(v))
    if (badNumber) return setError('Please enter numbers only')

    setSaving(true)
    try {
      const data = await api.put<ProfileResponse>('/profile', { ...profile, ...goalsBody })
      show(data)
      toast.success('Profile saved')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your profile')
    } finally {
      setSaving(false)
    }
  }

  const activity = ACTIVITY_OPTIONS.find((o) => o.value === form.activityLevel)

  return (
    <>
      <PageHeader
        title="Your profile"
        description="About you: your body and your daily goals. Used to estimate your calorie needs."
        action={
          <Button asChild variant="outline" size="sm">
            <Link to="/settings">
              <SettingsIcon aria-hidden /> Settings
            </Link>
          </Button>
        }
      />

      {loading ? (
        <ProfileSkeleton />
      ) : (
        <Card className="max-w-3xl">
          <form onSubmit={handleSubmit} noValidate className="contents">
            <CardContent className="space-y-6">
              {error && <ErrorNotice>{error}</ErrorNotice>}

              <div>
                <p className="font-heading text-xl font-semibold">{user?.name}</p>
                <p className="text-sm text-muted-foreground">{user?.email}</p>
              </div>

              <section aria-labelledby="body-heading" className="space-y-5">
              <h2 id="body-heading" className="text-xl font-semibold">
                Body
              </h2>
              <div className="grid gap-5 md:grid-cols-2">
                <Field id="currentWeightKg" label="Current weight">
                  <InputWithUnit
                    id="currentWeightKg"
                    unit="kg"
                    type="number"
                    inputMode="decimal"
                    step="0.1"
                    min={30}
                    max={300}
                    value={form.currentWeightKg}
                    onChange={(e) => update('currentWeightKg', e.target.value)}
                  />
                </Field>

                <Field id="goalWeightKg" label="Goal weight">
                  <InputWithUnit
                    id="goalWeightKg"
                    unit="kg"
                    type="number"
                    inputMode="decimal"
                    step="0.1"
                    min={30}
                    max={300}
                    value={form.goalWeightKg}
                    onChange={(e) => update('goalWeightKg', e.target.value)}
                  />
                </Field>

                <Field id="heightCm" label="Height">
                  <InputWithUnit
                    id="heightCm"
                    unit="cm"
                    type="number"
                    inputMode="decimal"
                    step="0.1"
                    min={100}
                    max={250}
                    value={form.heightCm}
                    onChange={(e) => update('heightCm', e.target.value)}
                  />
                </Field>

                <Field id="birthYear" label="Birth year">
                  <Input
                    id="birthYear"
                    type="number"
                    inputMode="numeric"
                    min={1940}
                    max={thisYear - 13}
                    placeholder={`e.g. ${thisYear - 25}`}
                    value={form.birthYear}
                    onChange={(e) => update('birthYear', e.target.value)}
                  />
                </Field>

                <Field id="sex" label="Sex" hint="Used in the BMR formula and for the safe calorie minimum">
                  <Select value={form.sex} onValueChange={(v) => update('sex', v)}>
                    <SelectTrigger id="sex" className="w-full">
                      <SelectValue placeholder="Choose…" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="male">Male</SelectItem>
                      <SelectItem value="female">Female</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>

                <Field id="weeklyGoalKg" label="Weekly goal">
                  <Select value={form.weeklyGoalKg} onValueChange={(v) => update('weeklyGoalKg', v)}>
                    <SelectTrigger id="weeklyGoalKg" className="w-full">
                      <SelectValue placeholder="Choose…" />
                    </SelectTrigger>
                    <SelectContent>
                      {WEEKLY_GOAL_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={String(o.value)}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>

                <Field
                  id="activityLevel"
                  label="Activity level"
                  hint={activity?.description}
                  className="md:col-span-2"
                >
                  <Select value={form.activityLevel} onValueChange={(v) => update('activityLevel', v)}>
                    <SelectTrigger id="activityLevel" className="w-full">
                      <SelectValue placeholder="Choose…">{activity?.label}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {ACTIVITY_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value} className="py-2">
                          <span className="flex flex-col items-start">
                            <span>{o.label}</span>
                            <span className="text-xs text-muted-foreground">{o.description}</span>
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </div>
              </section>

              <Separator />

              <section aria-labelledby="goals-heading" className="space-y-5">
                <div>
                  <h2 id="goals-heading" className="text-xl font-semibold">
                    Daily goals
                  </h2>
                  <p className="text-sm text-muted-foreground">Used for your daily scores.</p>
                </div>
                <div className="flex items-start gap-3 rounded-xl bg-muted/50 p-3 text-sm" role="status">
                  <Flame className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                  {plan?.complete ? (
                    <p>
                      <span className="font-medium">Calories: {plan.summary.calorieTarget.toLocaleString()} kcal a day</span>
                      <span className="text-muted-foreground"> — set by your plan from your body stats and weekly goal above.</span>
                    </p>
                  ) : (
                    <p className="text-muted-foreground">Calories come from your plan: fill in your body stats and weekly goal above, then save.</p>
                  )}
                </div>
                <div className="grid gap-5 md:grid-cols-2">
                  {GOAL_INPUTS.map((g) => (
                    <Field key={g.key} id={g.key} label={g.label} hint={g.hint}>
                      <InputWithUnit
                        id={g.key}
                        unit={g.unit}
                        type="number"
                        inputMode="numeric"
                        step="1"
                        min={g.min}
                        max={g.max}
                        value={goals[g.key]}
                        onChange={(e) => updateGoal(g.key, e.target.value)}
                      />
                    </Field>
                  ))}
                </div>
              </section>
            </CardContent>

            <CardFooter className="justify-end">
              <Button loading={saving} type="submit" size="lg" disabled={saving} className="w-full sm:w-auto">
                <Save aria-hidden />
                {saving ? 'Saving…' : 'Save profile'}
              </Button>
            </CardFooter>
          </form>
        </Card>
      )}

      <Link
        to="/purpose"
        className="group mt-4 flex max-w-3xl items-center gap-3 surface p-4 transition-all outline-none hover:bg-accent/40 focus-visible:ring-3 focus-visible:ring-ring/50 md:mt-6"
      >
        <IconBubble icon={Compass} />
        <span className="min-w-0 flex-1">
          <span className="block font-medium">Purpose & core values</span>
          <span className="block text-sm text-muted-foreground">What matters to you, and why you're on this journey</span>
        </span>
        <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
      </Link>
      <Link to="/journey" className="mt-3 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground hover:underline">
        <Route className="size-4" aria-hidden /> Manage my journey →
      </Link>
    </>
  )
}

function ProfileSkeleton() {
  return (
    <Card className="max-w-3xl" aria-busy="true" aria-label="Loading your profile">
      <CardContent className="grid gap-5 md:grid-cols-2">
        {Array.from({ length: 7 }, (_, i) => (
          <div key={i} className={cn('space-y-2', i === 6 && 'md:col-span-2')}>
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-10 w-full rounded-xl" />
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
