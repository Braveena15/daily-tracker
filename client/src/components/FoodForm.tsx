import { useId, useState, type FormEvent } from 'react'
import { Loader2, Star } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Toggle } from '@/components/ui/toggle'
import { InputWithUnit } from '@/components/InputWithUnit'
import { ErrorNotice } from '@/components/StatusViews'
import type { Food, FoodValues } from '@/lib/foods'
import { cn } from '@/lib/utils'

const str = (n: number | undefined) => (n === undefined ? '' : String(n))

/** Create or edit a food: name, serving, kcal, optional macros and ⭐ favourite. */
export function FoodForm({
  initial,
  initialName = '',
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial?: Food
  initialName?: string
  submitLabel: string
  /** Throw an Error to show its message on the form */
  onSubmit: (values: FoodValues) => Promise<void>
  onCancel?: () => void
}) {
  const id = useId()
  const [name, setName] = useState(initial?.name ?? initialName)
  const [serving, setServing] = useState(initial?.servingDescription ?? '')
  const [kcal, setKcal] = useState(str(initial?.kcalPerServing))
  const [protein, setProtein] = useState(str(initial?.proteinG))
  const [carbs, setCarbs] = useState(str(initial?.carbsG))
  const [fat, setFat] = useState(str(initial?.fatG))
  const [favourite, setFavourite] = useState(initial?.isFavourite ?? false)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  function optional(value: string, label: string): number | null {
    if (value.trim() === '') return null
    const n = Number(value)
    if (!Number.isFinite(n) || n < 0) throw new Error(`${label} must be a number of grams`)
    return n
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    e.stopPropagation() // never submit a surrounding form
    setError(null)

    let values: FoodValues
    try {
      if (!name.trim()) throw new Error('Give the food a name')
      if (!serving.trim()) throw new Error('Describe one serving, e.g. "1 plate" or "100 g"')
      const kcalNumber = Number(kcal)
      if (kcal.trim() === '' || !Number.isFinite(kcalNumber) || kcalNumber < 0) {
        throw new Error('Enter the calories in one serving')
      }
      values = {
        name: name.trim(),
        servingDescription: serving.trim(),
        kcalPerServing: kcalNumber,
        proteinG: optional(protein, 'Protein'),
        carbsG: optional(carbs, 'Carbs'),
        fatG: optional(fat, 'Fat'),
        isFavourite: favourite,
      }
    } catch (err) {
      return setError((err as Error).message)
    }

    setSaving(true)
    try {
      await onSubmit(values)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save this food')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit} noValidate>
      {error && <ErrorNotice>{error}</ErrorNotice>}

      <div className="space-y-2">
        <Label htmlFor={`${id}-name`}>Name</Label>
        <Input
          id={`${id}-name`}
          maxLength={100}
          placeholder="e.g. Rice and curry"
          value={name}
          autoFocus={!initial}
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_8rem] gap-3">
        <div className="space-y-2">
          <Label htmlFor={`${id}-serving`}>One serving is</Label>
          <Input
            id={`${id}-serving`}
            maxLength={50}
            placeholder="1 plate, 100 g…"
            value={serving}
            onChange={(e) => setServing(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${id}-kcal`}>Calories</Label>
          <InputWithUnit
            id={`${id}-kcal`}
            unit="kcal"
            type="number"
            inputMode="numeric"
            min={0}
            max={5000}
            value={kcal}
            onChange={(e) => setKcal(e.target.value)}
          />
        </div>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">
          Per serving <span className="font-normal text-muted-foreground">(optional)</span>
        </legend>
        <div className="grid grid-cols-3 gap-2">
          {(
            [
              ['Protein', protein, setProtein],
              ['Carbs', carbs, setCarbs],
              ['Fat', fat, setFat],
            ] as const
          ).map(([label, value, set]) => (
            <div key={label} className="space-y-1">
              <Label htmlFor={`${id}-${label}`} className="text-xs text-muted-foreground">
                {label}
              </Label>
              <InputWithUnit
                id={`${id}-${label}`}
                unit="g"
                type="number"
                inputMode="decimal"
                min={0}
                max={500}
                step="any"
                value={value}
                onChange={(e) => set(e.target.value)}
              />
            </div>
          ))}
        </div>
      </fieldset>

      <Toggle
        variant="outline"
        pressed={favourite}
        onPressedChange={setFavourite}
        className={cn('h-10 rounded-xl px-3', favourite && 'border-learning/50 bg-learning-soft text-learning-foreground')}
      >
        <Star className={cn(favourite && 'fill-current')} aria-hidden />
        {favourite ? 'Favourite' : 'Add to favourites'}
      </Toggle>

      <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={saving}>
          {saving && <Loader2 className="animate-spin" aria-hidden />}
          {submitLabel}
        </Button>
      </div>
    </form>
  )
}
