// "This week's goal" (with a Did it? tick) and "Next week's goal" on the Weekly review.
// Next week's goal can be pre-filled from the AI reflection's focus line, and is always editable
// before saving. Replacing an existing goal asks first.
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { Check, Flag, Pencil, Plus, Target } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { FormError } from '@/components/StatusViews'
import { ApiError } from '@/lib/api'
import { formatDate } from '@/lib/dates'
import { GOAL_TEXT_MAX, goalsApi, type WeeklyGoal, type WeeklyGoalsResponse } from '@/lib/weeklyGoals'
import { cn } from '@/lib/utils'

const range = (g: { weekStart: string; weekEnd: string }) => `${formatDate(g.weekStart)} – ${formatDate(g.weekEnd)}`

export type GoalSuggestion = { text: string; id: number }

export function WeeklyGoalsCard({
  weekEnding,
  suggestion,
}: {
  weekEnding: string
  /** The AI's focus line, set (with a new id each tap) by "Add as next week's goal" on the reflection */
  suggestion: GoalSuggestion | null
}) {
  const [data, setData] = useState<WeeklyGoalsResponse | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState('')
  const [prefill, setPrefill] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmReplace, setConfirmReplace] = useState(false)
  const [usedSuggestion, setUsedSuggestion] = useState<number | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    try {
      setData(await goalsApi.get(weekEnding))
      setLoadError(false)
    } catch {
      setLoadError(true)
    }
  }, [weekEnding])

  useEffect(() => {
    let alive = true
    goalsApi.get(weekEnding).then(
      (d) => alive && setData(d),
      () => alive && setLoadError(true),
    )
    return () => {
      alive = false
    }
  }, [weekEnding])

  function startEditing(value: string, fromAi: string | null) {
    setText(value)
    setPrefill(fromAi)
    setError(null)
    setEditing(true)
  }

  // From the reflection's "Add as next week's goal": open the editor with the focus line
  // (adjusting state while rendering when the prop changes, rather than in an effect)
  if (suggestion && suggestion.id !== usedSuggestion && data && !data.nextProblem) {
    setUsedSuggestion(suggestion.id)
    startEditing(suggestion.text, suggestion.text)
  }

  // Focusing the field also scrolls it into view (e.g. after tapping the button on the reflection)
  useEffect(() => {
    if (editing) inputRef.current?.focus()
  }, [editing])

  async function save(replace: boolean) {
    const trimmed = text.trim()
    if (!trimmed) return setError('Write the goal first')
    setSaving(true)
    setError(null)
    try {
      const source = prefill === null ? 'typed' : trimmed === prefill.trim() ? 'ai' : 'edited'
      await goalsApi.save({ weekEnding, text: trimmed, source, replace })
      toast.success("Next week's goal saved")
      setEditing(false)
      setConfirmReplace(false)
      await load()
    } catch (err) {
      // Someone (another device) set one meanwhile: reload and ask
      if (err instanceof ApiError && err.status === 409) {
        await load()
        setConfirmReplace(true)
      } else {
        setError(err instanceof Error ? err.message : 'Could not save the goal')
      }
    } finally {
      setSaving(false)
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    if (data?.next) setConfirmReplace(true)
    else void save(false)
  }

  async function toggleDone(goal: WeeklyGoal) {
    try {
      const { goal: updated } = await goalsApi.setDone(goal.id, !goal.done)
      setData((d) => (d ? { ...d, current: updated } : d))
      if (updated.done) toast.success('Nice — goal done')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not update the goal')
    }
  }

  if (loadError) return null // the rest of the review still works; goals are a bonus here
  if (!data) return <Skeleton className="h-24 w-full rounded-2xl" />
  const { current, next, nextWeek, nextProblem } = data
  if (!current && !next && nextProblem) return null

  return (
    <Card>
      <CardContent className="space-y-4">
        {current && (
          <div className="flex items-start gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-mental-soft text-mental-foreground" aria-hidden>
              <Target className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">This week's goal</p>
              <p className={cn('font-medium break-words', current.done && 'text-muted-foreground line-through decoration-1')}>{current.text}</p>
              <p className="text-xs text-muted-foreground">{range(current)}</p>
            </div>
            <Button
              variant={current.done ? 'secondary' : 'outline'}
              size="sm"
              aria-pressed={current.done}
              onClick={() => void toggleDone(current)}
              className={cn('shrink-0', current.done && 'text-success')}
            >
              <Check aria-hidden /> {current.done ? 'Done' : 'Did it?'}
            </Button>
          </div>
        )}

        {!nextProblem && (
          <div className={cn('space-y-2', current && 'border-t pt-4')}>
            {editing ? (
              <form onSubmit={submit} className="space-y-2" noValidate>
                <Label htmlFor={`goal-${weekEnding}`} className="text-sm font-medium">
                  Next week's goal <span className="font-normal text-muted-foreground">({range(nextWeek)})</span>
                </Label>
                <Input
                  ref={inputRef}
                  id={`goal-${weekEnding}`}
                  value={text}
                  maxLength={GOAL_TEXT_MAX}
                  placeholder="One small thing to focus on"
                  onChange={(e) => setText(e.target.value)}
                  aria-describedby={`goal-hint-${weekEnding}`}
                />
                <p id={`goal-hint-${weekEnding}`} className="text-xs text-muted-foreground">
                  {prefill !== null ? 'From your reflection — change it to make it yours.' : 'Keep it small and doable.'} Only you see this.
                </p>
                {error && <FormError>{error}</FormError>}
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" loading={saving}>
                    <Flag aria-hidden /> Save goal
                  </Button>
                </div>
              </form>
            ) : next ? (
              <div className="flex items-start gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-secondary text-primary" aria-hidden>
                  <Flag className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Next week's goal</p>
                  <p className="font-medium break-words">{next.text}</p>
                  <p className="text-xs text-muted-foreground">{range(next)}</p>
                </div>
                <Button variant="ghost" size="sm" className="shrink-0 text-muted-foreground" onClick={() => startEditing(next.text, null)}>
                  <Pencil aria-hidden /> Change
                </Button>
              </div>
            ) : (
              <Button variant="outline" onClick={() => startEditing('', null)}>
                <Plus aria-hidden /> Add next week's goal
              </Button>
            )}
          </div>
        )}
      </CardContent>

      <Dialog open={confirmReplace} onOpenChange={setConfirmReplace}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Replace next week's goal?</DialogTitle>
            <DialogDescription>
              You already have a goal for {range(nextWeek)}: “{next?.text}”. There's one goal per week.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmReplace(false)}>
              Keep the current one
            </Button>
            <Button loading={saving} onClick={() => void save(true)}>
              Replace it
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
