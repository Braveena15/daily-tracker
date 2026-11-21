import { useEffect, useState, type FormEvent } from 'react'
import { Clapperboard, Loader2, Pencil, Plus, Quote as QuoteIcon, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { PageHeader } from '@/components/PageHeader'
import { EmptyState, ErrorNotice } from '@/components/StatusViews'
import { api } from '@/lib/api'
import { CATEGORIES, categoryLabel, embedUrl, type Category, type Quote, type Video } from '@/lib/mind'
import { cn } from '@/lib/utils'

const errorMessage = (err: unknown, fallback: string) => (err instanceof Error ? err.message : fallback)

function CategoryFilter({ value, onChange }: { value: Category | null; onChange: (c: Category | null) => void }) {
  const chip = (on: boolean) =>
    cn(
      'h-8 rounded-full border px-3 text-sm transition-all outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50',
      on && 'border-mental/50 bg-mental-soft text-mental-foreground hover:bg-mental-soft',
    )
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by category">
      <button type="button" className={chip(value === null)} aria-pressed={value === null} onClick={() => onChange(null)}>
        All
      </button>
      {CATEGORIES.map((c) => (
        <button key={c} type="button" className={chip(value === c)} aria-pressed={value === c} onClick={() => onChange(value === c ? null : c)}>
          {categoryLabel(c)}
        </button>
      ))}
    </div>
  )
}

function CategorySelect({ value, onChange }: { value: Category; onChange: (c: Category) => void }) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as Category)}>
      <SelectTrigger id="category" className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {CATEGORIES.map((c) => (
          <SelectItem key={c} value={c}>
            {categoryLabel(c)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

export function Motivation() {
  return (
    <>
      <PageHeader title="Motivation library" description="Words and videos that help you keep going." />
      <Tabs defaultValue="quotes">
        <TabsList className="mb-4 h-10 rounded-xl bg-muted p-1">
          <TabsTrigger value="quotes" className="rounded-lg px-4">
            <QuoteIcon aria-hidden /> Quotes
          </TabsTrigger>
          <TabsTrigger value="videos" className="rounded-lg px-4">
            <Clapperboard aria-hidden /> Videos
          </TabsTrigger>
        </TabsList>
        <TabsContent value="quotes">
          <QuotesTab />
        </TabsContent>
        <TabsContent value="videos">
          <VideosTab />
        </TabsContent>
      </Tabs>
    </>
  )
}

// ---------- Quotes ----------

function QuotesTab() {
  const [data, setData] = useState<{ quotes: Quote[]; builtIn: Quote[] } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<Category | null>(null)
  const [editing, setEditing] = useState<Quote | 'new' | null>(null)

  useEffect(() => {
    api
      .get<{ quotes: Quote[]; builtIn: Quote[] }>('/quotes')
      .then(setData)
      .catch((err: unknown) => setError(errorMessage(err, 'Could not load quotes')))
  }, [])

  async function remove(quote: Quote) {
    try {
      await api.delete(`/quotes/${quote.id}`)
      setData((d) => d && { ...d, quotes: d.quotes.filter((q) => q.id !== quote.id) })
      toast.success('Quote removed')
    } catch (err) {
      toast.error(errorMessage(err, 'Could not remove it'))
    }
  }

  if (error) return <ErrorNotice>{error}</ErrorNotice>
  if (!data) return <ListSkeleton />

  const show = (q: Quote) => filter === null || q.category === filter
  const mine = data.quotes.filter(show)
  const library = data.builtIn.filter(show)

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <CategoryFilter value={filter} onChange={setFilter} />
        <Button onClick={() => setEditing('new')}>
          <Plus aria-hidden /> Add a quote
        </Button>
      </div>

      <section aria-labelledby="my-quotes" className="space-y-3">
        <h2 id="my-quotes" className="text-lg font-semibold">
          Your quotes
        </h2>
        {mine.length === 0 ? (
          <Card>
            <EmptyState icon={QuoteIcon} tone="mental" title={filter ? 'None in this category yet' : 'No quotes saved yet'} className="py-6">
              Words that stayed with you — from a book, a friend, or yourself.
            </EmptyState>
          </Card>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {mine.map((q) => (
              <QuoteCard key={q.id} quote={q} onEdit={() => setEditing(q)} onDelete={() => void remove(q)} />
            ))}
          </ul>
        )}
      </section>

      {library.length > 0 && (
        <section aria-labelledby="library-quotes" className="space-y-3">
          <h2 id="library-quotes" className="text-lg font-semibold">
            From the library
          </h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {library.map((q) => (
              <QuoteCard key={q.id} quote={q} />
            ))}
          </ul>
        </section>
      )}

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing === 'new' ? 'Add a quote' : 'Edit quote'}</DialogTitle>
            <DialogDescription>Only you can see your library.</DialogDescription>
          </DialogHeader>
          {editing !== null && (
            <QuoteForm
              initial={editing === 'new' ? undefined : editing}
              onSaved={(quote) => {
                setData((d) => d && { ...d, quotes: editing === 'new' ? [quote, ...d.quotes] : d.quotes.map((q) => (q.id === quote.id ? quote : q)) })
                setEditing(null)
                toast.success('Saved')
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function QuoteCard({ quote, onEdit, onDelete }: { quote: Quote; onEdit?: () => void; onDelete?: () => void }) {
  return (
    <li>
      <Card size="sm" className="h-full">
        <CardContent className="flex h-full flex-col gap-3">
          <blockquote className="flex-1 font-serif text-lg leading-relaxed">“{quote.text}”</blockquote>
          <div className="flex items-end justify-between gap-2">
            <div className="min-w-0 text-sm text-muted-foreground">
              {quote.author && <p>— {quote.author}</p>}
              {quote.source && <p className="text-xs">{quote.source}</p>}
              <Badge variant="secondary" className="mt-1.5 bg-mental-soft text-mental-foreground">
                {categoryLabel(quote.category)}
              </Badge>
            </div>
            {onEdit && onDelete && (
              <div className="flex shrink-0">
                <Button variant="ghost" size="icon-sm" aria-label="Edit quote" onClick={onEdit}>
                  <Pencil className="text-muted-foreground" />
                </Button>
                <Button variant="ghost" size="icon-sm" aria-label="Delete quote" onClick={onDelete} className="hover:text-destructive">
                  <Trash2 className="text-muted-foreground" />
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </li>
  )
}

function QuoteForm({ initial, onSaved }: { initial?: Quote; onSaved: (q: Quote) => void }) {
  const [text, setText] = useState(initial?.text ?? '')
  const [author, setAuthor] = useState(initial?.author ?? '')
  const [category, setCategory] = useState<Category>(initial?.category ?? 'motivation')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!text.trim()) return setError('Write the quote first')
    setSaving(true)
    try {
      const body = { text, category, ...(author.trim() && { author }) }
      const data = initial ? await api.put<{ quote: Quote }>(`/quotes/${initial.id}`, body) : await api.post<{ quote: Quote }>('/quotes', body)
      onSaved(data.quote)
    } catch (err) {
      setError(errorMessage(err, 'Could not save'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="space-y-4" onSubmit={submit} noValidate>
      {error && <ErrorNotice>{error}</ErrorNotice>}
      <div className="space-y-2">
        <Label htmlFor="quote-text">Quote</Label>
        <Textarea id="quote-text" maxLength={500} autoFocus className="font-serif text-lg" value={text} onChange={(e) => setText(e.target.value)} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="quote-author">Who said it (optional)</Label>
          <Input id="quote-author" maxLength={100} value={author} onChange={(e) => setAuthor(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="category">Category</Label>
          <CategorySelect value={category} onChange={setCategory} />
        </div>
      </div>
      <Button type="submit" className="w-full" disabled={saving}>
        {saving && <Loader2 className="animate-spin" aria-hidden />} Save
      </Button>
    </form>
  )
}

// ---------- Videos ----------

function VideosTab() {
  const [videos, setVideos] = useState<Video[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<Category | null>(null)
  const [editing, setEditing] = useState<Video | 'new' | null>(null)

  useEffect(() => {
    api
      .get<{ videos: Video[] }>('/videos')
      .then((data) => setVideos(data.videos))
      .catch((err: unknown) => setError(errorMessage(err, 'Could not load videos')))
  }, [])

  async function remove(video: Video) {
    try {
      await api.delete(`/videos/${video.id}`)
      setVideos((list) => list?.filter((v) => v.id !== video.id) ?? null)
      toast.success('Video removed')
    } catch (err) {
      toast.error(errorMessage(err, 'Could not remove it'))
    }
  }

  if (error) return <ErrorNotice>{error}</ErrorNotice>
  if (!videos) return <ListSkeleton />

  const shown = videos.filter((v) => filter === null || v.category === filter)

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <CategoryFilter value={filter} onChange={setFilter} />
        <Button onClick={() => setEditing('new')}>
          <Plus aria-hidden /> Add a video
        </Button>
      </div>

      {shown.length === 0 ? (
        <Card>
          <EmptyState icon={Clapperboard} tone="mental" title={filter ? 'None in this category yet' : 'No videos saved yet'}>
            Paste a YouTube link to a talk or song that lifts you up.
          </EmptyState>
        </Card>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {shown.map((v) => (
            <li key={v.id}>
              <Card size="sm" className="h-full">
                <CardContent className="space-y-3">
                  <div className="aspect-video overflow-hidden rounded-xl bg-muted">
                    <iframe
                      src={embedUrl(v.videoId)}
                      title={v.title}
                      className="size-full"
                      loading="lazy"
                      allow="accelerometer; encrypted-media; gyroscope; picture-in-picture"
                      referrerPolicy="strict-origin-when-cross-origin"
                      allowFullScreen
                    />
                  </div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium">{v.title}</p>
                      {v.note && <p className="text-sm text-muted-foreground">{v.note}</p>}
                      <Badge variant="secondary" className="mt-1.5 bg-mental-soft text-mental-foreground">
                        {categoryLabel(v.category)}
                      </Badge>
                    </div>
                    <div className="flex shrink-0">
                      <Button variant="ghost" size="icon-sm" aria-label={`Edit ${v.title}`} onClick={() => setEditing(v)}>
                        <Pencil className="text-muted-foreground" />
                      </Button>
                      <Button variant="ghost" size="icon-sm" aria-label={`Delete ${v.title}`} onClick={() => void remove(v)} className="hover:text-destructive">
                        <Trash2 className="text-muted-foreground" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing === 'new' ? 'Add a video' : 'Edit video'}</DialogTitle>
            <DialogDescription>Videos play in YouTube's privacy-enhanced mode.</DialogDescription>
          </DialogHeader>
          {editing !== null && (
            <VideoForm
              initial={editing === 'new' ? undefined : editing}
              onSaved={(video) => {
                setVideos((list) => (editing === 'new' ? [video, ...(list ?? [])] : (list ?? []).map((v) => (v.id === video.id ? video : v))))
                setEditing(null)
                toast.success('Saved')
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function VideoForm({ initial, onSaved }: { initial?: Video; onSaved: (v: Video) => void }) {
  const [title, setTitle] = useState(initial?.title ?? '')
  const [url, setUrl] = useState(initial?.youtubeUrl ?? '')
  const [note, setNote] = useState(initial?.note ?? '')
  const [category, setCategory] = useState<Category>(initial?.category ?? 'motivation')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!title.trim()) return setError('Give the video a title')
    if (!url.trim()) return setError('Paste the YouTube link')
    setSaving(true)
    try {
      const body = { title, youtubeUrl: url, category, ...(note.trim() && { note }) }
      const data = initial ? await api.put<{ video: Video }>(`/videos/${initial.id}`, body) : await api.post<{ video: Video }>('/videos', body)
      onSaved(data.video)
    } catch (err) {
      setError(errorMessage(err, 'Could not save'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="space-y-4" onSubmit={submit} noValidate>
      {error && <ErrorNotice>{error}</ErrorNotice>}
      <div className="space-y-2">
        <Label htmlFor="video-url">YouTube link</Label>
        <Input id="video-url" type="url" inputMode="url" placeholder="https://youtu.be/…" maxLength={300} autoFocus value={url} onChange={(e) => setUrl(e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="video-title">Title</Label>
        <Input id="video-title" maxLength={150} value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="category">Category</Label>
        <CategorySelect value={category} onChange={setCategory} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="video-note">Note (optional)</Label>
        <Textarea id="video-note" maxLength={500} className="min-h-16" placeholder="Why it helps you" value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      <Button type="submit" className="w-full" disabled={saving}>
        {saving && <Loader2 className="animate-spin" aria-hidden />} Save
      </Button>
    </form>
  )
}

function ListSkeleton() {
  return (
    <div className="grid gap-3 sm:grid-cols-2" aria-busy="true">
      {[0, 1, 2, 3].map((i) => (
        <Skeleton key={i} className="h-36 rounded-2xl" />
      ))}
    </div>
  )
}
