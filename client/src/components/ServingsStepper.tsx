import { Minus, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SERVINGS, formatServings } from '@/lib/meals'
import { cn } from '@/lib/utils'

/** − 1½ + in quarter steps, from ¼ to 10. */
export function ServingsStepper({
  value,
  onChange,
  label = 'Servings',
  size = 'sm',
  className,
}: {
  value: number
  onChange: (value: number) => void
  label?: string
  size?: 'sm' | 'lg'
  className?: string
}) {
  const step = (delta: number) => {
    const next = Math.round((value + delta) / SERVINGS.step) * SERVINGS.step
    onChange(Math.min(SERVINGS.max, Math.max(SERVINGS.min, next)))
  }
  const buttonSize = size === 'lg' ? 'icon' : 'icon-sm'

  return (
    <div role="group" aria-label={label} className={cn('inline-flex items-center gap-1 rounded-xl bg-muted p-1', className)}>
      <Button
        type="button"
        variant="ghost"
        size={buttonSize}
        aria-label={`Fewer ${label.toLowerCase()}`}
        disabled={value <= SERVINGS.min}
        onClick={() => step(-SERVINGS.step)}
        className="hover:bg-card"
      >
        <Minus />
      </Button>
      <output
        aria-live="polite"
        className={cn('min-w-9 text-center font-semibold tabular-nums', size === 'lg' ? 'min-w-14 text-xl' : 'text-sm')}
      >
        {formatServings(value)}
      </output>
      <Button
        type="button"
        variant="ghost"
        size={buttonSize}
        aria-label={`More ${label.toLowerCase()}`}
        disabled={value >= SERVINGS.max}
        onClick={() => step(SERVINGS.step)}
        className="hover:bg-card"
      >
        <Plus />
      </Button>
    </div>
  )
}
