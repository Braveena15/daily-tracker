import { useCallback, useEffect, useRef, useState } from 'react'
import { HeartHandshake, Loader2, RefreshCw, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { SupportButton, SupportCard } from '@/components/mind/Support'
import type { AiResponse } from '@/lib/ai'
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
}: {
  title: string
  /** Fetches the message; `regenerate` asks for a fresh one */
  request: (regenerate: boolean) => Promise<AiResponse>
  /** Load straight away, or wait for the person to tap `startLabel` */
  autoLoad?: boolean
  startLabel?: string
  className?: string
}) {
  const [data, setData] = useState<AiResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)
  const requestRef = useRef(request)
  useEffect(() => {
    requestRef.current = request
  }, [request])

  const load = useCallback(async (regenerate: boolean) => {
    setLoading(true)
    setFailed(false)
    try {
      setData(await requestRef.current(regenerate))
    } catch {
      setFailed(true)
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
        <div className="flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Sparkles className="size-4 text-mental" aria-hidden />
            {title}
          </h2>
          {message && !data.showSupport && (
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              onClick={() => void load(true)}
              disabled={loading || data.limitReached}
              title={data.limitReached ? "You've reached today's limit" : 'Get a different message'}
              aria-label="Try another message"
            >
              {loading ? <Loader2 className="animate-spin" aria-hidden /> : <RefreshCw aria-hidden />}
              <span className="hidden sm:inline">Try another</span>
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
            <div className="flex flex-wrap items-center justify-between gap-2">
              {message.source === 'ai' ? (
                <p className="text-xs text-muted-foreground">AI-generated · may be imperfect</p>
              ) : (
                <span />
              )}
              {data.limitReached && <p className="text-xs text-muted-foreground">That's all the fresh messages for today</p>}
            </div>
            {data.lowMood && <SupportButton className="bg-card" />}
          </>
        ) : failed ? (
          <p className="text-sm text-muted-foreground">
            Couldn't fetch a message right now — that's okay.{' '}
            <button type="button" className="font-medium text-foreground underline-offset-4 hover:underline" onClick={() => void load(false)}>
              Try again
            </button>
          </p>
        ) : (
          <Button variant="outline" className="bg-card" onClick={() => void load(false)} disabled={loading}>
            {loading ? <Loader2 className="animate-spin" aria-hidden /> : <Sparkles className="text-mental" aria-hidden />}
            {startLabel}
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
