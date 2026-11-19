import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Loader2, Lock, Save, Star, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { ErrorNotice } from '@/components/StatusViews'
import { SupportButton, SupportDialog } from '@/components/mind/Support'
import { api } from '@/lib/api'
import { formatLongDate, todayInTimezone } from '@/lib/dates'
import type { DiaryEntry, DiaryResponse } from '@/lib/mind'
import { readJSON, removeItem, writeJSON } from '@/lib/storage'
import { cn } from '@/lib/utils'

type Draft = { date: string; title: string; body: string; tags: string[]; isFavourite: boolean }

const MAX_BODY = 20_000
const DRAFT_DELAY_MS = 600
const draftKey = (id: string | undefined) => `diary-draft:${id ?? 'new'}`
const same = (a: Draft, b: Draft) => JSON.stringify(a) === JSON.stringify(b)
const emptyDraft = (): Draft => ({ date: todayInTimezone(), title: '', body: '', tags: [], isFavourite: false })
const fromEntry = (e: DiaryEntry): Draft => ({ date: e.date, title: e.title, body: e.body, tags: e.tags, isFavourite: e.isFavourite })

/**
 * A calm, distraction-free writing view. While you type, a draft is kept in this browser
 * (so nothing is lost if the tab closes); "Save" encrypts and stores it on the server.
 */
export function DiaryEditor() {
  const { id } = useParams()
  return <Editor key={id ?? 'new'} id={id} />
}

function Editor({ id }: { id: string | undefined }) {
  const navigate = useNavigate()
  const location = useLocation()
  // After creating, the page reopens under the new id; carry the support card across that
  const [support, setSupport] = useState(Boolean((location.state as { showSupport?: boolean } | null)?.showSupport))
  useEffect(() => {
    // Forget it straight away, so reloading the page doesn't show it again
    if (location.state) navigate(location.pathname, { replace: true, state: null })
  }, [location.state, location.pathname, navigate])
  // A new entry starts from any unsaved draft left in this browser
  const [draft, setDraft] = useState<Draft | null>(() => {
    if (id) return null
    const local = readJSON<Draft>(draftKey(undefined))
    return local && (local.body || local.title) ? local : emptyDraft()
  })
  const [saved, setSaved] = useState<Draft | null>(id ? null : emptyDraft())
  const [entry, setEntry] = useState<DiaryEntry | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [pendingDraft, setPendingDraft] = useState<Draft | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [tagInput, setTagInput] = useState('')
  const bodyRef = useRef<HTMLTextAreaElement>(null)

  // Load the entry (if editing) and look for an unsaved draft from earlier
  useEffect(() => {
    const local = readJSON<Draft>(draftKey(id))
    if (!id) {
      if (local && (local.body || local.title)) toast('Restored your unsaved draft', { id: 'diary-draft' })
      return
    }
    let cancelled = false
    api
      .get<DiaryResponse>(`/diary/${id}`)
      .then(({ entry }) => {
        if (cancelled) return
        const server = fromEntry(entry)
        setEntry(entry)
        setSaved(server)
        setDraft(server)
        if (local && !same(local, server)) setPendingDraft(local)
      })
      .catch((err: unknown) => !cancelled && setLoadError(err instanceof Error ? err.message : 'Could not open this entry'))
    return () => {
      cancelled = true
    }
  }, [id])

  const dirty = draft !== null && saved !== null && !same(draft, saved)

  // Keep a local draft a moment after each change
  useEffect(() => {
    if (!draft || !dirty || pendingDraft) return
    const timer = setTimeout(() => writeJSON(draftKey(id), draft), DRAFT_DELAY_MS)
    return () => clearTimeout(timer)
  }, [draft, dirty, id, pendingDraft])

  function update(changes: Partial<Draft>) {
    setDraft((d) => (d ? { ...d, ...changes } : d))
    setError(null)
  }

  function addTag() {
    const tag = tagInput.trim().toLowerCase().replace(/^#/, '')
    if (tag && draft && !draft.tags.includes(tag) && draft.tags.length < 10) update({ tags: [...draft.tags, tag] })
    setTagInput('')
  }

  function onTagKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      addTag()
    }
  }

  async function save() {
    if (!draft) return
    if (!draft.body.trim()) return setError('Write a few words first')
    setSaving(true)
    setError(null)
    try {
      const body = { date: draft.date, title: draft.title, body: draft.body, tags: draft.tags, isFavourite: draft.isFavourite }
      const data = id ? await api.put<DiaryResponse>(`/diary/${id}`, body) : await api.post<DiaryResponse>('/diary', body)
      removeItem(draftKey(id))
      const stored = fromEntry(data.entry)
      setSaved(stored)
      setDraft(stored)
      setEntry(data.entry)
      toast.success('Saved ✓')
      if (!id) navigate(`/diary/${data.entry.id}`, { replace: true, state: { showSupport: data.showSupport } })
      else if (data.showSupport) setSupport(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your entry')
    } finally {
      setSaving(false)
    }
  }

  async function remove() {
    if (!id) return
    try {
      await api.delete(`/diary/${id}`)
      removeItem(draftKey(id))
      toast.success('Entry deleted')
      navigate('/diary', { replace: true })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not delete this entry')
    }
  }

  if (loadError) return <ErrorNotice>{loadError}</ErrorNotice>
  if (!draft) {
    return (
      <div className="mx-auto max-w-2xl space-y-4" aria-busy="true">
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="h-80 w-full rounded-2xl" />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6 flex items-center justify-between gap-2">
        <Button variant="ghost" className="-ml-2 text-muted-foreground" onClick={() => navigate('/diary')}>
          <ArrowLeft aria-hidden /> Diary
        </Button>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            aria-pressed={draft.isFavourite}
            aria-label={draft.isFavourite ? 'Remove from favourites' : 'Add to favourites'}
            onClick={() => update({ isFavourite: !draft.isFavourite })}
          >
            <Star className={cn(draft.isFavourite ? 'fill-learning text-learning' : 'text-muted-foreground')} />
          </Button>
          {id && (
            <Button variant="ghost" size="icon" aria-label="Delete entry" onClick={() => setConfirmDelete(true)} className="text-muted-foreground hover:text-destructive">
              <Trash2 />
            </Button>
          )}
        </div>
      </div>

      {pendingDraft && (
        <div className="mb-4 flex flex-col gap-3 rounded-2xl bg-mental-soft/60 p-4 text-sm sm:flex-row sm:items-center">
          <p className="flex-1">You have unsaved changes to this entry from earlier.</p>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => { setDraft(pendingDraft); setPendingDraft(null) }}>
              Restore them
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { removeItem(draftKey(id)); setPendingDraft(null) }}>
              Discard
            </Button>
          </div>
        </div>
      )}

      {entry?.unreadable ? (
        <ErrorNotice>
          This entry can't be opened. It may have been saved with a different encryption key, so it can't be read on
          this server.
        </ErrorNotice>
      ) : (
        <article className="space-y-4">
          <label className="block text-sm text-muted-foreground">
            <span className="sr-only">Date</span>
            <input
              type="date"
              value={draft.date}
              max={todayInTimezone()}
              onChange={(e) => e.target.value && update({ date: e.target.value })}
              className="rounded-lg bg-transparent outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              aria-label={`Date: ${formatLongDate(draft.date)}`}
            />
          </label>
          <input
            aria-label="Title"
            placeholder="Title (optional)"
            maxLength={200}
            value={draft.title}
            onChange={(e) => update({ title: e.target.value })}
            className="w-full bg-transparent font-heading text-3xl font-semibold tracking-tight outline-none placeholder:text-muted-foreground/60"
          />
          <Textarea
            ref={bodyRef}
            aria-label="Your entry"
            placeholder="What's on your mind?"
            maxLength={MAX_BODY}
            autoFocus={!id}
            value={draft.body}
            onChange={(e) => update({ body: e.target.value })}
            className="min-h-[50dvh] resize-none border-none bg-transparent px-0 font-serif text-lg leading-8 shadow-none focus-visible:ring-0 md:text-lg dark:bg-transparent"
          />

          <div className="space-y-2 border-t pt-4">
            <div className="flex flex-wrap items-center gap-1.5">
              {draft.tags.map((t) => (
                <span key={t} className="inline-flex items-center gap-1 rounded-full bg-mental-soft py-1 pr-1 pl-3 text-sm text-mental-foreground">
                  #{t}
                  <button
                    type="button"
                    aria-label={`Remove tag ${t}`}
                    onClick={() => update({ tags: draft.tags.filter((x) => x !== t) })}
                    className="grid size-6 place-items-center rounded-full outline-none hover:bg-card focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    <X className="size-3.5" />
                  </button>
                </span>
              ))}
              {draft.tags.length < 10 && (
                <Input
                  aria-label="Add a tag"
                  placeholder="Add a tag…"
                  value={tagInput}
                  maxLength={30}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={onTagKey}
                  onBlur={addTag}
                  className="h-8 w-32 rounded-full"
                />
              )}
            </div>
            <p className="text-xs text-muted-foreground tabular-nums">
              {draft.body.length.toLocaleString()} / {MAX_BODY.toLocaleString()}
            </p>
          </div>
        </article>
      )}

      <div className="sticky bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-20 mt-6 md:bottom-4">
        <div className="flex items-center justify-between gap-3 rounded-2xl border bg-card/85 p-2.5 pl-4 shadow-soft backdrop-blur-lg">
          <p className="min-w-0 text-sm" role="status">
            {error ? (
              <span className="text-destructive">{error}</span>
            ) : dirty ? (
              <span className="text-muted-foreground">Draft kept on this device</span>
            ) : (
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <Lock className="size-3.5" aria-hidden /> {id ? 'Saved and encrypted' : 'Start writing'}
              </span>
            )}
          </p>
          <Button size="lg" onClick={() => void save()} disabled={saving || !dirty || !!entry?.unreadable}>
            {saving ? <Loader2 className="animate-spin" aria-hidden /> : <Save aria-hidden />}
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </div>

      <div className="mt-6 flex justify-center">
        <SupportButton />
      </div>

      <SupportDialog open={support} onOpenChange={setSupport} />

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Delete this entry?</DialogTitle>
            <DialogDescription>It will be gone for good — this can't be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(false)}>
              Keep it
            </Button>
            <Button variant="destructive" onClick={() => void remove()}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
