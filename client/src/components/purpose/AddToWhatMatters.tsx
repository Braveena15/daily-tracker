// "Add to what matters today" for a piece of text (a weekly goal, a small step): adds it as one of
// today's items with intensity 5. Shows "In what matters today" once it's there.
import { useState } from 'react'
import { Check, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { DEFAULT_INTENSITY, MAX_PURPOSES, sameText, type DayPurpose } from '@/lib/purpose'
import { cn } from '@/lib/utils'

export function AddToWhatMatters({
  text,
  purposes,
  onAdd,
  className,
}: {
  text: string
  purposes: DayPurpose[]
  onAdd: (body: { text: string; intensity: number }) => Promise<unknown>
  className?: string
}) {
  const [busy, setBusy] = useState(false)

  if (purposes.some((p) => sameText(p.text, text))) {
    return (
      <span className={cn('flex items-center gap-1 text-xs text-muted-foreground', className)}>
        <Check className="size-4 text-success" aria-hidden /> In what matters today
      </span>
    )
  }
  // Today already has the most it can hold
  if (purposes.length >= MAX_PURPOSES) return null

  async function add() {
    setBusy(true)
    try {
      await onAdd({ text: text.trim().slice(0, 500), intensity: DEFAULT_INTENSITY })
      toast.success('Added to what matters today')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not add it')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Button variant="ghost" size="sm" className={cn('text-mental-foreground', className)} loading={busy} onClick={() => void add()}>
      <Plus aria-hidden /> Add to what matters today
    </Button>
  )
}
