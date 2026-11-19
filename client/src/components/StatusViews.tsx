import type { ReactNode } from 'react'
import { CircleAlert, type LucideIcon } from 'lucide-react'
import { IconBubble } from '@/components/IconBubble'
import type { Tone } from '@/lib/tones'
import { cn } from '@/lib/utils'

/** Whole-screen loading, used while we check whether you're logged in. */
export function FullPageLoader() {
  return (
    <div className="grid min-h-dvh place-items-center" role="status">
      <div className="flex flex-col items-center gap-3 text-muted-foreground">
        <span className="animate-pulse text-4xl" aria-hidden>
          🌱
        </span>
        <span className="text-sm">Loading…</span>
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
