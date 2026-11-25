// "Add as today's intention" for a piece of text (a weekly goal, a small step): with one purpose
// today it's added straight away; with several, you pick which purpose it belongs to.
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, Plus, Target, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { MAX_INTENTIONS, sameText, type DayPurpose } from '@/lib/purpose'
import { cn } from '@/lib/utils'

export function AddToPurposePicker({
  text,
  purposes,
  onAdd,
  label = "Add as today's intention",
  className,
}: {
  text: string
  purposes: DayPurpose[]
  onAdd: (purposeId: string, text: string) => Promise<unknown>
  label?: string
  className?: string
}) {
  const [picking, setPicking] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)

  const addedTo = purposes.find((p) => p.intentions.some((i) => sameText(i.text, text)))
  if (addedTo) {
    return (
      <span className={cn('flex items-center gap-1 text-xs text-muted-foreground', className)}>
        <Check className="size-4 text-success" aria-hidden /> In today's intentions
      </span>
    )
  }
  if (purposes.length === 0) {
    return (
      <Link to="/today#purpose" className={cn('text-xs font-medium text-primary underline-offset-4 hover:underline', className)}>
        Set today's purpose first
      </Link>
    )
  }
  const open = purposes.filter((p) => p.intentions.length < MAX_INTENTIONS)
  if (open.length === 0) return null

  async function add(purposeId: string) {
    setBusy(purposeId)
    try {
      await onAdd(purposeId, text.slice(0, 200))
      toast.success("Added to today's intentions")
      setPicking(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not add the intention')
    } finally {
      setBusy(null)
    }
  }

  if (purposes.length === 1) {
    return (
      <Button variant="ghost" size="sm" className={cn('text-mental-foreground', className)} loading={busy !== null} onClick={() => void add(purposes[0]!.id)}>
        <Plus aria-hidden /> {label}
      </Button>
    )
  }

  if (!picking) {
    return (
      <Button variant="ghost" size="sm" className={cn('text-mental-foreground', className)} aria-expanded={false} onClick={() => setPicking(true)}>
        <Plus aria-hidden /> {label}
      </Button>
    )
  }

  return (
    <div className={cn('w-full space-y-1.5', className)} role="group" aria-label="Add to which purpose?">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground">Add to which purpose?</p>
        <Button variant="ghost" size="icon" className="size-7 text-muted-foreground" aria-label="Cancel" onClick={() => setPicking(false)}>
          <X />
        </Button>
      </div>
      <ul className="space-y-1">
        {purposes.map((p) => {
          const full = p.intentions.length >= MAX_INTENTIONS
          return (
            <li key={p.id}>
              <Button
                variant="outline"
                size="sm"
                className="h-auto w-full justify-start bg-card py-1.5 text-left font-normal whitespace-normal"
                disabled={full || busy !== null}
                loading={busy === p.id}
                onClick={() => void add(p.id)}
              >
                <Target className="text-mental" aria-hidden />
                <span className="min-w-0 flex-1 truncate font-serif">{p.text || 'Intentions for the day'}</span>
                {full && <span className="shrink-0 text-xs text-muted-foreground">full</span>}
              </Button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
