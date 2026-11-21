import { useEffect, useState, type FormEvent } from 'react'
import { Check, Loader2, Plus, Save, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { PageHeader } from '@/components/PageHeader'
import { ErrorNotice } from '@/components/StatusViews'
import { DailyPurposes, PurposeEvolution } from '@/components/purpose/PurposeJourney'
import { api } from '@/lib/api'
import { VALUE_SUGGESTIONS, type Purpose as PurposeData } from '@/lib/mind'
import { cn } from '@/lib/utils'

export function Purpose() {
  const [purpose, setPurpose] = useState<PurposeData | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [customValue, setCustomValue] = useState('')
  // Bumped after each save, so "How my purpose evolved" shows a statement that was just replaced
  const [saves, setSaves] = useState(0)

  useEffect(() => {
    api
      .get<{ purpose: PurposeData }>('/purpose')
      .then((data) => setPurpose(data.purpose))
      .catch((err: unknown) => setLoadError(err instanceof Error ? err.message : 'Could not load your purpose'))
  }, [])

  if (loadError) return <ErrorNotice>{loadError}</ErrorNotice>

  const update = (changes: Partial<PurposeData>) => {
    setPurpose((p) => (p ? { ...p, ...changes } : p))
    setError(null)
  }

  function toggleValue(value: string) {
    if (!purpose) return
    const has = purpose.coreValues.some((v) => v.toLowerCase() === value.toLowerCase())
    update({ coreValues: has ? purpose.coreValues.filter((v) => v.toLowerCase() !== value.toLowerCase()) : [...purpose.coreValues, value] })
  }

  function addCustomValue(e: FormEvent) {
    e.preventDefault()
    const value = customValue.trim()
    if (value && purpose && !purpose.coreValues.some((v) => v.toLowerCase() === value.toLowerCase())) {
      update({ coreValues: [...purpose.coreValues, value] })
    }
    setCustomValue('')
  }

  async function save() {
    if (!purpose) return
    setSaving(true)
    try {
      const data = await api.put<{ purpose: PurposeData }>('/purpose', {
        purposeStatement: purpose.purposeStatement,
        coreValues: purpose.coreValues,
        longTermGoals: purpose.longTermGoals.filter((g) => g.title.trim()),
      })
      setPurpose(data.purpose)
      setSaves((n) => n + 1)
      toast.success('Saved ✓')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save')
    } finally {
      setSaving(false)
    }
  }

  const values = purpose ? [...new Set([...VALUE_SUGGESTIONS, ...purpose.coreValues])] : []

  return (
    <>
      <PageHeader title="My purpose" description="What matters to you, in your own words. You can change it any time." />

      {!purpose ? (
        <div className="space-y-4" aria-busy="true">
          <Skeleton className="h-40 rounded-2xl" />
          <Skeleton className="h-56 rounded-2xl" />
        </div>
      ) : (
        <div className="max-w-3xl space-y-4 md:space-y-6">
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
                value={purpose.purposeStatement}
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
                  const on = purpose.coreValues.some((v) => v.toLowerCase() === value.toLowerCase())
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
              <CardDescription>Where you'd like to be — and why it matters to you.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {purpose.longTermGoals.map((goal, i) => (
                <div key={i} className="grid gap-2 rounded-xl bg-muted/60 p-3">
                  <div className="flex items-end gap-2">
                    <div className="flex-1 space-y-1.5">
                      <Label htmlFor={`goal-${i}`}>Goal</Label>
                      <Input
                        id={`goal-${i}`}
                        maxLength={150}
                        placeholder="e.g. Run a 10k"
                        value={goal.title}
                        onChange={(e) => update({ longTermGoals: purpose.longTermGoals.map((g, j) => (j === i ? { ...g, title: e.target.value } : g)) })}
                      />
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Remove goal ${goal.title || i + 1}`}
                      onClick={() => update({ longTermGoals: purpose.longTermGoals.filter((_, j) => j !== i) })}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <X />
                    </Button>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={`why-${i}`}>Why it matters</Label>
                    <Textarea
                      id={`why-${i}`}
                      maxLength={500}
                      className="min-h-16"
                      value={goal.why}
                      onChange={(e) => update({ longTermGoals: purpose.longTermGoals.map((g, j) => (j === i ? { ...g, why: e.target.value } : g)) })}
                    />
                  </div>
                </div>
              ))}
              {purpose.longTermGoals.length < 10 && (
                <Button
                  variant="outline"
                  className="w-full border-dashed sm:w-auto"
                  onClick={() => update({ longTermGoals: [...purpose.longTermGoals, { title: '', why: '' }] })}
                >
                  <Plus aria-hidden /> Add a goal
                </Button>
              )}
            </CardContent>
          </Card>

          {error && <ErrorNotice>{error}</ErrorNotice>}
          <div className="flex justify-end">
            <Button size="lg" onClick={() => void save()} disabled={saving} className="w-full sm:w-auto">
              {saving ? <Loader2 className="animate-spin" aria-hidden /> : <Save aria-hidden />}
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </div>

          <DailyPurposes />
          <PurposeEvolution key={saves} />
        </div>
      )}
    </>
  )
}
