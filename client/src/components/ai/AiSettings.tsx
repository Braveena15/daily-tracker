import { useEffect, useState } from 'react'
import { Check, Lock, ShieldCheck, Sparkles, X } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { IconBubble } from '@/components/IconBubble'
import { api } from '@/lib/api'
import type { AiStatus } from '@/lib/ai'

const SHARED_MINIMAL = [
  'Scores, mood and energy (0–10), and sleep hours',
  'Activity types and minutes (names you typed yourself are shown only as "other")',
  'Feeling names and how strong they were, and thinking-trap types',
  'Counts, like how many good things you noted',
  'Days described as "today" or "yesterday", never real dates',
]

const NEVER_SHARED = [
  'Your diary — ever',
  'Your name, email or account details',
  'Your good things, reflections and notes in your own words',
]

/** The "AI" section of the Profile page: what's shared, today's usage, and an on/off switch. */
export function AiSettings() {
  const [status, setStatus] = useState<AiStatus | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api.get<AiStatus>('/ai/status').then(setStatus).catch(() => setStatus(null))
  }, [])

  async function toggle(aiEnabled: boolean) {
    setSaving(true)
    try {
      setStatus(await api.put<AiStatus>('/ai/settings', { aiEnabled }))
      toast.success(aiEnabled ? 'AI encouragement is on' : 'AI is off — you\'ll see pre-written messages instead')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not change this setting')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card className="max-w-3xl">
      <CardHeader>
        <div className="flex items-center gap-3">
          <IconBubble icon={Sparkles} tone="mental" />
          <div>
            <CardTitle className="text-lg font-semibold">AI encouragement</CardTitle>
            <CardDescription>Short, kind notes written by Google's Gemini from a small summary of your data.</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {!status ? (
          <Skeleton className="h-24 w-full rounded-xl" />
        ) : (
          <>
            <label className="flex items-center justify-between gap-4 rounded-xl border p-4">
              <span>
                <span className="block font-medium">Use AI</span>
                <span className="text-sm text-muted-foreground">
                  {status.demo
                    ? 'This demo never contacts an AI: you see pre-written example replies.'
                    : !status.configured
                    ? "AI isn't set up on this server, so you'll see pre-written messages."
                    : status.userEnabled
                      ? `${status.usedToday} of ${status.limit} AI messages used today.`
                      : 'Off — nothing is sent to the AI. You\'ll see pre-written messages instead.'}
                </span>
              </span>
              <Switch
                checked={status.userEnabled}
                disabled={saving}
                onCheckedChange={(v) => void toggle(v)}
                aria-label="Use AI encouragement"
              />
            </label>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <p className="flex items-center gap-2 text-sm font-medium">
                  <ShieldCheck className="size-4 text-primary" aria-hidden />
                  What's shared ({status.mode === 'full' ? 'full' : 'minimal'} mode)
                </p>
                <ul className="space-y-1.5 text-sm text-muted-foreground">
                  {SHARED_MINIMAL.map((item) => (
                    <li key={item} className="flex gap-2">
                      <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden /> {item}
                    </li>
                  ))}
                  {status.mode === 'full' && (
                    <li className="flex gap-2">
                      <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                      The words in your thought logs — except logs you've marked private
                    </li>
                  )}
                </ul>
              </div>
              <div className="space-y-2">
                <p className="flex items-center gap-2 text-sm font-medium">
                  <Lock className="size-4 text-mental" aria-hidden /> Never shared
                </p>
                <ul className="space-y-1.5 text-sm text-muted-foreground">
                  {[...NEVER_SHARED, ...(status.mode === 'minimal' ? ['The words in your thought logs'] : ['Thought logs marked private'])].map((item) => (
                    <li key={item} className="flex gap-2">
                      <X className="mt-0.5 size-4 shrink-0 text-mental" aria-hidden /> {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <p className="rounded-xl bg-muted/60 p-3 text-sm text-muted-foreground">
              Before anything is sent, your own words are checked. If they suggest you're going through something really
              hard, the AI isn't used at all and support contacts are shown instead.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  )
}
