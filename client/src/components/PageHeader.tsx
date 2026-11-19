import type { ReactNode } from 'react'
import { UserMenu } from '@/components/UserMenu'
import { useAuth } from '@/context/useAuth'
import { formatDate, formatLongDate, greeting, todayInTimezone } from '@/lib/dates'

/**
 * Friendly header at the top of each page: "Good evening, Sam" and today's date.
 * Without a `title`, the greeting is the heading; with one, the greeting sits above it.
 * `action` is an optional button shown on the right.
 */
export function PageHeader({
  title,
  description,
  action,
}: {
  title?: string
  description?: ReactNode
  action?: ReactNode
}) {
  const { user } = useAuth()
  const firstName = user?.name.trim().split(/\s+/)[0] ?? ''
  const hello = firstName ? `${greeting()}, ${firstName}` : greeting()
  const today = todayInTimezone()

  return (
    <header className="mb-6 flex items-start justify-between gap-4 md:mb-8">
      <div className="min-w-0">
        <p className="text-sm font-medium text-muted-foreground">
          {title ? `${hello} · ${formatDate(today, today)}` : formatLongDate(today)}
        </p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-balance md:text-4xl">{title ?? hello}</h1>
        {description && <p className="mt-2 text-pretty text-muted-foreground">{description}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {action}
        <UserMenu className="md:hidden" />
      </div>
    </header>
  )
}
