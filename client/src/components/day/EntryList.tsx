// A day's entries of one kind, newest first: "08:15 · Cycling · 30 min", each with edit and delete.
import { useEffect, useState, type ReactNode } from 'react'
import { Pencil, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { timeOf } from '@/lib/healthSync'
import { cn } from '@/lib/utils'

type Item = { id: string; loggedAt?: string | null }

export function EntryList<T extends Item>({
  items,
  describe,
  readOnly,
  renderEdit,
  onDelete,
  label,
  showTime = true,
}: {
  items: T[]
  /** The main line and an optional second line */
  describe: (item: T) => { title: ReactNode; detail?: string }
  /** Items that can't be changed here (shown with a note instead of Edit and Delete) */
  readOnly?: (item: T) => ReactNode | false
  renderEdit: (item: T, close: () => void) => ReactNode
  onDelete: (item: T) => Promise<unknown>
  /** For screen readers, e.g. "workout" */
  label: string
  /** False for entries without a time of day (learnings) */
  showTime?: boolean
}) {
  const [editing, setEditing] = useState<string | null>(null)
  if (items.length === 0) return null

  return (
    <ul className="space-y-2" aria-label={`${label}s logged`}>
      {items.map((item) =>
        editing === item.id ? (
          <li key={item.id}>{renderEdit(item, () => setEditing(null))}</li>
        ) : (
          <Row
            key={item.id}
            item={item}
            {...describe(item)}
            note={readOnly?.(item) || null}
            label={label}
            showTime={showTime}
            onEdit={() => setEditing(item.id)}
            onDelete={() => onDelete(item)}
          />
        ),
      )}
    </ul>
  )
}

function Row({
  item,
  title,
  detail,
  note,
  label,
  showTime,
  onEdit,
  onDelete,
}: {
  item: Item
  title: ReactNode
  detail?: string
  note: ReactNode
  label: string
  showTime: boolean
  onEdit: () => void
  onDelete: () => Promise<unknown>
}) {
  // Delete needs a second tap, so a stray tap doesn't lose anything
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)
  useEffect(() => {
    if (!confirming) return
    const timer = setTimeout(() => setConfirming(false), 3000)
    return () => clearTimeout(timer)
  }, [confirming])

  async function remove() {
    if (!confirming) return setConfirming(true)
    setDeleting(true)
    try {
      await onDelete()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not delete')
      setDeleting(false)
      setConfirming(false)
    }
  }

  const time = showTime && item.loggedAt ? timeOf(item.loggedAt) : null
  // "workout at 08:15", or "learning: React hooks" for entries without a time
  const which = time ? `${label} at ${time}` : `${label}: ${typeof title === 'string' ? title : ''}`.replace(/: $/, '')
  return (
    <li className="flex animate-in items-start gap-3 rounded-xl bg-muted/60 p-3 duration-200 fade-in-0">
      {time && (
        <time dateTime={item.loggedAt!} className="mt-0.5 w-11 shrink-0 text-sm font-medium text-muted-foreground tabular-nums">
          {time}
        </time>
      )}
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium break-words">{title}</div>
        {detail && <p className="mt-0.5 text-sm break-words text-muted-foreground">{detail}</p>}
        {note && (
          <p className="mt-1 text-xs text-muted-foreground">{note}</p>
        )}
      </div>
      {!note && (
        <div className="-my-1 -mr-1 flex shrink-0">
          <Button type="button" variant="ghost" size="icon" aria-label={`Edit ${which}`} onClick={onEdit}>
            <Pencil />
          </Button>
          <Button loading={deleting}
            type="button"
            variant="ghost"
            size={confirming ? 'sm' : 'icon'}
            aria-label={confirming ? `Tap again to delete ${which}` : `Delete ${which}`}
            onClick={remove}
            disabled={deleting}
            className={cn(
              'text-muted-foreground hover:bg-destructive/10 hover:text-destructive',
              confirming && 'bg-destructive/10 text-destructive',
            )}
          >
            <Trash2 />
            {confirming && !deleting && 'Delete?'}
          </Button>
        </div>
      )}
    </li>
  )
}
