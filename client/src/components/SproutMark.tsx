import { cn } from '@/lib/utils'

/**
 * The Daily Tracker sprout: the same drawing as the app icon (public/favicon.svg), simplified on a
 * 24px grid so it stays crisp from 16 to 40px. It uses the theme's sage (currentColor, text-primary
 * by default), so it follows light and dark mode. Decorative: the app name always sits next to it.
 */
export function SproutMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={cn('size-6 shrink-0 text-primary', className)} aria-hidden focusable="false">
      <path d="M12 21.5C12 18.6 11.9 15.8 12 12.4" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
      <path d="M11.8 15.4C9.1 15.8 5.9 14.2 4.9 9.7C9 9.1 11.7 11.3 11.8 15.4Z" fill="currentColor" opacity="0.6" />
      <path d="M12.1 13.3C13.5 9.3 16.9 7 20.3 7.4C19.9 11.8 16.4 14.2 12.1 13.3Z" fill="currentColor" />
    </svg>
  )
}
