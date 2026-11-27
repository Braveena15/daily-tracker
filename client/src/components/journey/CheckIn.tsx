// The midpoint and final check-ins: weight, measurements, ratings, a reflection and photos — the
// same as "Where I am now", so they can be compared. Every check-in can be skipped.
import { useState } from 'react'
import { ChevronDown, SkipForward } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { InputWithUnit } from '@/components/InputWithUnit'
import { ErrorNotice } from '@/components/StatusViews'
import { Field, MeasurementsEditor, PhotoPicker, RatingsEditor, type PickedPhoto } from '@/components/journey/ProgramFields'
import { api } from '@/lib/api'
import { EMPTY_MEASUREMENTS, MEASUREMENTS, numOrNull, uploadProgramPhoto, type MeasurementsForm, type Program, type Ratings } from '@/lib/program'

export type CheckInKind = 'midpoint' | 'final'

/** The form itself, for the dialog below and the End-early flow. Calls onDone with the saved program. */
export function CheckInForm({ program, kind, onDone, skipLabel = 'Skip this check-in' }: { program: Program; kind: CheckInKind; onDone: (p: Program) => void; skipLabel?: string }) {
  const baseline = program.baseline
  // Start from the baseline's custom rating names, so they can be compared
  const [ratings, setRatings] = useState<Ratings>({ custom: (baseline?.ratings.custom ?? []).map((c) => ({ label: c.label, value: null })) })
  const [weight, setWeight] = useState('')
  const [measurements, setMeasurements] = useState<MeasurementsForm>(EMPTY_MEASUREMENTS)
  const [text, setText] = useState('')
  const [photos, setPhotos] = useState<PickedPhoto[]>([])
  const [busy, setBusy] = useState<'save' | 'skip' | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function save(skip: boolean) {
    setError(null)
    const nums = [weight, ...Object.values(measurements)]
    if (!skip && nums.some((v) => v.trim() !== '' && !Number.isFinite(numOrNull(v)))) return setError('Please enter numbers only')
    setBusy(skip ? 'skip' : 'save')
    try {
      const body = skip
        ? { skipped: true }
        : {
            weightKg: numOrNull(weight),
            ...Object.fromEntries(MEASUREMENTS.map((m) => [m.key, numOrNull(measurements[m.key])])),
            ratings,
            habits: [],
            text: text || null,
          }
      let { program: saved } = await api.put<{ program: Program }>(`/programs/${program.id}/check-ins/${kind}`, body)
      let failed = 0
      if (!skip) {
        for (const p of photos) {
          try {
            saved = await uploadProgramPhoto(program.id, kind, p.blob, p.filename)
          } catch {
            failed++
          }
        }
      }
      if (failed) toast.error(`${failed} photo${failed === 1 ? '' : 's'} couldn't be uploaded`)
      toast.success(skip ? 'Skipped — no problem' : 'Check-in saved')
      onDone(saved)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the check-in')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-5">
      {error && <ErrorNotice>{error}</ErrorNotice>}
      <Field label="Weight" htmlFor={`${kind}-weight`} hint={baseline?.weightKg ? `You started at ${baseline.weightKg} kg` : undefined} className="max-w-xs">
        <InputWithUnit id={`${kind}-weight`} unit="kg" type="number" inputMode="decimal" step="0.1" value={weight} onChange={(e) => setWeight(e.target.value)} />
      </Field>
      <details className="group rounded-xl border">
        <summary className="flex cursor-pointer list-none items-center justify-between p-3 text-sm font-medium [&::-webkit-details-marker]:hidden">
          Measurements (optional)
          <ChevronDown className="size-4 text-muted-foreground transition-transform group-open:rotate-180 motion-reduce:transition-none" aria-hidden />
        </summary>
        <div className="px-3 pb-3">
          <MeasurementsEditor idPrefix={kind} value={measurements} onChange={setMeasurements} />
        </div>
      </details>
      <div className="space-y-2">
        <p className="text-sm font-medium">How I rate myself now</p>
        <RatingsEditor value={ratings} onChange={setRatings} allowCustom={false} compareTo={baseline?.ratings} />
      </div>
      <Field label={kind === 'final' ? 'My final reflection' : 'How it’s going'} htmlFor={`${kind}-text`} hint="Private and encrypted. Never sent to the AI.">
        <Textarea id={`${kind}-text`} rows={3} maxLength={4000} value={text} onChange={(e) => setText(e.target.value)} />
      </Field>
      <Field label="Progress photos">
        <PhotoPicker photos={photos} onChange={setPhotos} />
      </Field>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
        <Button type="button" variant="ghost" loading={busy === 'skip'} disabled={busy !== null} onClick={() => void save(true)}>
          <SkipForward aria-hidden /> {skipLabel}
        </Button>
        <Button type="button" loading={busy === 'save'} disabled={busy !== null} onClick={() => void save(false)}>
          Save check-in
        </Button>
      </div>
    </div>
  )
}

export function CheckInDialog({ program, kind, open, onOpenChange, onDone }: { program: Program; kind: CheckInKind; open: boolean; onOpenChange: (o: boolean) => void; onDone: (p: Program) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{kind === 'midpoint' ? 'Halfway check-in' : 'Final check-in'}</DialogTitle>
          <DialogDescription>
            {kind === 'midpoint' ? `You're halfway through ${program.name}. How are things now?` : 'You made it to the end. Where are you now?'} Everything is optional.
          </DialogDescription>
        </DialogHeader>
        <CheckInForm
          program={program}
          kind={kind}
          onDone={(p) => {
            onOpenChange(false)
            onDone(p)
          }}
        />
      </DialogContent>
    </Dialog>
  )
}
