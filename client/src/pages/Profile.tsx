import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Loader2, Save } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
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

export function Profile() {
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api
      .get<{ profile: ProfileData }>('/profile')
      .then((data) => setForm(toForm(data.profile)))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Could not load your profile'))
      .finally(() => setLoading(false))
  }, [])

  function update(field: keyof FormState, value: string) {
    setForm((f) => ({ ...f, [field]: value }))
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)

    const profile = toProfile(form)
    const badNumber = Object.entries(profile).find(([, v]) => typeof v === 'number' && Number.isNaN(v))
    if (badNumber) return setError('Please enter numbers only')

    setSaving(true)
    try {
      const data = await api.put<{ profile: ProfileData }>('/profile', profile)
      setForm(toForm(data.profile))
      toast.success('Profile saved ✓')
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
        description="Used to estimate your daily calorie needs. You can change it any time."
      />

      {loading ? (
        <ProfileSkeleton />
      ) : (
        <Card className="max-w-3xl">
          <form onSubmit={handleSubmit} noValidate className="contents">
            <CardContent className="space-y-6">
              {error && <ErrorNotice>{error}</ErrorNotice>}

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
            </CardContent>

            <CardFooter className="justify-end">
              <Button type="submit" size="lg" disabled={saving} className="w-full sm:w-auto">
                {saving ? <Loader2 className="animate-spin" aria-hidden /> : <Save aria-hidden />}
                {saving ? 'Saving…' : 'Save profile'}
              </Button>
            </CardFooter>
          </form>
        </Card>
      )}
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
