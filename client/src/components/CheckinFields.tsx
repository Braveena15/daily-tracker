// Building blocks for the daily check-in form.
import { useState, type KeyboardEvent, type ReactNode } from 'react'
import { newKey, type ActivityRow, type LearningRow, type TextRow } from '../lib/checkinForm'

export function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="card checkin-section">
      <h2>{title}</h2>
      {hint && <p className="section-hint">{hint}</p>}
      {children}
    </section>
  )
}

/** Ten tappable buttons for a 1–10 rating. */
export function RatingPicker({
  label,
  value,
  onChange,
  emoji,
}: {
  label: string
  value: number | null
  onChange: (value: number) => void
  emoji: (value: number) => string
}) {
  return (
    <div className="rating" role="radiogroup" aria-label={label}>
      <div className="rating-label">
        <span>{label}</span>
        <span className="rating-value">{value === null ? 'Tap to choose' : `${emoji(value)} ${value}/10`}</span>
      </div>
      <div className="rating-buttons">
        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            aria-label={`${label} ${n} out of 10`}
            className={value === n ? 'selected' : ''}
            onClick={() => onChange(n)}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  )
}

/** A number input with a unit shown after it. */
export function NumberField({
  label,
  unit,
  value,
  onChange,
  step = 'any',
  min,
  max,
  placeholder,
}: {
  label: string
  unit?: string
  value: string
  onChange: (value: string) => void
  step?: string
  min?: number
  max?: number
  placeholder?: string
}) {
  return (
    <label>
      {label}
      <span className="input-unit">
        <input
          type="number"
          inputMode="decimal"
          step={step}
          min={min}
          max={max}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        {unit && <span>{unit}</span>}
      </span>
    </label>
  )
}

/** Quick-add chips plus editable rows of { name, minutes, notes }. */
export function ActivityList({
  rows,
  onChange,
  chips,
  itemLabel,
  minutesRequired = false,
}: {
  rows: ActivityRow[]
  onChange: (rows: ActivityRow[]) => void
  chips: string[]
  itemLabel: string
  minutesRequired?: boolean
}) {
  // Focus goes to the new row's minutes (chip) or name (custom)
  const [focus, setFocus] = useState<{ key: string; field: 'type' | 'durationMin' } | null>(null)

  function add(type: string) {
    const row = { key: newKey(), type, durationMin: '', notes: '' }
    onChange([...rows, row])
    setFocus({ key: row.key, field: type ? 'durationMin' : 'type' })
  }

  function update(key: string, field: keyof Omit<ActivityRow, 'key'>, value: string) {
    onChange(rows.map((r) => (r.key === key ? { ...r, [field]: value } : r)))
  }

  return (
    <div className="activity-list">
      <div className="chips">
        {chips.map((chip) => (
          <button key={chip} type="button" className="chip" onClick={() => add(chip)}>
            + {chip}
          </button>
        ))}
        <button type="button" className="chip chip-custom" onClick={() => add('')}>
          + Custom
        </button>
      </div>

      {rows.map((row) => (
        <div key={row.key} className="activity-row">
          <input
            className="activity-name"
            aria-label={`${itemLabel} name`}
            placeholder={`${itemLabel} name`}
            maxLength={100}
            value={row.type}
            autoFocus={focus?.key === row.key && focus.field === 'type'}
            onChange={(e) => update(row.key, 'type', e.target.value)}
          />
          <span className="input-unit activity-minutes">
            <input
              type="number"
              inputMode="numeric"
              min={minutesRequired ? 1 : 0}
              max={1440}
              step="1"
              aria-label={`${row.type || itemLabel} minutes`}
              placeholder={minutesRequired ? 'Minutes' : 'Optional'}
              value={row.durationMin}
              autoFocus={focus?.key === row.key && focus.field === 'durationMin'}
              onChange={(e) => update(row.key, 'durationMin', e.target.value)}
            />
            <span>min</span>
          </span>
          <button
            type="button"
            className="icon-button"
            aria-label={`Remove ${row.type || itemLabel}`}
            onClick={() => onChange(rows.filter((r) => r.key !== row.key))}
          >
            ×
          </button>
          <input
            className="activity-notes"
            aria-label={`${row.type || itemLabel} notes`}
            placeholder="Notes (optional)"
            maxLength={500}
            value={row.notes}
            onChange={(e) => update(row.key, 'notes', e.target.value)}
          />
        </div>
      ))}
    </div>
  )
}

/** A list of short text items with add and remove. */
export function TextList({
  rows,
  onChange,
  placeholder,
  maxLength,
}: {
  rows: TextRow[]
  onChange: (rows: TextRow[]) => void
  placeholder: string
  maxLength: number
}) {
  const [draft, setDraft] = useState('')

  function add() {
    const text = draft.trim()
    if (!text) return
    onChange([...rows, { key: newKey(), text }])
    setDraft('')
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    // Enter adds the item instead of submitting the whole form
    if (e.key === 'Enter') {
      e.preventDefault()
      add()
    }
  }

  return (
    <div className="text-list">
      {rows.length > 0 && (
        <ul>
          {rows.map((row) => (
            <li key={row.key}>
              <input
                aria-label="Good thing"
                maxLength={maxLength}
                value={row.text}
                onChange={(e) =>
                  onChange(rows.map((r) => (r.key === row.key ? { ...r, text: e.target.value } : r)))
                }
              />
              <button
                type="button"
                className="icon-button"
                aria-label={`Remove "${row.text}"`}
                onClick={() => onChange(rows.filter((r) => r.key !== row.key))}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="add-row">
        <input
          placeholder={placeholder}
          maxLength={maxLength}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
        />
        <button type="button" className="secondary" onClick={add} disabled={!draft.trim()}>
          Add
        </button>
      </div>
    </div>
  )
}

/** Learnings: topic, optional minutes and details, with add and remove. */
export function LearningList({ rows, onChange }: { rows: LearningRow[]; onChange: (rows: LearningRow[]) => void }) {
  const [focusKey, setFocusKey] = useState<string | null>(null)

  function update(key: string, field: keyof Omit<LearningRow, 'key'>, value: string) {
    onChange(rows.map((r) => (r.key === key ? { ...r, [field]: value } : r)))
  }

  function add() {
    const row = { key: newKey(), topic: '', details: '', minutes: '' }
    onChange([...rows, row])
    setFocusKey(row.key)
  }

  return (
    <div className="learning-list">
      {rows.map((row) => (
        <div key={row.key} className="learning-row">
          <input
            className="learning-topic"
            aria-label="Learning topic"
            placeholder="What did you learn about?"
            maxLength={200}
            value={row.topic}
            autoFocus={focusKey === row.key}
            onChange={(e) => update(row.key, 'topic', e.target.value)}
          />
          <span className="input-unit activity-minutes">
            <input
              type="number"
              inputMode="numeric"
              min={0}
              max={1440}
              step="1"
              aria-label="Learning minutes"
              placeholder="Optional"
              value={row.minutes}
              onChange={(e) => update(row.key, 'minutes', e.target.value)}
            />
            <span>min</span>
          </span>
          <button
            type="button"
            className="icon-button"
            aria-label={`Remove ${row.topic || 'learning'}`}
            onClick={() => onChange(rows.filter((r) => r.key !== row.key))}
          >
            ×
          </button>
          <textarea
            className="learning-details"
            aria-label="Learning details"
            placeholder="Details (optional)"
            maxLength={2000}
            rows={2}
            value={row.details}
            onChange={(e) => update(row.key, 'details', e.target.value)}
          />
        </div>
      ))}
      <button type="button" className="secondary" onClick={add}>
        + Add a learning
      </button>
    </div>
  )
}
