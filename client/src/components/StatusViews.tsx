import { useEffect, useState, type ReactNode } from 'react'
import { CircleAlert, type LucideIcon } from 'lucide-react'
import { IconBubble } from '@/components/IconBubble'
import { Skeleton } from '@/components/ui/skeleton'
import type { Tone } from '@/lib/tones'
import { cn } from '@/lib/utils'

// The free hosting plan puts the server to sleep when it's idle; the first request wakes it up
const SLOW_AFTER_MS = 3000

/**
 * Whole-screen loading, used while we check whether you're logged in.
 * After 3 seconds it explains that the server may be waking up.
 */
export function FullPageLoader() {
  const [slow, setSlow] = useState(false)
  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), SLOW_AFTER_MS)
    return () => clearTimeout(timer)
  }, [])

  return (
    <div className="grid min-h-dvh place-items-center px-6" role="status" aria-live="polite">
      <div className="flex max-w-xs flex-col items-center gap-3 text-center text-muted-foreground">
        <span className="animate-pulse text-4xl" aria-hidden>
          🌱
        </span>
        {slow ? (
          <>
            <span className="font-medium text-foreground">Waking up the server… this can take up to a minute</span>
            <span className="text-sm">It naps when nobody's using it. Thanks for your patience!</span>
          </>
        ) : (
          <span className="text-sm">Loading…</span>
        )}
      </div>
    </div>
  )
}

/** A page-shaped placeholder: a header and two cards. Shown while a page's code loads. */
export function PageSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading the page" role="status">
      <Skeleton className="h-4 w-40" />
      <Skeleton className="mt-3 h-9 w-56 md:h-10" />
      <div className="mt-8 space-y-6">
        <Skeleton className="h-40 w-full rounded-2xl" />
        <Skeleton className="h-56 w-full rounded-2xl" />
      </div>
    </div>
  )
}

/** A friendly "nothing here yet" message with an icon and an optional button. */
export function EmptyState({
  icon,
  tone = 'primary',
  title,
  children,
  action,
  className,
}: {
  icon: LucideIcon
  tone?: Tone
  title: string
  children?: ReactNode
  action?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-col items-center gap-3 px-4 py-8 text-center', className)}>
      <IconBubble icon={icon} tone={tone} className="size-12 rounded-2xl [&_svg]:size-6" />
      <div className="space-y-1">
        <p className="font-heading text-lg font-semibold">{title}</p>
        {children && <p className="mx-auto max-w-sm text-sm text-pretty text-muted-foreground">{children}</p>}
      </div>
      {action && <div className="mt-1">{action}</div>}
    </div>
  )
}

/** A red message box for errors. */
export function ErrorNotice({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      role="alert"
      className={cn(
        'flex items-start gap-2.5 rounded-xl border border-destructive/25 bg-destructive/10 px-4 py-3 text-sm text-destructive',
        className,
      )}
    >
      <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span>{children}</span>
    </div>
  )
}

/** A form or action error: an icon and red text (never colour alone), announced to screen readers. */
export function FormError({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cn('flex items-start gap-1.5 text-sm text-destructive', className)} role="alert">
      <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span>{children}</span>
    </p>
  )
}
