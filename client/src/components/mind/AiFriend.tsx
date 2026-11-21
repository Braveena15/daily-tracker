// "Talk to my AI friend" in the Thought log. The thought is only shared after a tap (and, the first
// time, after the explanation dialog). Private logs are never shared. Crisis words show support
// contacts instead of AI text (the server never sends them to the AI).
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { HeartHandshake, Loader2, Lock, Plus, Send, ThumbsDown, ThumbsUp } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { SupportButton, SupportCard } from '@/components/mind/Support'
import { api } from '@/lib/api'
import {
  SUPPORT_LINE,
  friendApi,
  hasSeenFriendExplanation,
  rememberFriendExplanation,
  type FriendConversation,
  type FriendResponse,
} from '@/lib/aiFriend'
import { todayInTimezone } from '@/lib/dates'
import { cn } from '@/lib/utils'

export function AiFriend({ thoughtId, thoughtDate, isPrivate }: { thoughtId: string; thoughtDate: string; isPrivate: boolean }) {
  const [conversation, setConversation] = useState<FriendConversation | null>(null)
  const [messagesLeft, setMessagesLeft] = useState(10)
  const [loaded, setLoaded] = useState(false)
  const [includeContext, setIncludeContext] = useState(false)
  const [explaining, setExplaining] = useState(false)
  const [asking, setAsking] = useState(false)
  const [support, setSupport] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // The saved conversation, if any (this never calls the AI)
  useEffect(() => {
    if (isPrivate) return
    let cancelled = false
    friendApi
      .get(thoughtId)
      .then((data) => {
        if (cancelled) return
        setConversation(data.conversation)
        setMessagesLeft(data.messagesLeft)
        setLoaded(true)
      })
      .catch(() => !cancelled && setLoaded(true))
    return () => {
      cancelled = true
    }
  }, [thoughtId, isPrivate])

  if (isPrivate) {
    return (
      <p className="flex items-center justify-center gap-1.5 text-sm text-muted-foreground">
        <Lock className="size-4" aria-hidden /> Private — not shared with AI
      </p>
    )
  }

  function apply(data: FriendResponse) {
    if (data.showSupport) return setSupport(true)
    setSupport(false)
    if (data.conversation) setConversation(data.conversation)
    setMessagesLeft(data.messagesLeft)
    if (data.limitReached) toast.message("You've used today's AI replies, so here's a message from us instead 💜")
  }

  async function share() {
    setExplaining(false)
    setAsking(true)
    setError(null)
    try {
      apply(await friendApi.start(thoughtId, includeContext))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Your AI friend is unavailable right now')
    } finally {
      setAsking(false)
    }
  }

  function talk() {
    if (hasSeenFriendExplanation()) void share()
    else setExplaining(true)
  }

  return (
    <section aria-label="AI friend" className="space-y-4 text-left">
      {!conversation && !support && (
        <div className="flex flex-col items-center gap-3 text-center">
          <Button size="lg" onClick={talk} disabled={asking || !loaded}>
            {asking ? <Loader2 className="animate-spin" aria-hidden /> : <HeartHandshake aria-hidden />}
            {asking ? 'Your friend is reading…' : 'Talk to my AI friend 💜'}
          </Button>
          <p className="text-xs text-muted-foreground">Shares this thought with Gemini</p>
          <div className="flex items-center gap-2">
            <Switch id={`friend-context-${thoughtId}`} checked={includeContext} onCheckedChange={setIncludeContext} />
            <Label htmlFor={`friend-context-${thoughtId}`} className="text-sm font-normal">
              Include my values and a few recent good moments
            </Label>
          </div>
        </div>
      )}

      {error && (
        <p className="text-center text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      {support && (
        <Card className="bg-mental-soft/60 ring-mental/20">
          <CardContent className="space-y-4">
            <p className="font-heading text-lg leading-snug">{SUPPORT_LINE}</p>
            <SupportCard />
          </CardContent>
        </Card>
      )}

      {conversation && (
        <>
          <FriendReplyCard
            thoughtId={thoughtId}
            conversation={conversation}
            canAddIntention={thoughtDate === todayInTimezone()}
            onChange={setConversation}
          />
          <FriendChat thoughtId={thoughtId} conversation={conversation} messagesLeft={messagesLeft} onResult={apply} />
        </>
      )}

      {(conversation || support) && (
        <div className="flex justify-center">
          <SupportButton />
        </div>
      )}

      <Dialog open={explaining} onOpenChange={setExplaining}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Share this thought with your AI friend?</DialogTitle>
            <DialogDescription>Your AI friend is powered by Google's Gemini. Here's what happens if you share.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <p className="font-medium">What's shared:</p>
            <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
              <li>this thought and the situation</li>
              <li>the feelings you named and how strong they were</li>
              <li>the thinking traps you picked</li>
              <li>your evidence and your balanced thought, if you wrote them</li>
              {includeContext && <li>your core value words and up to 3 recent good moments</li>}
            </ul>
            <p className="text-muted-foreground">
              It's sent to Google's Gemini API. On the free tier, Google may review what's sent to improve its services. Your diary and
              your other thought logs are never shared.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExplaining(false)}>
              Keep it private
            </Button>
            <Button
              onClick={() => {
                rememberFriendExplanation()
                void share()
              }}
            >
              Share this thought
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}

/** 👍 / 👎 under a reply. */
function Helpful({ value, onChange }: { value: boolean | null | undefined; onChange: (v: boolean | null) => void }) {
  const button = (helpful: boolean) => (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label={helpful ? 'This helped' : "This didn't help"}
      aria-pressed={value === helpful}
      onClick={() => onChange(value === helpful ? null : helpful)}
      className={cn(value === helpful && 'bg-mental-soft text-mental-foreground')}
    >
      {helpful ? <ThumbsUp /> : <ThumbsDown />}
    </Button>
  )
  return (
    <div className="flex items-center gap-1 text-xs text-muted-foreground">
      Did this help? {button(true)}
      {button(false)}
    </div>
  )
}

function FriendReplyCard({
  thoughtId,
  conversation,
  canAddIntention,
  onChange,
}: {
  thoughtId: string
  conversation: FriendConversation
  canAddIntention: boolean
  onChange: (c: FriendConversation) => void
}) {
  const { reply } = conversation
  const [adding, setAdding] = useState(false)

  async function rate(helpful: boolean | null) {
    try {
      onChange((await friendApi.feedback(thoughtId, 'reply', helpful)).conversation)
    } catch {
      toast.error('Could not save that')
    }
  }

  async function addIntention() {
    setAdding(true)
    try {
      await api.post(`/entries/${todayInTimezone()}/purpose/intentions`, { text: reply.smallStep.slice(0, 200) })
      toast.success("Added to today's intentions ✓")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not add it')
    } finally {
      setAdding(false)
    }
  }

  return (
    <Card className="animate-in bg-mental-soft/60 ring-mental/20 duration-300 fade-in-0">
      <CardContent className="space-y-5">
        <p className="font-heading text-lg leading-snug">{reply.acknowledge}</p>

        <section className="space-y-2">
          <h3 className="text-sm font-semibold text-mental-foreground">Another way to see it</h3>
          <ul className="space-y-2">
            {reply.perspectives.map((p, i) => (
              <li key={i} className="rounded-xl bg-card/80 p-3 text-sm leading-relaxed">
                {p}
              </li>
            ))}
          </ul>
        </section>

        <section className="space-y-1">
          <h3 className="text-sm font-semibold text-mental-foreground">Something you're doing well</h3>
          <p className="text-sm leading-relaxed">{reply.strength}</p>
        </section>

        <section className="space-y-2">
          <h3 className="text-sm font-semibold text-mental-foreground">One small step</h3>
          <p className="text-sm leading-relaxed">{reply.smallStep}</p>
          {canAddIntention && (
            <Button type="button" variant="outline" size="sm" className="bg-card" onClick={addIntention} disabled={adding}>
              {adding ? <Loader2 className="animate-spin" aria-hidden /> : <Plus aria-hidden />} Add as an intention for today
            </Button>
          )}
        </section>

        <p className="font-heading text-lg">{reply.closing}</p>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-mental/15 pt-3">
          <p className="text-xs text-muted-foreground">{reply.source === 'ai' ? 'AI-generated · may be imperfect' : 'A message from Daily Tracker'}</p>
          <Helpful value={reply.helpful} onChange={rate} />
        </div>
      </CardContent>
    </Card>
  )
}

function FriendChat({
  thoughtId,
  conversation,
  messagesLeft,
  onResult,
}: {
  thoughtId: string
  conversation: FriendConversation
  messagesLeft: number
  onResult: (data: FriendResponse) => void
}) {
  const [draft, setDraft] = useState('')
  const [pending, setPending] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'nearest' })
  }, [conversation.messages.length, pending])

  async function send(e: FormEvent) {
    e.preventDefault()
    const message = draft.trim()
    if (!message || pending) return
    setPending(message)
    setDraft('')
    setError(null)
    try {
      onResult(await friendApi.send(thoughtId, message))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send')
      setDraft(message)
    } finally {
      setPending(null)
    }
  }

  async function rate(index: number, helpful: boolean | null) {
    try {
      const data = await friendApi.feedback(thoughtId, index, helpful)
      onResult({ conversation: data.conversation, showSupport: false, limitReached: false, messagesLeft: data.messagesLeft })
    } catch {
      toast.error('Could not save that')
    }
  }

  return (
    <section aria-label="Talk it through" className="space-y-3">
      <h3 className="text-sm font-semibold">Talk it through</h3>
      {conversation.messages.length > 0 && (
        <ol className="space-y-2" aria-live="polite">
          {conversation.messages.map((m, i) => (
            <li key={`${m.at}-${i}`} className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
              <div
                className={cn(
                  'max-w-[85%] space-y-1 rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed',
                  m.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-mental-soft/70',
                )}
              >
                <p className="whitespace-pre-line">{m.text}</p>
                {m.role === 'friend' && <Helpful value={m.helpful} onChange={(v) => rate(i, v)} />}
              </div>
            </li>
          ))}
        </ol>
      )}
      {pending && (
        <>
          <div className="flex justify-end">
            <p className="max-w-[85%] rounded-2xl bg-primary/70 px-3.5 py-2.5 text-sm text-primary-foreground">{pending}</p>
          </div>
          <div className="flex justify-start" role="status" aria-label="Your friend is typing">
            <span className="flex gap-1 rounded-2xl bg-mental-soft/70 px-4 py-3">
              {[0, 1, 2].map((d) => (
                <span key={d} className="size-1.5 animate-pulse rounded-full bg-mental-foreground/60" style={{ animationDelay: `${d * 150}ms` }} />
              ))}
            </span>
          </div>
        </>
      )}
      <div ref={endRef} />

      {messagesLeft > 0 ? (
        <form className="space-y-1.5" onSubmit={send}>
          <div className="flex items-end gap-2">
            <Textarea
              aria-label="Message your AI friend"
              placeholder="Say more, or ask something…"
              rows={2}
              maxLength={1000}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="min-h-12"
            />
            <Button type="submit" size="icon" aria-label="Send" disabled={!draft.trim() || pending !== null}>
              {pending ? <Loader2 className="animate-spin" /> : <Send />}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {messagesLeft} {messagesLeft === 1 ? 'message' : 'messages'} left · shares your messages with Gemini
          </p>
        </form>
      ) : (
        <p className="text-sm text-muted-foreground">That's the end of this conversation. Be gentle with yourself. 💜</p>
      )}
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
    </section>
  )
}
