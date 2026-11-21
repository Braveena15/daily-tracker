// The Purpose page. A saved purpose opens in VIEW mode ("My purpose"); "Edit" switches to the form.
// With nothing saved yet it opens straight in EDIT mode. Leaving with unsaved edits asks first.
import { useEffect, useState, type FormEvent } from 'react'
import { useBlocker } from 'react-router-dom'
import { Check, Compass, Loader2, Pencil, Plus, Save, X } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { IconBubble } from '@/components/IconBubble'
import { PageHeader } from '@/components/PageHeader'
import { ErrorNotice } from '@/components/StatusViews'
import { DailyPurposes, PurposeEvolution } from '@/components/purpose/PurposeJourney'
import { PurposeCard } from '@/components/day/PurposeCard'
import { useDay } from '@/hooks/useDay'
import { useToday } from '@/hooks/useClock'
import { savedAtLabel } from '@/lib/purpose'
import { api } from '@/lib/api'
import { VALUE_SUGGESTIONS, type Purpose as PurposeData } from '@/lib/mind'
import { cn } from '@/lib/utils'

type Draft = Pick<PurposeData, 'purposeStatement' | 'coreValues' | 'longTermGoals'>

const toDraft = (p: PurposeData): Draft => ({
  purposeStatement: p.purposeStatement,
  coreValues: [...p.coreValues],
  longTermGoals: p.longTermGoals.map((g) => ({ ...g })),
})

/** What a save would send: trimmed, with empty goal rows left out. */
const toBody = (d: Draft): Draft => ({
  purposeStatement: d.purposeStatement.trim(),
  coreValues: d.coreValues,
  longTermGoals: d.longTermGoals.filter((g) => g.title.trim()).map((g) => ({ title: g.title.trim(), why: g.why.trim() })),
})

const isEmpty = (p: Draft) => !p.purposeStatement.trim() && p.coreValues.length === 0 && p.longTermGoals.length === 0
const same = (a: Draft, b: Draft) => JSON.stringify(toBody(a)) === JSON.stringify(toBody(b))

export function Purpose() {
  const [saved, setSaved] = useState<PurposeData | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [editing, setEditing] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  // Bumped after each save, so "How my purpose evolved" reloads with the new current version
  const [saves, setSaves] = useState(0)
  // Bumped when today's purpose is saved here, so "Daily purposes" reloads
  const [daySaves, setDaySaves] = useState(0)
  // At midnight today's card and the list move on to the new day
  const today = useToday()

  useEffect(() => {
    api
      .get<{ purpose: PurposeData }>('/purpose')
      .then((data) => {
        setSaved(data.purpose)
        setDraft(toDraft(data.purpose))
        // Nothing saved yet: start writing straight away
        setEditing(isEmpty(data.purpose))
      })
      .catch((err: unknown) => setLoadError(err instanceof Error ? err.message : 'Could not load your purpose'))
  }, [])

  const dirty = editing && saved !== null && draft !== null && !same(draft, saved)

  // Warn before closing or reloading the tab, and before leaving the page inside the app
  useEffect(() => {
    if (!dirty) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [dirty])
  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && currentLocation.pathname !== nextLocation.pathname)

  async function save() {
    if (!draft) return
    setSaving(true)
    setError(null)
    try {
      const data = await api.put<{ purpose: PurposeData }>('/purpose', toBody(draft))
      setSaved(data.purpose)
      setDraft(toDraft(data.purpose))
      setEditing(isEmpty(data.purpose))
      setSaves((n) => n + 1)
      toast.success('Purpose saved ✓')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save')
    } finally {
      setSaving(false)
    }
  }

  function cancel() {
    if (!saved) return
    setDraft(toDraft(saved))
    setError(null)
    setEditing(false)
  }

  if (loadError) return <ErrorNotice>{loadError}</ErrorNotice>

  const hasSaved = saved !== null && !isEmpty(saved)

  return (
    <>
      <PageHeader title="My purpose" description="What matters to you, in your own words. You can change it any time." />

      {!saved || !draft ? (
        <div className="space-y-4" aria-busy="true">
          <Skeleton className="h-40 rounded-2xl" />
          <Skeleton className="h-56 rounded-2xl" />
        </div>
      ) : (
        <div className="max-w-3xl space-y-4 md:space-y-6">
          {editing ? (
            <>
              {!hasSaved && (
                <Card className="bg-secondary/60 ring-primary/15">
                  <CardContent className="flex items-start gap-3">
                    <IconBubble icon={Compass} className="bg-card" />
                    <div>
                      <p className="font-heading text-lg font-semibold">Welcome to your purpose</p>
                      <p className="text-sm text-muted-foreground">
                        Write a sentence about why you get up in the morning, pick the values that feel like you, and add a goal or two. You can
                        change it any time, and earlier versions are kept.
                      </p>
                    </div>
                  </CardContent>
                </Card>
              )}
              <PurposeForm draft={draft} onChange={(d) => (setDraft(d), setError(null))} />
              {error && <ErrorNotice>{error}</ErrorNotice>}
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                {hasSaved && (
                  <Button variant="outline" size="lg" onClick={cancel} disabled={saving}>
                    Cancel
                  </Button>
                )}
                <Button size="lg" onClick={() => void save()} disabled={saving || (hasSaved && !dirty)}>
                  {saving ? <Loader2 className="animate-spin" aria-hidden /> : <Save aria-hidden />}
                  {saving ? 'Saving…' : 'Save'}
                </Button>
              </div>
            </>
          ) : (
            <PurposeView purpose={saved} onEdit={() => setEditing(true)} />
          )}

          {/* Today's purpose can be set right here too (it's the same as the card on the Today page).
              key: picks up new core values and statement after the purpose above is saved */}
          <TodayPurposeEditor key={`${saves}-${today}`} today={today} onSaved={() => setDaySaves((n) => n + 1)} />
          <DailyPurposes key={`${daySaves}-${today}`} onSetToday={scrollToToday} todayCardAbove />
          <PurposeEvolution key={saves} />
        </div>
      )}

      <Dialog open={blocker.state === 'blocked'} onOpenChange={(open) => !open && blocker.reset?.()}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Leave without saving?</DialogTitle>
            <DialogDescription>You have unsaved changes to your purpose. If you leave now they'll be lost.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => blocker.reset?.()}>
              Keep editing
            </Button>
            <Button type="button" variant="destructive" onClick={() => blocker.proceed?.()}>
              Leave without saving
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

function scrollToToday() {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  document.getElementById('today-purpose')?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })
}

/** Today's purpose, editable on this page. Every save also refreshes the Daily purposes list. */
function TodayPurposeEditor({ today, onSaved }: { today: string; onSaved: () => void }) {
  const { day, error, savePurpose, addIntention, updateIntention, removeIntention, saveReflection } = useDay(today)
  const after =
    <A extends unknown[], R>(action: (...args: A) => Promise<R>) =>
    async (...args: A) => {
      const result = await action(...args)
      onSaved()
      return result
    }
  const actions = {
    savePurpose: after(savePurpose),
    addIntention: after(addIntention),
    updateIntention: after(updateIntention),
    removeIntention: after(removeIntention),
    saveReflection: after(saveReflection),
  }

  return (
    <div id="today-purpose" className="scroll-mt-4">
      {error ? (
        <ErrorNotice>{error}</ErrorNotice>
      ) : !day ? (
        <Skeleton className="h-32 w-full rounded-2xl" />
      ) : (
        <PurposeCard key={day.entry?.dailyPurpose?.setAt ?? 'none'} purpose={day.entry?.dailyPurpose ?? null} isToday actions={actions} />
      )}
    </div>
  )
}

/** "My purpose": the saved statement, values and goals. */
function PurposeView({ purpose, onEdit }: { purpose: PurposeData; onEdit: () => void }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div className="min-w-0">
          <CardTitle className="text-lg font-semibold">My purpose</CardTitle>
          {purpose.updatedAt && <CardDescription>Last updated: {savedAtLabel(purpose.updatedAt)}</CardDescription>}
        </div>
        <Button variant="outline" onClick={onEdit}>
          <Pencil aria-hidden /> Edit
        </Button>
      </CardHeader>
      <CardContent className="space-y-6">
        {purpose.purposeStatement ? (
          <p className="font-serif text-2xl leading-snug text-balance md:text-3xl">{purpose.purposeStatement}</p>
        ) : (
          <p className="text-sm text-muted-foreground">No purpose statement yet. Tap Edit to write one.</p>
        )}

        {purpose.coreValues.length > 0 && (
          <section aria-label="Core values" className="space-y-2">
            <h3 className="text-sm font-semibold text-muted-foreground">Core values</h3>
            <div className="flex flex-wrap gap-2">
              {purpose.coreValues.map((v) => (
                <Badge key={v} variant="secondary" className="h-8 rounded-full bg-mental-soft px-3 text-sm text-mental-foreground">
                  {v}
                </Badge>
              ))}
            </div>
          </section>
        )}

        {purpose.longTermGoals.length > 0 && (
          <section aria-label="Long-term goals" className="space-y-2">
            <h3 className="text-sm font-semibold text-muted-foreground">Long-term goals</h3>
            <ul className="grid gap-3 sm:grid-cols-2">
              {purpose.longTermGoals.map((g, i) => (
                <li key={`${g.title}-${i}`} className="rounded-xl bg-muted/60 p-4">
                  <p className="font-medium">{g.title}</p>
                  {g.why && (
                    <p className="mt-1 text-sm text-muted-foreground">
                      <span className="font-medium text-foreground/80">Why it matters: </span>
                      {g.why}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}
      </CardContent>
    </Card>
  )
}

/** The edit form: statement, core values (suggestions + your own) and long-term goals. */
function PurposeForm({ draft, onChange }: { draft: Draft; onChange: (draft: Draft) => void }) {
  const [customValue, setCustomValue] = useState('')
  const update = (changes: Partial<Draft>) => onChange({ ...draft, ...changes })
  const has = (value: string) => draft.coreValues.some((v) => v.toLowerCase() === value.toLowerCase())
  const values = [...new Set([...VALUE_SUGGESTIONS, ...draft.coreValues])]

  function toggleValue(value: string) {
    update({ coreValues: has(value) ? draft.coreValues.filter((v) => v.toLowerCase() !== value.toLowerCase()) : [...draft.coreValues, value] })
  }

  function addCustomValue(e: FormEvent) {
    e.preventDefault()
    const value = customValue.trim()
    if (value && !has(value)) update({ coreValues: [...draft.coreValues, value] })
    setCustomValue('')
  }

  const setGoal = (i: number, changes: Partial<Draft['longTermGoals'][number]>) =>
    update({ longTermGoals: draft.longTermGoals.map((g, j) => (j === i ? { ...g, ...changes } : g)) })

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Purpose statement</CardTitle>
          <CardDescription>Why do you get up in the morning? A sentence or two is plenty.</CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            aria-label="Purpose statement"
            maxLength={1000}
            placeholder="e.g. To be healthy and present for my family, and to keep learning."
            className="min-h-28 font-serif text-lg leading-relaxed md:text-lg"
            value={draft.purposeStatement}
            onChange={(e) => update({ purposeStatement: e.target.value })}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Core values</CardTitle>
          <CardDescription>Tap the ones that feel like you, or add your own.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Core values">
            {values.map((value) => {
              const on = has(value)
              return (
                <button
                  key={value}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleValue(value)}
                  className={cn(
                    'inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-sm transition-all outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-95',
                    on && 'border-mental/50 bg-mental-soft text-mental-foreground hover:bg-mental-soft',
                  )}
                >
                  {on ? <Check className="size-3.5" aria-hidden /> : <Plus className="size-3.5" aria-hidden />}
                  {value}
                </button>
              )
            })}
          </div>
          <form className="flex gap-2" onSubmit={addCustomValue}>
            <Input aria-label="Add your own value" placeholder="Add your own…" maxLength={40} value={customValue} onChange={(e) => setCustomValue(e.target.value)} />
            <Button type="submit" variant="secondary" disabled={!customValue.trim()}>
              Add
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Long-term goals</CardTitle>
          <CardDescription>Where you'd like to be, and why it matters to you.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {draft.longTermGoals.map((goal, i) => (
            <div key={i} className="grid gap-2 rounded-xl bg-muted/60 p-3">
              <div className="flex items-end gap-2">
                <div className="flex-1 space-y-1.5">
                  <Label htmlFor={`goal-${i}`}>Goal</Label>
                  <Input id={`goal-${i}`} maxLength={150} placeholder="e.g. Run a 10k" value={goal.title} onChange={(e) => setGoal(i, { title: e.target.value })} />
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove goal ${goal.title || i + 1}`}
                  onClick={() => update({ longTermGoals: draft.longTermGoals.filter((_, j) => j !== i) })}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <X />
                </Button>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`why-${i}`}>Why it matters</Label>
                <Textarea id={`why-${i}`} maxLength={500} className="min-h-16" value={goal.why} onChange={(e) => setGoal(i, { why: e.target.value })} />
              </div>
            </div>
          ))}
          {draft.longTermGoals.length < 10 && (
            <Button
              variant="outline"
              className="w-full border-dashed sm:w-auto"
              onClick={() => update({ longTermGoals: [...draft.longTermGoals, { title: '', why: '' }] })}
            >
              <Plus aria-hidden /> Add a goal
            </Button>
          )}
        </CardContent>
      </Card>
    </>
  )
}
