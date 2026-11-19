import { cn } from '@/lib/utils'
import { useTheme } from '@/context/useTheme'
import { THEME_OPTIONS } from '@/lib/themeOptions'

/** Light / Dark / System, as a small segmented control. */
export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme()

  return (
    <div role="radiogroup" aria-label="Theme" className={cn('inline-flex gap-0.5 rounded-xl bg-muted p-1', className)}>
      {THEME_OPTIONS.map(({ value, label, icon: Icon }) => {
        const active = theme === value
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={`${label} theme`}
            title={label}
            onClick={() => setTheme(value)}
            className={cn(
              'grid size-8 place-items-center rounded-lg text-muted-foreground transition-all outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-95',
              active && 'bg-card text-foreground shadow-soft',
            )}
          >
            <Icon className="size-4" />
          </button>
        )
      })}
    </div>
  )
}
