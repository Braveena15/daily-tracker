import type { ReactNode } from 'react'
import { ArrowLeft } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { UserMenu } from '@/components/UserMenu'
import { useAuth } from '@/context/useAuth'
import { formatDate, formatLongDate, greeting, todayInTimezone } from '@/lib/dates'

/**
 * Friendly header at the top of each page: "Good evening, Sam" and today's date.
 * Without a `title`, the greeting is the heading; with one, the greeting sits above it.
 * `action` is an optional button shown on the right; `back` adds a back link above the title.
 */
export function PageHeader({
  title,
  description,
  action,
  back,
}: {
  title?: string
  description?: ReactNode
  action?: ReactNode
  back?: { to: string; label: string }
}) {
  const { user } = useAuth()
  const firstName = user?.name.trim().split(/\s+/)[0] ?? ''
  const hello = firstName ? `${greeting()}, ${firstName}` : greeting()
  const today = todayInTimezone()

  return (
    <header className="mb-6 flex items-start justify-between gap-4 md:mb-8">
      <div className="min-w-0">
        {back && <BackLink to={back.to} label={back.label} className="mb-2" />}
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

/**
 * "← Meals": the one back link style, used on sub-pages (a day in History, My Foods, a diary
 * entry, a thought log). Pass `onClick` instead of `to` when leaving needs a check first.
 */
export function BackLink({
  to,
  onClick,
  label,
  className,
}: {
  to?: string
  onClick?: () => void
  label: string
  className?: string
}) {
  const classes = `-ml-3 h-11 px-3 text-muted-foreground md:h-10 ${className ?? ''}`
  if (!to) {
    return (
      <Button variant="ghost" className={classes} onClick={onClick}>
        <ArrowLeft aria-hidden /> {label}
      </Button>
    )
  }
  return (
    <Button asChild variant="ghost" className={classes}>
      <Link to={to}>
        <ArrowLeft aria-hidden /> {label}
      </Link>
    </Button>
  )
}
