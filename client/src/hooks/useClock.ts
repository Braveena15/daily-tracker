// A clock for pages that stay open: re-renders as time passes, so "today" moves on at midnight
// (Asia/Colombo) and time-of-day hints appear without reloading the page.
import { useEffect, useState } from 'react'
import { todayInTimezone } from '@/lib/dates'

const TICK_MS = 15_000

/** The current time, updated every 15 seconds. */
export function useNow(): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), TICK_MS)
    // Coming back to a tab that slept (e.g. an iPhone app switched away overnight)
    const onVisible = () => document.visibilityState === 'visible' && setNow(new Date())
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])
  return now
}

/** Today's date in Asia/Colombo; changes at local midnight. */
export function useToday(): string {
  return todayInTimezone(undefined, useNow())
}
