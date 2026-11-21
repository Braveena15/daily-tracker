import type { ReactNode } from 'react'
import { Info } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

/**
 * A small ⓘ button that explains a number. A popover rather than a hover tooltip, so it works with
 * a tap on a phone and with Enter/Space on a keyboard; Escape or a tap outside closes it.
 */
export function InfoTip({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  return (
    <Popover>
      <PopoverTrigger
        className={cn(
          'relative grid size-6 shrink-0 after:absolute after:-inset-2.5 place-items-center rounded-full text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50',
          className,
        )}
        aria-label={`About the ${title.toLowerCase()}`}
      >
        <Info className="size-4" aria-hidden />
      </PopoverTrigger>
      <PopoverContent className="w-64 text-sm" side="top">
        <p className="font-medium">{title}</p>
        <p className="text-muted-foreground">{children}</p>
      </PopoverContent>
    </Popover>
  )
}
