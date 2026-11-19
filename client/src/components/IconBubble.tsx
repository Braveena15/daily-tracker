import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toneSoft, type Tone } from '@/lib/tones'

/** A rounded square with an icon in an area's colour. */
export function IconBubble({
  icon: Icon,
  tone = 'primary',
  className,
}: {
  icon: LucideIcon
  tone?: Tone
  className?: string
}) {
  return (
    <span
      className={cn('inline-flex size-10 shrink-0 items-center justify-center rounded-xl', toneSoft[tone], className)}
      aria-hidden
    >
      <Icon className="size-5" />
    </span>
  )
}
