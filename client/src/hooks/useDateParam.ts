import { useSearchParams } from 'react-router-dom'
import { isValidDateString, todayInTimezone } from '@/lib/dates'

/**
 * The day a page shows, from ?date=YYYY-MM-DD. Anything missing, invalid or in the
 * future means today. `goTo` changes the day (today drops the ?date).
 */
export function useDateParam() {
  const [params, setParams] = useSearchParams()
  const today = todayInTimezone()

  const requested = params.get('date')
  const date = isValidDateString(requested) && requested <= today ? requested : today

  function goTo(next: string) {
    const clamped = next > today ? today : next
    setParams(clamped === today ? {} : { date: clamped })
  }

  return { date, today, goTo }
}
