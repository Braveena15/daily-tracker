// Danger zone → "Delete everything and start fresh": lists what will go, needs "DELETE" typed in,
// then opens /journey/new. The account, profile and settings stay.
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Loader2, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ErrorNotice } from '@/components/StatusViews'
import { api } from '@/lib/api'

type Counts = Record<'days' | 'mealDays' | 'expenses' | 'receiptFiles' | 'diaryEntries' | 'thoughtLogs' | 'purposes' | 'programs' | 'photoFiles' | 'aiMessages' | 'weeklyGoals', number>

const LABELS: [keyof Counts, string][] = [
  ['days', 'Days of entries'],
  ['mealDays', 'Days of meals'],
  ['expenses', 'Expenses'],
  ['receiptFiles', 'Receipt files'],
  ['diaryEntries', 'Diary entries'],
  ['thoughtLogs', 'Thought logs'],
  ['purposes', 'Purpose & values'],
  ['programs', 'Journeys (programs)'],
  ['photoFiles', 'Progress photos'],
  ['aiMessages', 'AI messages'],
  ['weeklyGoals', 'Weekly goals'],
]

export function DeleteEverything() {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [data, setData] = useState<{ counts: Counts; total: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [typed, setTyped] = useState('')
  const [deleting, setDeleting] = useState(false)

  async function openDialog() {
    setOpen(true)
    setData(null)
    setError(null)
    setTyped('')
    try {
      setData(await api.get<{ counts: Counts; total: number }>('/account/data'))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not count your data')
    }
  }

  async function confirm() {
    setDeleting(true)
    setError(null)
    try {
      await api.delete('/account/data', { confirm: 'DELETE' })
      toast.success('Everything is deleted. A fresh start.')
      setOpen(false)
      navigate('/journey/new', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete')
      setDeleting(false)
    }
  }

  return (
    <>
      <Button type="button" variant="destructive" onClick={() => void openDialog()}>
        <Trash2 aria-hidden /> Delete everything and start fresh
      </Button>
      <Dialog open={open} onOpenChange={(o) => !deleting && setOpen(o)}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Delete everything?</DialogTitle>
            <DialogDescription>
              This permanently deletes all your data. It can't be undone. Your account, profile and settings stay. Consider "Export my data" first.
            </DialogDescription>
          </DialogHeader>
          {error && <ErrorNotice>{error}</ErrorNotice>}
          {!data && !error && <Loader2 className="mx-auto animate-spin text-muted-foreground" aria-label="Loading" />}
          {data && (
            <>
              <ul className="space-y-1 text-sm">
                {LABELS.filter(([k]) => data.counts[k] > 0).map(([k, label]) => (
                  <li key={k} className="flex justify-between gap-4 rounded-lg bg-muted/60 px-3 py-1.5">
                    <span>{label}</span>
                    <span className="font-medium tabular-nums">{data.counts[k]}</span>
                  </li>
                ))}
                {data.total === 0 && <li className="text-muted-foreground">There's no data to delete.</li>}
              </ul>
              <div className="space-y-2">
                <Label htmlFor="confirm-delete-all">
                  Type <span className="font-mono font-semibold">DELETE</span> to confirm
                </Label>
                <Input id="confirm-delete-all" autoComplete="off" value={typed} onChange={(e) => setTyped(e.target.value)} />
              </div>
            </>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={deleting}>
              Cancel
            </Button>
            {data && (
              <Button type="button" variant="destructive" loading={deleting} disabled={typed !== 'DELETE' || deleting} onClick={() => void confirm()}>
                <Trash2 aria-hidden /> Delete everything
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
