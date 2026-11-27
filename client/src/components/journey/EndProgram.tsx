// "End this program" (any day): 1) confirm, with an optional reason and note · 2) an optional
// final check-in (skippable; then "latest" comes from your most recent entries) · 3) what next:
// view the report, start a new program or take a break. "End & start a new one" runs the same
// flow with the reason "starting a new plan" and then opens /journey/new.
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Coffee, FileText, Rocket } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { ErrorNotice } from '@/components/StatusViews'
import { CheckInForm } from '@/components/journey/CheckIn'
import { useToday } from '@/hooks/useClock'
import { api } from '@/lib/api'
import { END_REASONS, END_REASON_LABELS, programClock, type EndReason, type Program } from '@/lib/program'

type Step = 'confirm' | 'checkin' | 'done'

export function EndProgramDialog({
  program,
  open,
  onOpenChange,
  startNew = false,
  onEnded,
}: {
  program: Program
  open: boolean
  onOpenChange: (o: boolean) => void
  /** "End this program & start a new one" */
  startNew?: boolean
  onEnded: (p: Program) => void
}) {
  const navigate = useNavigate()
  const today = useToday()
  const [step, setStep] = useState<Step>('confirm')
  const [reason, setReason] = useState<EndReason | ''>(startNew ? 'starting a new plan' : '')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ended, setEnded] = useState<Program | null>(null)
  const day = programClock(program.startDate, program.lengthDays, today).dayNumber

  function close(o: boolean) {
    if (busy) return
    onOpenChange(o)
    if (!o) {
      // Tell the page once the dialog is gone, so it can show the ended state
      if (ended) onEnded(ended)
      setStep('confirm')
      setError(null)
    }
  }

  async function end() {
    setBusy(true)
    setError(null)
    try {
      const { program: p } = await api.post<{ program: Program }>(`/programs/${program.id}/end`, { reason: reason || null, note: note || null })
      setEnded(p)
      setStep('checkin')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not end the program')
    } finally {
      setBusy(false)
    }
  }

  function afterCheckIn(p: Program) {
    setEnded(p)
    if (startNew) {
      onOpenChange(false)
      navigate(`/journey/new?from=${p.id}`)
    } else setStep('done')
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        {step === 'confirm' && (
          <>
            <DialogHeader>
              <DialogTitle>{startNew ? 'End this program and start a new one?' : 'End this program?'}</DialogTitle>
              <DialogDescription>
                You've completed {day} of {program.lengthDays} days. Ending now will create your report for those {day} days
                {startNew ? ', keep it in your history, and then set up your new program.' : '.'} You can undo this for 24 hours.
              </DialogDescription>
            </DialogHeader>
            {error && <ErrorNotice>{error}</ErrorNotice>}
            <div className="space-y-1.5">
              <Label htmlFor="end-reason">Reason (optional)</Label>
              <Select value={reason} onValueChange={(v) => setReason(v as EndReason)}>
                <SelectTrigger id="end-reason" className="w-full">
                  <SelectValue placeholder="Choose…" />
                </SelectTrigger>
                <SelectContent>
                  {END_REASONS.map((r) => (
                    <SelectItem key={r} value={r}>
                      {END_REASON_LABELS[r]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="end-note">A note for yourself (optional)</Label>
              <Textarea id="end-note" rows={3} maxLength={4000} value={note} onChange={(e) => setNote(e.target.value)} />
              <p className="text-xs text-muted-foreground">Private and encrypted. Never sent to the AI.</p>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => close(false)} disabled={busy}>
                Keep going
              </Button>
              <Button type="button" loading={busy} disabled={busy} onClick={() => void end()}>
                End on day {day}
              </Button>
            </DialogFooter>
          </>
        )}

        {step === 'checkin' && ended && (
          <>
            <DialogHeader>
              <DialogTitle>A last check-in?</DialogTitle>
              <DialogDescription>Optional. If you skip it, your report uses your most recent entries.</DialogDescription>
            </DialogHeader>
            <CheckInForm program={ended} kind="final" onDone={afterCheckIn} skipLabel="Skip" />
          </>
        )}

        {step === 'done' && ended && (
          <>
            <DialogHeader>
              <DialogTitle>Program ended on day {ended.endedOnDay}</DialogTitle>
              <DialogDescription>Every day you showed up counts. Your report is ready.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-2">
              <Button
                type="button"
                onClick={() => {
                  close(false)
                  navigate(`/journey/${ended.id}/report`)
                }}
              >
                <FileText aria-hidden /> View your report
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  close(false)
                  navigate(`/journey/new?from=${ended.id}`)
                }}
              >
                <Rocket aria-hidden /> Start a new program
              </Button>
              <Button type="button" variant="ghost" onClick={() => close(false)}>
                <Coffee aria-hidden /> Take a break
              </Button>
              <p className="text-center text-xs text-muted-foreground">On a break, daily tracking works as usual.</p>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
