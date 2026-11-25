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
    // Why the day wasn't logged (today or yesterday only)
    setMissedReason: (body: { category: string; note?: string | null }) => apply(api.put<DayResponse>(`/entries/${date}/missed-reason`, body)),
    clearMissedReason: () => apply(api.delete<DayResponse>(`/entries/${date}/missed-reason`)),
    // Sets the day's water to exactly this total (replaces the day's drinks)
    setWaterTotal: (totalMl: number) => apply(api.put<DayResponse>(`/entries/${date}/water/total`, { totalMl })),
    // What matters today (up to 5), each with its intensity and optional intentions, and the day's evening note
    ...purposeActions(date, apply),
  }
}

export type DayActions = Omit<ReturnType<typeof useDay>, 'day' | 'error'>

/** The calls for a day's purposes; each returns the whole day. */
export function purposeActions(date: string, apply: (request: Promise<DayResponse>) => Promise<DayResponse>) {
  const base = `/entries/${date}/purposes`
  return {
    addPurpose: (body: { text: string; intensity: number; focusValues?: string[] }) => apply(api.post<DayResponse>(base, body)),
    updatePurpose: (id: string, body: { text?: string; intensity?: number; focusValues?: string[] }) =>
      apply(api.patch<DayResponse>(`${base}/${id}`, body)),
    removePurpose: (id: string) => apply(api.delete<DayResponse>(`${base}/${id}`)),
    addIntention: (purposeId: string, text: string) => apply(api.post<DayResponse>(`${base}/${purposeId}/intentions`, { text })),
    updateIntention: (purposeId: string, id: string, body: { text?: string; done?: boolean }) =>
      apply(api.patch<DayResponse>(`${base}/${purposeId}/intentions/${id}`, body)),
    removeIntention: (purposeId: string, id: string) => apply(api.delete<DayResponse>(`${base}/${purposeId}/intentions/${id}`)),
    saveReflectionNote: (note: string | null) => apply(api.put<DayResponse>(`/entries/${date}/reflection-note`, { note })),
  }
}

export type PurposeActions = ReturnType<typeof purposeActions>
