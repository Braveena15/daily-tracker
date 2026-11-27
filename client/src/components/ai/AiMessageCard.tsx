import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { CircleAlert, HeartHandshake, RefreshCw, Sparkles, Target } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { SupportButton, SupportCard } from '@/components/mind/Support'
import type { AiMessage, AiResponse } from '@/lib/ai'
import { ApiError } from '@/lib/api'
import { IconBubble } from '@/components/IconBubble'
import { cn } from '@/lib/utils'

/**
 * A soft lavender card with an encouraging message. The server decides whether it comes from
 * the AI or is a pre-written message; this card just shows it, and never breaks the page.
 * If the person's words suggested they're struggling, it shows support contacts instead.
 */
export function AiMessageCard({
  title,
  request,
  autoLoad = true,
  startLabel = 'Show me',
  className,
  footer,
}: {
  title: string
  /** Fetches the message; `regenerate` asks for a fresh one */
  request: (regenerate: boolean) => Promise<AiResponse>
  /** Load straight away, or wait for the person to tap `startLabel` */
  autoLoad?: boolean
  startLabel?: string
  className?: string
  /** Extra actions under the message (e.g. "Add as next week's goal") */
  footer?: (message: AiMessage) => ReactNode
}) {
  const [data, setData] = useState<AiResponse | null>(null)
  const [loading, setLoading] = useState(false)
  // true, or the server's message for a refusal (e.g. a read-only demo account)
  const [failed, setFailed] = useState<boolean | string>(false)
  const requestRef = useRef(request)
  useEffect(() => {
    requestRef.current = request
  }, [request])

  const load = useCallback(async (regenerate: boolean) => {
    setLoading(true)
    setFailed(false)
    try {
      setData(await requestRef.current(regenerate))
    } catch (err) {
      setFailed(err instanceof ApiError && err.status === 403 ? err.message : true)
    } finally {
      setLoading(false)
    }
  }, [])

  // Callers give each subject its own `key`, so this runs once per subject
  const started = useRef(false)
  useEffect(() => {
    if (autoLoad && !started.current) {
      started.current = true
      void load(false)
    }
  }, [autoLoad, load])

  const message = data?.message

  return (
    <Card className={cn('bg-mental-soft/50 ring-mental/20', className)} aria-live="polite">
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="flex min-w-0 items-center gap-3 text-lg font-semibold">
            <IconBubble icon={Sparkles} tone="mental" className="size-9 bg-card [&_svg]:size-4" />
            {title}
          </h2>
          {message && !data.showSupport && (
            <Button
              loading={loading}
              variant="outline"
              size="sm"
              className="shrink-0 border-mental/30 bg-card/70 text-mental-foreground hover:bg-card"
              onClick={() => void load(true)}
              disabled={data.limitReached}
              title={data.limitReached ? "You've reached today's limit" : 'Get a different message'}
            >
              <RefreshCw aria-hidden />
              {loading ? 'Writing…' : 'Try another'}
            </Button>
          )}
        </div>

        {loading && !message ? (
          <div className="space-y-2" aria-busy="true" aria-label="Writing your message">
            <Skeleton className="h-4 w-full bg-card" />
            <Skeleton className="h-4 w-11/12 bg-card" />
            <Skeleton className="h-4 w-3/5 bg-card" />
          </div>
        ) : data?.showSupport ? (
          <div className="space-y-3 rounded-xl bg-card p-4">
            <p className="flex items-center gap-2 font-medium">
              <HeartHandshake className="size-5 text-mental" aria-hidden /> Support is here
            </p>
            <SupportCard />
          </div>
        ) : message ? (
          <>
            <div className={cn('space-y-2 font-serif text-lg leading-relaxed', loading && 'opacity-60')}>
              {message.content.split(/\n{2,}/).map((paragraph, i) => (
                <p key={i}>{paragraph}</p>
              ))}
            </div>
            {message.focus && (
              <div className="rounded-xl bg-card/80 p-3">
                <p className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-mental-foreground uppercase">
                  <Target className="size-4" aria-hidden /> A focus for next week
                </p>
                <p className="mt-1 font-medium">{message.focus}</p>
              </div>
            )}
            {footer?.(message)}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">
                {message.source === 'ai' ? 'AI-generated · may be imperfect' : 'A message from us — the AI wasn’t used this time'}
              </p>
              {data.limitReached && <p className="text-xs text-muted-foreground">That's all the fresh messages for today</p>}
            </div>
            {data.lowMood && <SupportButton className="bg-card" />}
          </>
        ) : failed ? (
          <div className="flex flex-wrap items-center gap-3 rounded-xl bg-card/70 p-3" role="alert">
            <p className="flex min-w-0 flex-1 items-start gap-2 text-sm text-muted-foreground">
              <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              {typeof failed === 'string' ? failed : "Couldn't fetch a message right now — that's okay. Your data is safe."}
            </p>
            {failed === true && (
              <Button variant="outline" size="sm" className="bg-card" onClick={() => void load(false)}>
                <RefreshCw aria-hidden /> Try again
              </Button>
            )}
          </div>
        ) : (
          <Button loading={loading} variant="outline" className="bg-card" onClick={() => void load(false)} disabled={loading}>
            <Sparkles className="text-mental" aria-hidden />
            {startLabel}
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
