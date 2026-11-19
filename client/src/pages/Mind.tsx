import { Link } from 'react-router-dom'
import { ArrowRight, Lock } from 'lucide-react'
import { IconBubble } from '@/components/IconBubble'
import { PageHeader } from '@/components/PageHeader'
import { SupportButton } from '@/components/mind/Support'
import { MIND_PAGES } from '@/lib/mind'

/** The "Mind" hub: links to the diary, thought log, lift me up, purpose and motivation. */
export function Mind() {
  return (
    <>
      <PageHeader title="Mind" description="Space to write, reflect and look after yourself." />
      <div className="space-y-4 md:space-y-6">
        <ul className="grid gap-3 sm:grid-cols-2">
          {MIND_PAGES.map((page) => (
            <li key={page.to}>
              <Link
                to={page.to}
                className="flex h-full items-center gap-4 rounded-2xl bg-card p-4 shadow-soft ring-1 ring-foreground/[0.06] transition-all outline-none hover:-translate-y-0.5 hover:ring-mental/40 focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-[0.99]"
              >
                <IconBubble icon={page.icon} tone="mental" className="size-12 rounded-2xl [&_svg]:size-6" />
                <div className="min-w-0 flex-1">
                  <p className="font-heading text-lg font-semibold">{page.label}</p>
                  <p className="text-sm text-muted-foreground">{page.description}</p>
                </div>
                <ArrowRight className="size-4 text-muted-foreground" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
        <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Lock className="size-4" aria-hidden /> Your diary and thought logs are encrypted before they're stored.
          </p>
          <SupportButton />
        </div>
      </div>
    </>
  )
}
