// Missed-day reasons on the Today page: "You didn't log yesterday — want to note why?" (dismissible),
// "I couldn't log today" from the day's menu, and the short line a noted day shows.
// Only today and yesterday can get a reason, and it never counts as logging the day.
import { useState, type FormEvent } from 'react'
import { CalendarX2, Check, MoreHorizontal, X } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useFetch } from '@/hooks/useFetch'
import { api } from '@/lib/api'
import { addDays } from '@/lib/dates'
import type { DayResponse } from '@/lib/entries'
import { MISSED_CATEGORIES, dismissedKey, missedLabel, notLoggedText, type MissedCategory, type MissedReason } from '@/lib/missed'
import { toneChipOn } from '@/lib/tones'
import { cn } from '@/lib/utils'

type SaveReason = (body: { category: MissedCategory; note: string | null }) => Promise<unknown>

/** Category chips, an optional note and Save. */
export function MissedReasonForm({ initial, onSave, onCancel }: { initial?: MissedReason | null; onSave: SaveReason; onCancel?: () => void }) {
  const [category, setCategory] = useState<MissedCategory | null>(initial?.category ?? null)
  const [note, setNote] = useState(initial?.note ?? '')
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!category) return
    setBusy(true)
    try {
      await onSave({ category, note: note.trim() || null })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="space-y-3" onSubmit={submit} noValidate>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Why">
        {MISSED_CATEGORIES.map((c) => (
          <Badge key={c} asChild variant="outline" className={cn('h-9 rounded-full px-3.5 text-sm', category === c && toneChipOn.primary)}>
            <button type="button" role="radio" aria-checked={category === c} onClick={() => setCategory(c)}>
              {missedLabel(c)}
            </button>
          </Badge>
        ))}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="missed-note" className="text-muted-foreground">
          A note (optional, just for you)
        </Label>
        <Textarea id="missed-note" rows={2} maxLength={300} placeholder="e.g. Long day at work" value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      <div className="flex justify-end gap-2">
        {onCancel && (
          <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
        )}
        <Button type="submit" size="sm" loading={busy} disabled={busy || !category}>
          <Check aria-hidden /> Save
        </Button>
      </div>
    </form>
  )
}

/**
 * "You didn't log yesterday — want to note why?": only when yesterday is in the journey, has
 * nothing logged and no reason yet, and the card wasn't closed for that date on this device.
 */
export function MissedYesterdayCard({ today }: { today: string }) {
  const yesterday = addDays(today, -1)
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(dismissedKey(yesterday)) === '1')
  if (dismissed) return null
  return (
    <MissedYesterday
      yesterday={yesterday}
      onDismiss={() => {
        localStorage.setItem(dismissedKey(yesterday), '1')
        setDismissed(true)
      }}
    />
  )
}

function MissedYesterday({ yesterday, onDismiss }: { yesterday: string; onDismiss: () => void }) {
  const [saved, setSaved] = useState(false)
  const { data: day } = useFetch<DayResponse>(`/entries/${yesterday}`)
  const { data: streak } = useFetch<{ journeyStartDate: string }>('/entries/stats/streak')

  if (saved) {
    return (
      <p className="flex items-center gap-1.5 px-1 text-sm text-muted-foreground" role="status">
        <Check className="size-4 text-success" aria-hidden /> Noted for yesterday. Thank you.
      </p>
    )
  }
  if (!day || !streak || yesterday < streak.journeyStartDate || day.logged || day.entry?.missedReason) return null

  return (
    <Card size="sm" className="bg-muted/40">
      <CardContent className="space-y-3">
        <div className="flex items-start gap-2">
          <CalendarX2 className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
          <p className="min-w-0 flex-1 text-sm">You didn't log yesterday — want to note why?</p>
          <Button type="button" variant="ghost" size="icon" className="-my-1 size-7 text-muted-foreground" aria-label="Close" onClick={onDismiss}>
            <X />
          </Button>
        </div>
        <MissedReasonForm
          onSave={async (body) => {
            await api.put(`/entries/${yesterday}/missed-reason`, body)
            setSaved(true)
          }}
        />
      </CardContent>
    </Card>
  )
}

/** The day's "⋯" menu with "I couldn't log today", and the line a noted day shows. */
export function MissedTodayControls({
  day,
  onSave,
  onClear,
}: {
  day: DayResponse
  onSave: SaveReason
  onClear: () => Promise<unknown>
}) {
  const [open, setOpen] = useState(false)
  const reason = day.entry?.missedReason ?? null

  return (
    <div className="flex items-center justify-end gap-2">
      {reason && !day.logged && (
        <p className="mr-auto flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground">
          <CalendarX2 className="size-4 shrink-0" aria-hidden />
          <span className="truncate">{notLoggedText(reason)}</span>
        </p>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="ghost" size="icon" aria-label="More for today">
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setOpen(true)}>{reason ? 'Change why I couldn’t log today' : 'I couldn’t log today'}</DropdownMenuItem>
          {reason && (
            <DropdownMenuItem onSelect={() => void onClear().then(() => toast.success('Removed'), (err: unknown) => toast.error(err instanceof Error ? err.message : 'Could not remove it'))}>
              Remove the note
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>I couldn’t log today</DialogTitle>
            <DialogDescription>Totally fine. Noting why can help you spot patterns later. It doesn’t count as a logged day.</DialogDescription>
          </DialogHeader>
          <MissedReasonForm
            initial={reason}
            onCancel={() => setOpen(false)}
            onSave={async (body) => {
              await onSave(body)
              setOpen(false)
              toast.success('Noted')
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  )
}
