import { useEffect, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Check, Leaf, Lock, Plus, Save, Sun, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { ErrorNotice, FormError } from '@/components/StatusViews'
import { AiMessageCard } from '@/components/ai/AiMessageCard'
import { SupportButton, SupportDialog } from '@/components/mind/Support'
import { AiFriend } from '@/components/mind/AiFriend'
import { aiRequests } from '@/lib/ai'
import { api } from '@/lib/api'
import {
  DISTORTIONS,
  FEELING_SUGGESTIONS,
  strongestFeeling,
  type Distortion,
  type Feeling,
  type ThoughtLog,
  type ThoughtResponse,
} from '@/lib/mind'
import { cn } from '@/lib/utils'
import { BackLink } from '@/components/PageHeader'

type Form = {
  situation: string
  thought: string
  feelings: Feeling[]
  distortions: Distortion[]
  evidenceFor: string
  evidenceAgainst: string
  friendAdvice: string
  balancedThought: string
  smallStep: string
  intensityAfter: number | null
  isPrivate: boolean
}

const EMPTY: Form = {
  situation: '',
  thought: '',
  feelings: [],
  distortions: [],
  evidenceFor: '',
  evidenceAgainst: '',
  friendAdvice: '',
  balancedThought: '',
  smallStep: '',
  intensityAfter: null,
  isPrivate: false,
}

const toForm = (log: ThoughtLog): Form => ({
  situation: log.situation,
  thought: log.thought,
  feelings: log.feelings,
  distortions: log.distortions,
  evidenceFor: log.evidenceFor,
  evidenceAgainst: log.evidenceAgainst,
  friendAdvice: log.friendAdvice,
  balancedThought: log.balancedThought,
  smallStep: log.smallStep,
  intensityAfter: log.intensityAfter,
  isPrivate: log.isPrivate,
})

const STEP_COUNT = 9

/**
 * The CBT thought log, one gentle question per screen:
 * situation → thought → feelings → thinking traps → evidence → a friend's view →
 * a balanced thought → one small step → how strong the feeling is now.
 * It can be saved at any point after the thought is written.
 */
export function ThoughtFlow() {
  const { id: routeId } = useParams()
  const navigate = useNavigate()
  // One route serves /thoughts/new and /thoughts/:id, so saving partway keeps you on the same step
  const [id, setId] = useState<string | null>(routeId && routeId !== 'new' ? routeId : null)
  const [form, setForm] = useState<Form | null>(id ? null : EMPTY)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [step, setStep] = useState(0)
  const [done, setDone] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [support, setSupport] = useState(false)
  // The log as last saved on the server: its date, and whether it's private (for the AI friend)
  const [saved, setSaved] = useState<{ date: string; isPrivate: boolean } | null>(null)

  useEffect(() => {
    if (!id || form) return
    api
      .get<ThoughtResponse>(`/thoughts/${id}`)
      .then(({ log }) => {
        setForm(toForm(log))
        setSaved({ date: log.date, isPrivate: log.isPrivate })
      })
      .catch((err: unknown) => setLoadError(err instanceof Error ? err.message : 'Could not open this log'))
  }, [id, form])

  if (loadError) return <ErrorNotice>{loadError}</ErrorNotice>
  if (!form) {
    return (
      <div className="mx-auto max-w-xl space-y-4" aria-busy="true">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    )
  }

  const set = <K extends keyof Form>(key: K, value: Form[K]) => {
    setForm((f) => (f ? { ...f, [key]: value } : f))
    setError(null)
  }

  async function save(finishing: boolean): Promise<boolean> {
    if (!form) return false
    if (!form.thought.trim()) {
      setStep(1)
      setError('Write the thought first — that\'s all that\'s needed to save')
      return false
    }
    setSaving(true)
    try {
      const data = id
        ? await api.put<ThoughtResponse>(`/thoughts/${id}`, form)
        : await api.post<ThoughtResponse>('/thoughts', form)
      setSaved({ date: data.log.date, isPrivate: data.log.isPrivate })
      if (!id) {
        setId(data.log.id)
        navigate(`/thoughts/${data.log.id}`, { replace: true })
      }
      if (data.showSupport) setSupport(true)
      if (!finishing) toast.success('Saved — you can come back to this any time')
      return true
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save')
      return false
    } finally {
      setSaving(false)
    }
  }

  async function next() {
    if (step === 1 && !form!.thought.trim()) return setError('Write the thought down, in your own words')
    // The last step's slider starts at the "before" rating; store that so what you see is what's saved
    if (step + 1 === STEP_COUNT - 1 && form!.intensityAfter === null) {
      set('intensityAfter', strongestFeeling(form!.feelings)?.intensityBefore ?? 5)
    }
    if (step < STEP_COUNT - 1) return setStep(step + 1)
    if (await save(true)) setDone(true)
  }

  // Never offer to share while "Keep this private" is on, even before it's saved
  const friendPrivate = form.isPrivate || (saved?.isPrivate ?? false)

  if (done && id) {
    return (
      <FinishScreen
        id={id}
        form={form}
        support={support}
        onSupportChange={setSupport}
        friend={saved && <AiFriend thoughtId={id} thoughtDate={saved.date} isPrivate={friendPrivate} />}
      />
    )
  }

  return (
    <div className="mx-auto max-w-xl">
      <div className="mb-6 flex items-center justify-between gap-2">
        <BackLink to="/thoughts" label="Thought log" />
        <span className="text-sm text-muted-foreground tabular-nums">
          Step {step + 1} of {STEP_COUNT}
        </span>
      </div>

      {/* Progress dots */}
      <ol className="mb-6 flex justify-center gap-1.5" aria-label="Progress">
        {Array.from({ length: STEP_COUNT }, (_, i) => (
          <li
            key={i}
            aria-current={i === step ? 'step' : undefined}
            className={cn(
              'h-2 rounded-full transition-all duration-300',
              i === step ? 'w-6 bg-mental' : i < step ? 'w-2 bg-mental/50' : 'w-2 bg-muted',
            )}
          >
            <span className="sr-only">Step {i + 1}</span>
          </li>
        ))}
      </ol>

      <Card>
        <CardContent key={step} className="animate-in space-y-5 duration-200 fade-in-0 slide-in-from-right-2">
          <StepContent step={step} form={form} set={set} />
          {error && <FormError>{error}</FormError>}
        </CardContent>
      </Card>

      <div className="mt-4 flex items-center justify-between gap-2">
        <Button variant="ghost" onClick={() => setStep(step - 1)} disabled={step === 0}>
          <ArrowLeft aria-hidden /> Back
        </Button>
        <div className="flex items-center gap-2">
          {form.thought.trim() && step < STEP_COUNT - 1 && (
            <Button loading={saving} variant="outline" onClick={() => void save(false)} disabled={saving}>
              <Save aria-hidden />
              <span className="hidden sm:inline">Save for later</span>
              <span className="sm:hidden">Save</span>
            </Button>
          )}
          <Button loading={saving} onClick={() => void next()} disabled={saving}>
            {step === STEP_COUNT - 1 ? (
              <>
                <Check aria-hidden /> Finish
              </>
            ) : (
              <>
                {step === 0 && !form.situation.trim() ? 'Skip' : 'Next'} <ArrowRight aria-hidden />
              </>
            )}
          </Button>
        </div>
      </div>

      <label className="mt-6 flex items-center justify-between gap-3 rounded-2xl border p-4">
        <span className="flex items-center gap-2 text-sm">
          <Lock className="size-4 text-muted-foreground" aria-hidden />
          Keep this private (never send to AI)
        </span>
        <Switch checked={form.isPrivate} onCheckedChange={(v) => set('isPrivate', v)} aria-label="Keep this private" />
      </label>

      {/* A saved log: talk it through with the AI friend */}
      {id && saved && form.thought.trim() && (
        <Card className="mt-6">
          <CardContent className="space-y-3">
            <h2 className="text-center text-lg font-semibold">Talk it through</h2>
            <AiFriend thoughtId={id} thoughtDate={saved.date} isPrivate={friendPrivate} />
          </CardContent>
        </Card>
      )}

      <div className="mt-6 flex justify-center">
        <SupportButton />
      </div>
      <SupportDialog open={support} onOpenChange={setSupport} />
    </div>
  )
}

function Question({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl leading-snug font-semibold">{title}</h1>
        {hint && <p className="mt-1 text-muted-foreground">{hint}</p>}
      </div>
      {children}
    </div>
  )
}

const writing = 'min-h-32 font-serif text-lg leading-relaxed md:text-lg'

function StepContent({ step, form, set }: { step: number; form: Form; set: <K extends keyof Form>(key: K, value: Form[K]) => void }) {
  switch (step) {
    case 0:
      return (
        <Question title="What happened?" hint="Where were you, who was there, what was going on? This one's optional.">
          <Textarea aria-label="What happened" className={writing} maxLength={2000} placeholder="Just the facts, briefly…" value={form.situation} onChange={(e) => set('situation', e.target.value)} />
        </Question>
      )
    case 1:
      return (
        <Question title="What's the thought?" hint="The words that went through your mind. Write them just as they came.">
          <Textarea aria-label="The thought" className={writing} maxLength={2000} autoFocus placeholder={'e.g. "I always get things wrong."'} value={form.thought} onChange={(e) => set('thought', e.target.value)} />
        </Question>
      )
    case 2:
      return <FeelingsStep feelings={form.feelings} onChange={(f) => set('feelings', f)} />
    case 3:
      return (
        <Question title="Any thinking traps?" hint="Our minds take shortcuts. Tap any that might fit — there are no wrong answers.">
          <ul className="grid gap-2 sm:grid-cols-2">
            {DISTORTIONS.map((d) => {
              const on = form.distortions.includes(d.key)
              return (
                <li key={d.key}>
                  <button
                    type="button"
                    aria-pressed={on}
                    onClick={() => set('distortions', on ? form.distortions.filter((x) => x !== d.key) : [...form.distortions, d.key])}
                    className={cn(
                      'flex h-full w-full flex-col gap-1 rounded-xl border p-3 text-left transition-all outline-none hover:border-mental/50 focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-[0.98]',
                      on && 'border-mental/60 bg-mental-soft',
                    )}
                  >
                    <span className="flex items-center justify-between gap-2 font-medium">
                      {d.label}
                      {on && <Check className="size-4 text-mental-foreground" aria-hidden />}
                    </span>
                    <span className="text-sm text-muted-foreground">{d.explanation}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        </Question>
      )
    case 4:
      return (
        <Question title="Looking at the evidence" hint="Like a fair friend would — what actually supports the thought, and what doesn't?">
          <div className="space-y-2">
            <Label htmlFor="evidence-for">What supports the thought?</Label>
            <Textarea id="evidence-for" className={writing} maxLength={2000} value={form.evidenceFor} onChange={(e) => set('evidenceFor', e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="evidence-against">What doesn't fit with it?</Label>
            <Textarea id="evidence-against" className={writing} maxLength={2000} value={form.evidenceAgainst} onChange={(e) => set('evidenceAgainst', e.target.value)} />
          </div>
        </Question>
      )
    case 5:
      return (
        <Question title="What would you tell a close friend who had this thought?" hint="We're often kinder to others than to ourselves.">
          <Textarea aria-label="What you'd tell a friend" className={writing} maxLength={2000} value={form.friendAdvice} onChange={(e) => set('friendAdvice', e.target.value)} />
        </Question>
      )
    case 6:
      return (
        <Question title="A more balanced thought" hint="Not forced positivity — just a fairer, kinder way to see it.">
          <Textarea aria-label="A more balanced thought" className={writing} maxLength={2000} placeholder={'e.g. "I got this one thing wrong, and I get plenty right."'} value={form.balancedThought} onChange={(e) => set('balancedThought', e.target.value)} />
        </Question>
      )
    case 7:
      return (
        <Question title="One small step for the next hour" hint="Something small and doable. A glass of water counts.">
          <Input aria-label="One small step" maxLength={300} placeholder="e.g. Step outside for five minutes" value={form.smallStep} onChange={(e) => set('smallStep', e.target.value)} />
        </Question>
      )
    default: {
      const before = strongestFeeling(form.feelings)
      const value = form.intensityAfter ?? before?.intensityBefore ?? 5
      return (
        <Question
          title="How intense is the feeling now?"
          hint={before ? `Earlier, ${before.name.toLowerCase()} was ${before.intensityBefore}/10.` : 'From 0 (not at all) to 10 (as strong as it gets).'}
        >
          <IntensitySlider label="Intensity now" value={value} onChange={(v) => set('intensityAfter', v)} />
        </Question>
      )
    }
  }
}

function IntensitySlider({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-semibold tabular-nums">{value}/10</span>
      </div>
      <Slider min={0} max={10} step={1} value={[value]} onValueChange={([v]) => onChange(v ?? 0)} aria-label={label} className="py-2" />
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>Not at all</span>
        <span>Very strong</span>
      </div>
    </div>
  )
}

function FeelingsStep({ feelings, onChange }: { feelings: Feeling[]; onChange: (f: Feeling[]) => void }) {
  const [custom, setCustom] = useState('')
  const has = (name: string) => feelings.some((f) => f.name.toLowerCase() === name.toLowerCase())
  const add = (name: string) => {
    const clean = name.trim()
    if (clean && !has(clean) && feelings.length < 10) onChange([...feelings, { name: clean, intensityBefore: 5 }])
  }

  return (
    <Question title="How are you feeling?" hint="Pick any feelings, then rate how strong each one is.">
      <div className="flex flex-wrap gap-2">
        {FEELING_SUGGESTIONS.filter((f) => !has(f)).map((name) => (
          <button
            key={name}
            type="button"
            onClick={() => add(name)}
            className="touch-hit inline-flex h-9 items-center gap-1 rounded-full border px-3.5 text-sm transition-all outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-95"
          >
            <Plus className="size-4" aria-hidden /> {name}
          </button>
        ))}
      </div>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          add(custom)
          setCustom('')
        }}
      >
        <Input aria-label="Another feeling" placeholder="Another feeling…" maxLength={40} value={custom} onChange={(e) => setCustom(e.target.value)} />
        <Button type="submit" variant="secondary" disabled={!custom.trim()}>
          Add
        </Button>
      </form>
      {feelings.length > 0 && (
        <ul className="space-y-4">
          {feelings.map((f, i) => (
            <li key={f.name} className="space-y-1 rounded-xl bg-mental-soft/50 p-3">
              <div className="flex items-center justify-between">
                <span className="font-medium">{f.name}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remove ${f.name}`}
                  onClick={() => onChange(feelings.filter((_, j) => j !== i))}
                >
                  <X />
                </Button>
              </div>
              <IntensitySlider
                label="How strong"
                value={f.intensityBefore}
                onChange={(v) => onChange(feelings.map((x, j) => (j === i ? { ...x, intensityBefore: v } : x)))}
              />
            </li>
          ))}
        </ul>
      )}
    </Question>
  )
}

function FinishScreen({
  id,
  form,
  support,
  onSupportChange,
  friend,
}: {
  id: string
  form: Form
  support: boolean
  onSupportChange: (v: boolean) => void
  /** The AI friend (only shared after a tap) */
  friend: ReactNode
}) {
  const before = strongestFeeling(form.feelings)
  const after = form.intensityAfter ?? before?.intensityBefore ?? null
  const change = before && after !== null ? before.intensityBefore - after : null

  const message =
    change === null
      ? "You took time to look at a difficult thought. That's a real act of care."
      : change > 0
        ? 'Noticing and questioning a thought takes real effort — well done.'
        : change === 0
          ? "It's about the same, and that's okay. Some feelings take time — you've still given this thought some space."
          : "It feels stronger right now, and that's okay too. Be gentle with yourself — and if it would help to talk to someone, support is here."

  return (
    <div className="mx-auto max-w-xl animate-in space-y-6 text-center duration-250 fade-in-0">
      <div className="space-y-3 pt-6">
        <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-secondary text-primary" aria-hidden>
          <Leaf className="size-6" />
        </span>
        <h1 className="text-3xl font-semibold">Thank you for doing this</h1>
        {before && after !== null && (
          <p className="font-heading text-2xl tabular-nums" aria-label={`${before.name} went from ${before.intensityBefore} to ${after} out of 10`}>
            {before.name}: {before.intensityBefore} <ArrowRight className="inline size-5 align-middle text-muted-foreground" aria-hidden /> {after}
            <span className="text-base text-muted-foreground"> /10</span>
          </p>
        )}
        <p className="mx-auto max-w-md text-pretty text-muted-foreground">{message}</p>
      </div>

      {/* Encouragement (or support contacts, if the words suggested it) */}
      <AiMessageCard key={id} title="A note for you" request={aiRequests.thought(id)} className="text-left" />

      {friend}

      {form.smallStep && (
        <Card size="sm" className="text-left">
          <CardContent>
            <p className="text-xs text-muted-foreground">Your small step</p>
            <p className="font-medium">{form.smallStep}</p>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-col items-center gap-3">
        <Button asChild size="lg">
          <Link to="/lift">
            <Sun aria-hidden /> Lift me up
          </Link>
        </Button>
        <Button asChild variant="ghost">
          <Link to="/thoughts">Back to thought log</Link>
        </Button>
        {change !== null && change < 0 && <SupportButton />}
      </div>
      <SupportDialog open={support} onOpenChange={onSupportChange} />
    </div>
  )
}
