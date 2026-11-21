// A calm note when a milestone is reached (a full week logged, a 7-day streak, halfway…). One at a
// time, the most meaningful first; closing it is remembered on the account, so it stays closed on
// every device. No points, badges or pressure.
import { useEffect, useState } from 'react'
import { Sprout, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { api } from '@/lib/api'
import type { StreakResponse } from '@/lib/entries'
import { reachedMilestones, type Milestone } from '@/lib/milestones'
import type { JourneyResponse } from '@/lib/progress'

export function MilestoneNote() {
  const [shown, setShown] = useState<{ milestone: Milestone; reached: string[] } | null>(null)
  const [closing, setClosing] = useState(false)

  useEffect(() => {
    let alive = true
    // A bonus: any failure just means no note
    Promise.all([
      api.get<JourneyResponse>('/progress/journey'),
      api.get<StreakResponse>('/entries/stats/streak'),
      api.get<{ dismissed: string[] }>('/profile/milestones'),
    ]).then(
      ([journey, streak, { dismissed }]) => {
        if (!alive) return
        const reached = reachedMilestones(journey, streak)
        const next = reached.find((m) => !dismissed.includes(m.id))
        setShown(next ? { milestone: next, reached: reached.map((m) => m.id) } : null)
      },
      () => {},
    )
    return () => {
      alive = false
    }
  }, [])

  if (!shown) return null

  async function close() {
    setClosing(true)
    try {
      // Closing also settles the smaller milestones already passed, so they don't follow one by one
      await api.post('/profile/milestones/dismissed', { ids: shown!.reached })
    } catch {
      // Not saved: it may show again next time, which is harmless
    }
    setShown(null)
  }

  return (
    <Card size="sm" className="animate-in bg-secondary/60 ring-primary/15 duration-250 fade-in-0" role="status">
      <CardContent className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-card text-primary" aria-hidden>
          <Sprout className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-heading text-lg font-semibold text-secondary-foreground">{shown.milestone.title}</p>
          <p className="text-sm text-muted-foreground">{shown.milestone.text}</p>
        </div>
        <Button variant="ghost" size="icon-sm" className="shrink-0 text-muted-foreground" aria-label="Close this note" loading={closing} onClick={() => void close()}>
          <X />
        </Button>
      </CardContent>
    </Card>
  )
}
