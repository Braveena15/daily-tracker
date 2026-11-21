// The state behind the shared Time field (components/day/TimeField.tsx).
//
// - Today: starts at the current time and follows the clock (checked every few seconds) until you
//   change it by hand to back-fill an earlier time. now() jumps back to following the clock.
// - A past day: starts empty and is required.
// - Editing an entry: starts at the entry's own time and doesn't follow the clock.
import { useEffect, useState } from 'react'
import { isFutureTimeToday, nowHHmm } from '@/lib/time'

const TICK_MS = 5_000

export function useTimeInput({ isToday, initial }: { isToday: boolean; initial?: string }) {
  const fresh = () => (isToday ? nowHHmm() : '')
  const [value, setValue] = useState(() => initial ?? fresh())
  // Touched: changed by hand (or an existing entry's time), so the clock no longer moves it
  const [touched, setTouched] = useState(initial !== undefined)

  useEffect(() => {
    if (!isToday || touched) return
    const timer = setInterval(() => setValue(nowHHmm()), TICK_MS)
    return () => clearInterval(timer)
  }, [isToday, touched])

  return {
    value,
    isToday,
    change: (v: string) => {
      setValue(v)
      setTouched(true)
    },
    /** Back to the current time, following the clock again */
    now: () => {
      setValue(nowHHmm())
      setTouched(false)
    },
    /** After a successful add: ready for the next entry */
    reset: () => {
      setValue(fresh())
      setTouched(false)
    },
    /** A message for the form, or null when the time is fine */
    error: (): string | null => {
      if (!value) return isToday ? null : 'When did this happen? Enter a time.'
      if (isToday && isFutureTimeToday(value)) return "Time can't be in the future"
      return null
    },
    /**
     * The `time` to send. A new entry on today that still follows the clock sends none, so the
     * server stamps it with the exact current moment.
     */
    body: (editing: boolean): { time?: string } => (value && (editing || touched || !isToday) ? { time: value } : {}),
  }
}

export type TimeInput = ReturnType<typeof useTimeInput>
