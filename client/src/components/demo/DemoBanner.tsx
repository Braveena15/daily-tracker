// Shown on every page of the public demo, and only there.
import { FlaskConical } from 'lucide-react'
import { DEMO_AUTHOR } from '@/lib/demo'
import { cn } from '@/lib/utils'

const linkClass = 'font-medium underline underline-offset-4 hover:no-underline'

/** "You're exploring a demo…": slim, above each page's content. */
export function DemoBanner({ repoUrl, className }: { repoUrl: string | null; className?: string }) {
  return (
    <div
      role="note"
      className={cn('flex items-start gap-2.5 rounded-xl bg-learning-soft px-3.5 py-2.5 text-sm text-learning-foreground', className)}
    >
      <FlaskConical className="mt-0.5 size-4 shrink-0" aria-hidden />
      <p className="text-pretty">
        You're exploring a demo with sample data. It's deleted after 24 hours — please don't enter personal information.
        {repoUrl && (
          <>
            {' '}
            <a href={repoUrl} target="_blank" rel="noreferrer" className={linkClass}>
              See the code on GitHub
            </a>
          </>
        )}
      </p>
    </div>
  )
}

/** "Built by Routhiran · GitHub" at the bottom of the demo's pages. */
export function DemoFooter({ repoUrl, className }: { repoUrl: string | null; className?: string }) {
  return (
    <footer className={cn('text-center text-sm text-muted-foreground', className)}>
      Built by {DEMO_AUTHOR}
      {repoUrl && (
        <>
          {' · '}
          <a href={repoUrl} target="_blank" rel="noreferrer" className={cn(linkClass, 'text-foreground')}>
            GitHub
          </a>
        </>
      )}
    </footer>
  )
}
