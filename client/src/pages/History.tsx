import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../lib/api'
import { addDays, listDates, relativeDay, todayInTimezone } from '../lib/dates'
import { moodEmoji, type DailyEntry, type EntriesListResponse } from '../lib/entries'

const DAYS = 30

export function History() {
  const [today] = useState(() => todayInTimezone())
  const from = addDays(today, -(DAYS - 1))

  const [entries, setEntries] = useState<Map<string, DailyEntry> | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api
      .get<EntriesListResponse>(`/entries?from=${from}&to=${today}`)
      .then((data) => setEntries(new Map(data.entries.map((e) => [e.date, e]))))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Could not load your history'))
  }, [from, today])

  if (error) return <p className="form-error">{error}</p>
  if (!entries) return <p className="loading">Loading…</p>

  const days = listDates(from, today).reverse() // newest first

  return (
    <>
      <section className="card">
        <h1>History</h1>
        <p className="subtitle">
          Your last {DAYS} days: {entries.size} logged. Tap a day to open it.
        </p>
      </section>

      <ul className="history-grid">
        {days.map((date) => {
          const entry = entries.get(date)
          return (
            <li key={date}>
              <Link to={`/today?date=${date}`} className={`history-card${entry ? '' : ' empty'}`}>
                <span className="history-date">{relativeDay(date, today)}</span>
                {entry ? (
                  <>
                    <span className="history-mood" aria-label={`Mood ${entry.mood} out of 10`}>
                      {moodEmoji(entry.mood)} <span className="muted">{entry.mood}/10</span>
                    </span>
                    <span className="history-detail">
                      {entry.workouts.length > 0
                        ? `🏋️ ${entry.workouts.map((w) => w.type).join(', ')}`
                        : 'No workouts'}
                    </span>
                    <span className="history-detail">
                      📚 {entry.learnings.length} learning{entry.learnings.length === 1 ? '' : 's'}
                    </span>
                  </>
                ) : (
                  <span className="history-detail muted">No check-in · tap to log</span>
                )}
              </Link>
            </li>
          )
        })}
      </ul>
    </>
  )
}
