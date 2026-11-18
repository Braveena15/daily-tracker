import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/useAuth'
import { api } from '../lib/api'
import type { SummaryResponse } from '../lib/profile'

const kcal = (n: number) => `${n.toLocaleString()} kcal`

export function Dashboard() {
  const { user } = useAuth()

  return (
    <>
      <section className="card">
        <h1>Welcome, {user?.name}</h1>
        <p className="subtitle">Your daily check-ins will appear here soon.</p>
      </section>

      <DailyNumbers />
    </>
  )
}

function DailyNumbers() {
  const [data, setData] = useState<SummaryResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api
      .get<SummaryResponse>('/profile/summary')
      .then(setData)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Could not load your numbers'))
  }, [])

  return (
    <section className="card">
      <h2>Your daily numbers</h2>

      {error ? (
        <p className="form-error">{error}</p>
      ) : !data ? (
        <p className="muted">Loading…</p>
      ) : !data.complete ? (
        <div className="notice">
          <p>{data.message}</p>
          <Link to="/profile">Complete your profile →</Link>
        </div>
      ) : (
        <>
          <dl className="stats">
            <div>
              <dt>Daily calorie target</dt>
              <dd className="highlight">{kcal(data.summary.calorieTarget)}</dd>
            </div>
            <div>
              <dt>Estimated daily burn (TDEE)</dt>
              <dd>{kcal(data.summary.tdee)}</dd>
            </div>
            <div>
              <dt>BMR (at rest)</dt>
              <dd>{kcal(data.summary.bmr)}</dd>
            </div>
            <div>
              <dt>BMI</dt>
              <dd>
                {data.summary.bmi.toFixed(1)} <span className="muted">· {data.summary.bmiCategory}</span>
              </dd>
            </div>
            <div>
              <dt>Weeks to goal</dt>
              <dd>
                {data.summary.weeksToGoal === null ? (
                  <span className="muted">—</span>
                ) : (
                  `About ${data.summary.weeksToGoal} week${data.summary.weeksToGoal === 1 ? '' : 's'}`
                )}
              </dd>
            </div>
          </dl>

          {data.summary.wasClamped && (
            <p className="notice">
              Your target has been raised to a safe minimum, so you may lose weight a little more slowly than your
              weekly goal. Choosing a gentler goal on your <Link to="/profile">profile</Link> can make this more
              realistic.
            </p>
          )}
        </>
      )}
    </section>
  )
}
