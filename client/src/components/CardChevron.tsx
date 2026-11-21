import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * The cue that a card opens something: a chevron that nudges right on hover or keyboard focus.
 * Put `group` on the card. Informational cards never get one, so the two read differently.
 */
export function CardChevron({ className }: { className?: string }) {
  return (
    <ChevronRight
      className={cn(
        'size-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground group-focus-visible:translate-x-0.5',
        className,
      )}
      aria-hidden
    />
  )
}
