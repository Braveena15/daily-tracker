import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { api } from '../lib/api'
import { AuthContext, type AuthContextValue, type User } from './auth-context'

type UserResponse = { user: User }

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  // On first load, ask the server whether our cookie is still a valid login.
  useEffect(() => {
    api
      .get<UserResponse>('/auth/me')
      .then((data) => setUser(data.user))
      .catch(() => setUser(null))
      .finally(() => setLoading(false))
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    const data = await api.post<UserResponse>('/auth/login', { email, password })
    setUser(data.user)
  }, [])

  const register = useCallback(async (name: string, email: string, password: string) => {
    const data = await api.post<UserResponse>('/auth/register', { name, email, password })
    setUser(data.user)
  }, [])

  const startDemo = useCallback(async () => {
    const data = await api.post<UserResponse>('/demo/start')
    setUser(data.user)
  }, [])

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout')
    } finally {
      setUser(null)
    }
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({ user, loading, login, register, startDemo, logout }),
    [user, loading, login, register, startDemo, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
