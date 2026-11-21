// A quiet one-line reminder of this week's goal, under Today's purpose (today only).
import { useEffect, useState } from 'react'
import { Check, Plus, Target } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { MAX_INTENTIONS, type DailyPurpose } from '@/lib/purpose'
import { goalsApi, type WeeklyGoal } from '@/lib/weeklyGoals'

export function WeeklyGoalReminder({
  today,
  purpose,
  addIntention,
}: {
  today: string
  purpose: DailyPurpose | null
  addIntention: (text: string) => Promise<unknown>
}) {
  const [goal, setGoal] = useState<WeeklyGoal | null>(null)
  const [adding, setAdding] = useState(false)

  useEffect(() => {
    let alive = true
    // Goals are a bonus: if this fails, the reminder simply doesn't show
    goalsApi.get(today).then(
      (d) => alive && setGoal(d.current && !d.current.done ? d.current : null),
      () => {},
    )
    return () => {
      alive = false
    }
  }, [today])

  if (!goal) return null
  const intentions = purpose?.intentions ?? []
  const added = intentions.some((i) => i.text.trim().toLowerCase() === goal.text.trim().toLowerCase())
  const full = intentions.length >= MAX_INTENTIONS

  async function add() {
    setAdding(true)
    try {
      await addIntention(goal!.text)
      toast.success("Added to today's intentions")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not add the intention')
    } finally {
      setAdding(false)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-mental-soft/50 px-4 py-2 text-sm">
      <p className="flex min-w-0 flex-1 items-center gap-2">
        <Target className="size-4 shrink-0 text-mental" aria-hidden />
        <span className="text-muted-foreground">This week's goal:</span>
        <span className="min-w-0 truncate font-medium" title={goal.text}>
          {goal.text}
        </span>
      </p>
      {added ? (
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <Check className="size-4 text-success" aria-hidden /> In today's intentions
        </span>
      ) : (
        !full && (
          <Button variant="ghost" size="sm" className="text-mental-foreground" loading={adding} onClick={() => void add()}>
            <Plus aria-hidden /> Add as today's intention
          </Button>
        )
      )}
    </div>
  )
}
