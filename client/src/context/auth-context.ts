import { createContext } from 'react'

export type User = {
  id: string
  name: string
  email: string
  heightCm?: number
  birthYear?: number
  sex?: 'male' | 'female'
  goalWeightKg?: number
  createdAt: string
  updatedAt: string
}

export type AuthContextValue = {
  user: User | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  register: (name: string, email: string, password: string) => Promise<void>
  logout: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)
