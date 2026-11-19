import { createContext } from 'react'

/** What the user picked. "system" follows the device's light/dark setting. */
export type Theme = 'light' | 'dark' | 'system'

export type ThemeContextValue = {
  theme: Theme
  /** The theme actually showing right now. */
  resolvedTheme: 'light' | 'dark'
  setTheme: (theme: Theme) => void
}

export const THEME_STORAGE_KEY = 'theme'

export const ThemeContext = createContext<ThemeContextValue | null>(null)
