import { Monitor, Moon, Sun, type LucideIcon } from 'lucide-react'
import type { Theme } from '@/context/theme-context'

export const THEME_OPTIONS: { value: Theme; label: string; icon: LucideIcon }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
]
