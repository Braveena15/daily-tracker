import { useEffect, useState } from 'react'
import { api } from '@/lib/api'

type State<T> = { path: string; data: T | null; error: string | null }

/**
 * GETs `path` and re-fetches when it changes. `data` is null while loading; a new path
 * shows loading again instead of the previous path's data.
 */
export function useFetch<T>(path: string, fallbackError = 'Could not load this') {
  const [state, setState] = useState<State<T>>({ path: '', data: null, error: null })

  useEffect(() => {
    let cancelled = false
    api
      .get<T>(path)
      .then((data) => !cancelled && setState({ path, data, error: null }))
      .catch((err: unknown) => {
        if (!cancelled) setState({ path, data: null, error: err instanceof Error ? err.message : fallbackError })
      })
    return () => {
      cancelled = true
    }
  }, [path, fallbackError])

  const current = state.path === path
  return {
    data: current ? state.data : null,
    error: current ? state.error : null,
    loading: !current,
  }
}
