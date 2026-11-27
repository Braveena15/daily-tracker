// Form pieces shared by the journey setup and the check-ins: 1–10 ratings, editable lists,
// measurements and a photo picker (photos are compressed in the browser before upload).
import { useId, useState, type ReactNode } from 'react'
import { ImagePlus, Plus, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { InputWithUnit } from '@/components/InputWithUnit'
import { compressImage, UnsupportedImageError } from '@/lib/imageCompress'
import { MEASUREMENTS, RATING_KEYS, RATING_LABELS, type MeasurementsForm, type Ratings } from '@/lib/program'
import { cn } from '@/lib/utils'

export function Field({ label, hint, htmlFor, children, className }: { label: string; hint?: ReactNode; htmlFor?: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

/** A 1–10 scale as a row of buttons; choosing the selected value again clears it. */
export function RatingScale({ label, value, onChange, hint }: { label: string; value: number | null | undefined; onChange: (v: number | null) => void; hint?: string }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium" id={`${label}-label`}>
          {label}
        </span>
        <span className="text-xs text-muted-foreground tabular-nums">{value ? `${value}/10` : (hint ?? 'Not rated')}</span>
      </div>
      <div role="radiogroup" aria-labelledby={`${label}-label`} className="grid grid-cols-10 gap-1">
        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            aria-label={`${n} out of 10`}
            onClick={() => onChange(value === n ? null : n)}
            className={cn(
              'h-9 rounded-lg border text-sm tabular-nums transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
              value != null && n <= value ? 'border-primary bg-primary text-primary-foreground' : 'bg-card hover:bg-accent/50',
            )}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  )
}

/** The five ratings plus any custom ones (custom names can be added and removed). */
export function RatingsEditor({ value, onChange, allowCustom = true, compareTo }: { value: Ratings; onChange: (r: Ratings) => void; allowCustom?: boolean; compareTo?: Ratings }) {
  const [newLabel, setNewLabel] = useState('')
  const custom = value.custom ?? []
  return (
    <div className="space-y-4">
      {RATING_KEYS.map((key) => (
        <RatingScale
          key={key}
          label={RATING_LABELS[key]}
          value={value[key]}
          hint={compareTo?.[key] ? `was ${compareTo[key]}/10` : undefined}
          onChange={(v) => onChange({ ...value, [key]: v })}
        />
      ))}
      {custom.map((c, i) => (
        <div key={`${c.label}-${i}`} className="flex items-end gap-2">
          <div className="min-w-0 flex-1">
            <RatingScale label={c.label} value={c.value} onChange={(v) => onChange({ ...value, custom: custom.map((x, j) => (j === i ? { ...x, value: v } : x)) })} />
          </div>
          {allowCustom && (
            <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove ${c.label}`} onClick={() => onChange({ ...value, custom: custom.filter((_, j) => j !== i) })}>
              <X aria-hidden />
            </Button>
          )}
        </div>
      ))}
      {allowCustom && custom.length < 5 && (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            const label = newLabel.trim()
            if (!label) return
            onChange({ ...value, custom: [...custom, { label, value: null }] })
            setNewLabel('')
          }}
        >
          <Input aria-label="Add your own rating" placeholder="Add your own, e.g. Patience" maxLength={60} value={newLabel} onChange={(e) => setNewLabel(e.target.value)} />
          <Button type="submit" variant="outline" disabled={!newLabel.trim()}>
            <Plus aria-hidden /> Add
          </Button>
        </form>
      )}
    </div>
  )
}

/** A short list of things (habits, focus areas): add with Enter, remove with ×. */
export function ListEditor({ label, items, onChange, placeholder, max = 12, suggestions = [] }: { label: string; items: string[]; onChange: (items: string[]) => void; placeholder: string; max?: number; suggestions?: string[] }) {
  const id = useId()
  const [draft, setDraft] = useState('')
  const add = (text: string) => {
    const t = text.trim()
    if (!t || items.some((i) => i.toLowerCase() === t.toLowerCase()) || items.length >= max) return
    onChange([...items, t])
    setDraft('')
  }
  const unused = suggestions.filter((s) => !items.some((i) => i.toLowerCase() === s.toLowerCase()))
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      {items.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {items.map((item) => (
            <li key={item} className="flex items-center gap-1 rounded-full bg-muted py-1 pr-1 pl-3 text-sm">
              {item}
              <button type="button" aria-label={`Remove ${item}`} onClick={() => onChange(items.filter((i) => i !== item))} className="grid size-6 place-items-center rounded-full outline-none hover:bg-background focus-visible:ring-3 focus-visible:ring-ring/50">
                <X className="size-3.5" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
      {items.length < max && (
        <div className="flex gap-2">
          <Input
            id={id}
            placeholder={placeholder}
            maxLength={60}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                add(draft)
              }
            }}
          />
          <Button type="button" variant="outline" disabled={!draft.trim()} onClick={() => add(draft)}>
            <Plus aria-hidden /> Add
          </Button>
        </div>
      )}
      {unused.length > 0 && items.length < max && (
        <div className="flex flex-wrap gap-1.5">
          {unused.map((s) => (
            <button key={s} type="button" onClick={() => add(s)} className="rounded-full border border-dashed px-3 py-1 text-sm text-muted-foreground outline-none hover:bg-accent/40 hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50">
              + {s}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}


export function MeasurementsEditor({ value, onChange, idPrefix }: { value: MeasurementsForm; onChange: (v: MeasurementsForm) => void; idPrefix: string }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {MEASUREMENTS.map((m) => (
        <Field key={m.key} label={m.label} htmlFor={`${idPrefix}-${m.key}`}>
          <InputWithUnit id={`${idPrefix}-${m.key}`} unit="cm" type="number" inputMode="decimal" step="0.1" min={20} max={300} value={value[m.key]} onChange={(e) => onChange({ ...value, [m.key]: e.target.value })} />
        </Field>
      ))}
    </div>
  )
}

export type PickedPhoto = { blob: Blob; filename: string; url: string }

/** Up to `max` photos, compressed (and their location data dropped) as they're picked. Uploaded later. */
export function PhotoPicker({ photos, onChange, max = 4 }: { photos: PickedPhoto[]; onChange: (p: PickedPhoto[]) => void; max?: number }) {
  const id = useId()
  const [busy, setBusy] = useState(false)
  // A removed photo's preview is freed straight away. The rest stay while the form holds them (the
  // wizard unmounts this picker between steps), and go with the page.

  async function pick(files: FileList | null) {
    if (!files?.length) return
    setBusy(true)
    const added: PickedPhoto[] = []
    for (const file of [...files].slice(0, max - photos.length)) {
      try {
        const { blob, filename } = await compressImage(file)
        added.push({ blob, filename, url: URL.createObjectURL(blob) })
      } catch (err) {
        toast.error(err instanceof UnsupportedImageError ? `${file.name}: this photo type can't be opened here` : `${file.name}: couldn't read this photo`)
      }
    }
    setBusy(false)
    onChange([...photos, ...added])
  }

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-4 gap-2">
        {photos.map((p, i) => (
          <div key={p.url} className="relative aspect-[3/4] overflow-hidden rounded-xl bg-muted">
            <img src={p.url} alt={`Progress photo ${i + 1}`} className="size-full object-cover" />
            <button type="button" aria-label={`Remove photo ${i + 1}`} onClick={() => {
                URL.revokeObjectURL(p.url)
                onChange(photos.filter((x) => x !== p))
              }} className="absolute top-1 right-1 grid size-7 place-items-center rounded-full bg-background/90 shadow outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
              <X className="size-4" aria-hidden />
            </button>
          </div>
        ))}
        {photos.length < max && (
          <label htmlFor={id} className={cn('grid aspect-[3/4] cursor-pointer place-items-center rounded-xl border border-dashed text-muted-foreground hover:bg-accent/40 has-focus-visible:ring-3 has-focus-visible:ring-ring/50', busy && 'opacity-60')}>
            <span className="flex flex-col items-center gap-1 text-xs">
              <ImagePlus className="size-5" aria-hidden />
              {busy ? 'Preparing…' : 'Add photo'}
            </span>
            <input id={id} type="file" accept="image/*" multiple className="sr-only" disabled={busy} onChange={(e) => void pick(e.target.files).then(() => (e.target.value = ''))} />
          </label>
        )}
      </div>
      <p className="text-xs text-muted-foreground">Optional, up to {max}. Stored encrypted and only ever shown to you.</p>
    </div>
  )
}
