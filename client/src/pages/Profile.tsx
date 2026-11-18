import { useEffect, useState, type FormEvent } from 'react'
import { api } from '../lib/api'
import {
  ACTIVITY_OPTIONS,
  WEEKLY_GOAL_OPTIONS,
  type ActivityLevel,
  type Profile as ProfileData,
  type Sex,
  type WeeklyGoalKg,
} from '../lib/profile'

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

export function Profile() {
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  useEffect(() => {
    api
      .get<{ profile: ProfileData }>('/profile')
      .then((data) => setForm(toForm(data.profile)))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Could not load your profile'))
      .finally(() => setLoading(false))
  }, [])

  function update(field: keyof FormState, value: string) {
    setForm((f) => ({ ...f, [field]: value }))
    setSuccess(null)
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setSuccess(null)

    const profile = toProfile(form)
    const badNumber = Object.entries(profile).find(([, v]) => typeof v === 'number' && Number.isNaN(v))
    if (badNumber) return setError('Please enter numbers only')

    setSaving(true)
    try {
      const data = await api.put<{ profile: ProfileData }>('/profile', profile)
      setForm(toForm(data.profile))
      setSuccess('Profile saved')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your profile')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <p className="loading">Loading your profile…</p>

  const activity = ACTIVITY_OPTIONS.find((o) => o.value === form.activityLevel)

  return (
    <section className="card">
      <h1>Your profile</h1>
      <p className="subtitle">Used to estimate your daily calorie needs. You can change it any time.</p>

      <form className="profile-form" onSubmit={handleSubmit} noValidate>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        {success && (
          <p className="form-success" role="status">
            {success}
          </p>
        )}

        <div className="form-grid">
          <label>
            Current weight
            <span className="input-unit">
              <input
                type="number"
                inputMode="decimal"
                step="0.1"
                min={30}
                max={300}
                value={form.currentWeightKg}
                onChange={(e) => update('currentWeightKg', e.target.value)}
              />
              <span>kg</span>
            </span>
          </label>

          <label>
            Goal weight
            <span className="input-unit">
              <input
                type="number"
                inputMode="decimal"
                step="0.1"
                min={30}
                max={300}
                value={form.goalWeightKg}
                onChange={(e) => update('goalWeightKg', e.target.value)}
              />
              <span>kg</span>
            </span>
          </label>

          <label>
            Height
            <span className="input-unit">
              <input
                type="number"
                inputMode="decimal"
                step="0.1"
                min={100}
                max={250}
                value={form.heightCm}
                onChange={(e) => update('heightCm', e.target.value)}
              />
              <span>cm</span>
            </span>
          </label>

          <label>
            Birth year
            <input
              type="number"
              inputMode="numeric"
              min={1940}
              max={thisYear - 13}
              placeholder={`e.g. ${thisYear - 25}`}
              value={form.birthYear}
              onChange={(e) => update('birthYear', e.target.value)}
            />
          </label>

          <label>
            Sex
            <select value={form.sex} onChange={(e) => update('sex', e.target.value)}>
              <option value="">Choose…</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
            </select>
            <span className="hint">Used in the BMR formula and for the safe calorie minimum</span>
          </label>

          <label>
            Weekly goal
            <select value={form.weeklyGoalKg} onChange={(e) => update('weeklyGoalKg', e.target.value)}>
              <option value="">Choose…</option>
              {WEEKLY_GOAL_OPTIONS.map((o) => (
                <option key={o.value} value={String(o.value)}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>

          <label className="full">
            Activity level
            <select value={form.activityLevel} onChange={(e) => update('activityLevel', e.target.value)}>
              <option value="">Choose…</option>
              {ACTIVITY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label} — {o.description}
                </option>
              ))}
            </select>
            {activity && <span className="hint">{activity.description}</span>}
          </label>
        </div>

        <button type="submit" disabled={saving}>
          {saving ? 'Saving…' : 'Save profile'}
        </button>
      </form>
    </section>
  )
}
