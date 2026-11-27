// Settings → Data → Danger zone: permanently delete the user's own data dated before their journey start.
// The dialog lists what will go and needs "DELETE" typed in, because it can't be undone.
import { useState } from 'react'
import { AlertTriangle, Loader2, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ErrorNotice } from '@/components/StatusViews'
import { api } from '@/lib/api'
import { journeyDate } from '@/lib/journey'
import { DeleteEverything } from '@/components/settings/DeleteEverything'

type Counts = { days: number; mealDays: number; diaryEntries: number; thoughtLogs: number; aiMessages: number; weeklyGoals: number }
type CountsResponse = { journeyStartDate: string; counts: Counts; total: number }

const LABELS: [keyof Counts, string, string][] = [
  ['days', 'day', 'days of entries'],
  ['mealDays', 'day', 'days of meals'],
  ['diaryEntries', 'diary entry', 'diary entries'],
  ['thoughtLogs', 'thought log', 'thought logs'],
  ['aiMessages', 'AI message', 'AI messages'],
  ['weeklyGoals', 'weekly goal', 'weekly goals'],
]

export function DataCleanup() {
  const [open, setOpen] = useState(false)
  const [data, setData] = useState<CountsResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [typed, setTyped] = useState('')
  const [deleting, setDeleting] = useState(false)

  async function openDialog() {
    setOpen(true)
    setData(null)
    setError(null)
    setTyped('')
    try {
      setData(await api.get<CountsResponse>('/profile/data-before-start'))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not count your data')
    }
  }

  async function confirmDelete() {
    setDeleting(true)
    setError(null)
    try {
      const result = await api.delete<{ total: number }>('/profile/data-before-start', { confirm: 'DELETE' })
      toast.success(`Deleted ${result.total} ${result.total === 1 ? 'item' : 'items'} from before your journey`)
      setOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <Card className="ring-2 ring-destructive/60">
      <CardHeader>
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-destructive/10 text-destructive">
            <AlertTriangle className="size-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <CardTitle className="text-lg font-semibold text-destructive">Danger zone</CardTitle>
            <CardDescription>Days before your journey start are hidden, not deleted. Deleting them can't be undone.</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" className="text-destructive hover:text-destructive" onClick={openDialog}>
          <Trash2 aria-hidden /> Delete data before my journey start
        </Button>
        <DeleteEverything />
      </CardContent>

      <Dialog open={open} onOpenChange={(o) => !deleting && setOpen(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete data before your journey?</DialogTitle>
            <DialogDescription>
              {data
                ? `This permanently deletes everything dated before ${journeyDate(data.journeyStartDate)}. It can't be undone. Nothing from that day on is touched.`
                : 'Counting your data…'}
            </DialogDescription>
          </DialogHeader>

          {error && <ErrorNotice>{error}</ErrorNotice>}
          {!data && !error && <Loader2 className="mx-auto animate-spin text-muted-foreground" aria-label="Loading" />}
          {data && data.total === 0 && <p className="text-sm text-muted-foreground">There's nothing dated before your journey start.</p>}
          {data && data.total > 0 && (
            <>
              <ul className="space-y-1 text-sm">
                {LABELS.filter(([key]) => data.counts[key] > 0).map(([key, one, many]) => (
                  <li key={key} className="flex justify-between gap-4 rounded-lg bg-muted/60 px-3 py-1.5">
                    <span>{data.counts[key] === 1 ? one : many}</span>
                    <span className="font-medium tabular-nums">{data.counts[key]}</span>
                  </li>
                ))}
              </ul>
              <div className="space-y-2">
                <Label htmlFor="confirm-delete">
                  Type <span className="font-mono font-semibold">DELETE</span> to confirm
                </Label>
                <Input id="confirm-delete" autoComplete="off" value={typed} onChange={(e) => setTyped(e.target.value)} />
              </div>
            </>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={deleting}>
              Cancel
            </Button>
            {data && data.total > 0 && (
              <Button loading={deleting} type="button" variant="destructive" disabled={typed !== 'DELETE' || deleting} onClick={confirmDelete}>
                <Trash2 aria-hidden />
                Delete {data.total} {data.total === 1 ? 'item' : 'items'}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
