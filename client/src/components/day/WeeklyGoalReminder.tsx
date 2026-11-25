// A quiet one-line reminder of this week's goal, under Today's purposes (today only).
import { useEffect, useState } from 'react'
import { Target } from 'lucide-react'
import { AddToWhatMatters } from '@/components/purpose/AddToWhatMatters'
import type { DayPurpose } from '@/lib/purpose'
import { goalsApi, type WeeklyGoal } from '@/lib/weeklyGoals'

export function WeeklyGoalReminder({
  today,
  purposes,
  addPurpose,
}: {
  today: string
  purposes: DayPurpose[]
  /** Adds the goal as one of today's items (intensity 5) */
  addPurpose: (body: { text: string; intensity: number }) => Promise<unknown>
}) {
  const [goal, setGoal] = useState<WeeklyGoal | null>(null)

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

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-mental-soft/50 px-4 py-2 text-sm">
      <p className="flex min-w-0 flex-1 items-center gap-2">
        <Target className="size-4 shrink-0 text-mental" aria-hidden />
        <span className="text-muted-foreground">This week's goal:</span>
        <span className="min-w-0 truncate font-medium" title={goal.text}>
          {goal.text}
        </span>
      </p>
      <AddToWhatMatters text={goal.text} purposes={purposes} onAdd={addPurpose} />
    </div>
  )
}
