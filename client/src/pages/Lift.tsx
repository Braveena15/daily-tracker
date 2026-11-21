import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, Clapperboard, Compass, Heart, Quote, Sparkles, Wind, type LucideIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { AiMessageCard } from '@/components/ai/AiMessageCard'
import { IconBubble } from '@/components/IconBubble'
import { aiRequests } from '@/lib/ai'
import { PageHeader } from '@/components/PageHeader'
import { ErrorNotice } from '@/components/StatusViews'
import { BoxBreathing } from '@/components/mind/BoxBreathing'
import { SupportButton } from '@/components/mind/Support'
import { useFetch } from '@/hooks/useFetch'
import { formatDate } from '@/lib/dates'
import { embedUrl, type LiftResponse } from '@/lib/mind'

const KIND_IDEAS = ['Drink a glass of water', 'Step outside for a minute', 'Message someone you like', 'Stretch your shoulders', 'Put on a song you love', 'Make a warm drink']

function LiftCard({ icon, title, children }: { icon: LucideIcon; title: string; children: ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <IconBubble icon={icon} tone="mental" />
          <CardTitle className="text-lg font-semibold">{title}</CardTitle>
        </div>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}

/** A gentle page of good things from your own life, your purpose, a quote, a video and a breathing exercise. */
export function Lift() {
  const { data, error } = useFetch<LiftResponse>('/lift-me-up', 'Could not load this page')

  return (
    <>
      <PageHeader title="Lift me up" description="A few good things, gathered just for you." />

      <div className="space-y-4 md:space-y-6">
        <div className="flex justify-end">
          <SupportButton />
        </div>

        <AiMessageCard title="A boost for you" request={aiRequests.boost()} autoLoad={false} startLabel="Give me a boost" />

        {error ? (
          <ErrorNotice>{error}</ErrorNotice>
        ) : !data ? (
          <div className="grid gap-4 md:grid-cols-2" aria-busy="true">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-44 rounded-2xl" />
            ))}
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 md:gap-6">
            <LiftCard icon={Compass} title={data.todayPurpose ? "Today's purpose" : 'What matters to you'}>
              {data.todayPurpose ? (
                <div className="space-y-3">
                  <p className="font-serif text-lg leading-relaxed whitespace-pre-line">{data.todayPurpose.text}</p>
                  {data.todayPurpose.focusValues.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {data.todayPurpose.focusValues.map((v) => (
                        <Badge key={v} variant="secondary" className="bg-mental-soft text-mental-foreground">
                          {v}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              ) : data.purpose ? (
                <div className="space-y-3">
                  {data.purpose.purposeStatement && <p className="font-serif text-lg leading-relaxed">{data.purpose.purposeStatement}</p>}
                  {data.purpose.coreValues.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {data.purpose.coreValues.map((v) => (
                        <Badge key={v} variant="secondary" className="bg-mental-soft text-mental-foreground">
                          {v}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  <Link to="/purpose" className="font-medium text-primary underline-offset-4 hover:underline">
                    Write down your purpose and values
                  </Link>{' '}
                  and they'll be here when you need them.
                </p>
              )}
            </LiftCard>

            <LiftCard icon={Sparkles} title="Moments that made you feel good">
              {data.goodThings.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  When you note good things in your daily check-in, they'll appear here to remind you.
                </p>
              ) : (
                <ul className="space-y-3">
                  {data.goodThings.map((g, i) => (
                    <li key={`${g.date}-${i}`} className="flex gap-3">
                      <Sparkles className="mt-1 size-4 shrink-0 text-learning" aria-hidden />
                      <div>
                        <p className="font-serif text-lg leading-snug">{g.text}</p>
                        <p className="text-xs text-muted-foreground">{formatDate(g.date)}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </LiftCard>

            {data.quote && (
              <LiftCard icon={Quote} title="A thought to hold">
                <figure className="space-y-2">
                  <blockquote className="font-serif text-xl leading-relaxed">“{data.quote.text}”</blockquote>
                  {data.quote.author && (
                    <figcaption className="text-sm text-muted-foreground">
                      — {data.quote.author}
                      {data.quote.source && <span className="block text-xs">{data.quote.source}</span>}
                    </figcaption>
                  )}
                </figure>
              </LiftCard>
            )}

            <LiftCard icon={Clapperboard} title="Something to watch">
              {data.video ? (
                <div className="space-y-2">
                  <div className="aspect-video overflow-hidden rounded-xl bg-muted">
                    <iframe
                      src={embedUrl(data.video.videoId)}
                      title={data.video.title}
                      className="size-full"
                      loading="lazy"
                      allow="accelerometer; encrypted-media; gyroscope; picture-in-picture"
                      referrerPolicy="strict-origin-when-cross-origin"
                      allowFullScreen
                    />
                  </div>
                  <p className="font-medium">{data.video.title}</p>
                  {data.video.note && <p className="text-sm text-muted-foreground">{data.video.note}</p>}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Save a video that lifts you up in your{' '}
                  <Link to="/motivation" className="font-medium text-primary underline-offset-4 hover:underline">
                    motivation library
                  </Link>
                  .
                </p>
              )}
            </LiftCard>

            {data.smallStep && (
              <LiftCard icon={CheckCircle2} title="A step you took">
                <p className="font-serif text-lg">{data.smallStep.text}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  You did this on {formatDate(data.smallStep.date)}. Small steps add up.
                </p>
              </LiftCard>
            )}

            <LiftCard icon={Wind} title="One minute of box breathing">
              <BoxBreathing />
            </LiftCard>
          </div>
        )}

        <Card className="bg-mental-soft/50 ring-mental/20">
          <CardContent className="space-y-4 text-center">
            <Heart className="mx-auto size-6 text-mental" aria-hidden />
            <p className="font-heading text-xl font-semibold text-balance">
              What's one kind thing you can do for yourself right now?
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {KIND_IDEAS.map((idea) => (
                <span key={idea} className="rounded-full bg-card px-3 py-1.5 text-sm">
                  {idea}
                </span>
              ))}
            </div>
            <Button asChild variant="ghost">
              <Link to="/thoughts/new">Or write down what's on your mind</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </>
  )
}
