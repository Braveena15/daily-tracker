import { useCallback, useEffect, useState } from 'react'
import { api } from '@/lib/api'
import type { DailyInput, DayResponse, EntryKind } from '@/lib/entries'

/**
 * One day from GET /api/entries/:date, plus the changes the Today page makes.
 * Every change returns the whole day from the server, which replaces what's shown,
 * so the lists, timeline and charts always match what's stored.
 */
export function useDay(date: string) {
  const [day, setDay] = useState<DayResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Callers give each date its own component (key={date}), so there's no previous day to clear here
  useEffect(() => {
    let cancelled = false
    api
      .get<DayResponse>(`/entries/${date}`)
      .then((data) => !cancelled && setDay(data))
      .catch((err: unknown) => !cancelled && setError(err instanceof Error ? err.message : 'Could not load this day'))
    return () => {
      cancelled = true
    }
  }, [date])

  const apply = useCallback(async (request: Promise<DayResponse>) => {
    const data = await request
    setDay(data)
    return data
  }, [])

  return {
    day,
    error,
    add: (kind: EntryKind, body: Record<string, unknown>) => apply(api.post<DayResponse>(`/entries/${date}/${kind}`, body)),
    update: (kind: EntryKind, id: string, body: Record<string, unknown>) =>
      apply(api.patch<DayResponse>(`/entries/${date}/${kind}/${id}`, body)),
    remove: (kind: EntryKind, id: string) => apply(api.delete<DayResponse>(`/entries/${date}/${kind}/${id}`)),
    saveDaily: (body: DailyInput) => apply(api.put<DayResponse>(`/entries/${date}/daily`, body)),
    // Today's purpose
    savePurpose: (body: { text?: string; focusValues?: string[] }) => apply(api.put<DayResponse>(`/entries/${date}/purpose`, body)),
    addPurposeLine: (text: string) => apply(api.post<DayResponse>(`/entries/${date}/purpose/lines`, { text })),
    updatePurposeLine: (id: string, text: string) => apply(api.patch<DayResponse>(`/entries/${date}/purpose/lines/${id}`, { text })),
    removePurposeLine: (id: string) => apply(api.delete<DayResponse>(`/entries/${date}/purpose/lines/${id}`)),
    addIntention: (text: string) => apply(api.post<DayResponse>(`/entries/${date}/purpose/intentions`, { text })),
    updateIntention: (id: string, body: { text?: string; done?: boolean }) =>
      apply(api.patch<DayResponse>(`/entries/${date}/purpose/intentions/${id}`, body)),
    removeIntention: (id: string) => apply(api.delete<DayResponse>(`/entries/${date}/purpose/intentions/${id}`)),
    saveReflection: (body: { rating: number; note: string | null }) => apply(api.put<DayResponse>(`/entries/${date}/purpose/reflection`, body)),
  }
}

export type DayActions = Omit<ReturnType<typeof useDay>, 'day' | 'error'>
