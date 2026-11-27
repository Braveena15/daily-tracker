import { createContext } from 'react'

export type User = {
  id: string
  name: string
  email: string
  heightCm?: number
  birthYear?: number
  sex?: 'male' | 'female'
  goalWeightKg?: number
  /** A demo account: a temporary sandbox in the public demo (DEMO_MODE), read-only on a normal deployment */
  isDemo?: boolean
  /** Public demo only: when the account and its data are deleted */
  expiresAt?: string
  createdAt: string
  updatedAt: string
}

export type AuthContextValue = {
  user: User | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  register: (name: string, email: string, password: string) => Promise<void>
  /** Public demo: a new temporary account with sample data, logged in */
  startDemo: () => Promise<void>
  logout: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)
