import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

/** An input with a unit ("kg", "min") shown inside it on the right. */
export function InputWithUnit({ unit, className, ...props }: ComponentProps<'input'> & { unit?: string }) {
  return (
    <div
      className={cn(
        'flex h-10 w-full min-w-0 pointer-coarse:h-11 items-center rounded-xl border border-input bg-card transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 dark:bg-input/30',
        className,
      )}
    >
      <input
        className="h-full w-full min-w-0 bg-transparent px-3 text-base outline-none placeholder:text-muted-foreground md:text-sm"
        {...props}
      />
      {unit && <span className="pr-3 text-sm text-muted-foreground select-none">{unit}</span>}
    </div>
  )
}
