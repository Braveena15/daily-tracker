import { useState } from 'react'
import { Link } from 'react-router-dom'
import { BookHeart, Lock, PenLine, Star } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { PageHeader } from '@/components/PageHeader'
import { EmptyState, ErrorNotice } from '@/components/StatusViews'
import { SupportButton } from '@/components/mind/Support'
import { useFetch } from '@/hooks/useFetch'
import { relativeDay, todayInTimezone } from '@/lib/dates'
import type { DiaryListResponse } from '@/lib/mind'
import { cn } from '@/lib/utils'

const chip =
  'touch-hit h-9 overflow-visible rounded-full px-3.5 text-sm transition-all outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-95'

export function Diary() {
  const [tag, setTag] = useState<string | null>(null)
  const [favourites, setFavourites] = useState(false)
  const params = new URLSearchParams({ ...(tag && { tag }), ...(favourites && { favourites: 'true' }) })
  const { data, error } = useFetch<DiaryListResponse>(`/diary?${params}`, 'Could not load your diary')
  const today = todayInTimezone()
  const filtered = tag !== null || favourites

  return (
    <>
      <PageHeader
        title="Diary"
        action={
          <Button asChild>
            <Link to="/diary/new">
              <PenLine aria-hidden /> Write
            </Link>
          </Button>
        }
      />

      <div className="space-y-4 md:space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Lock className="size-4" aria-hidden /> Only you can read your entries — they're encrypted before they're stored.
          </p>
          <SupportButton className="self-start" />
        </div>

        {/* Filters: tags (the text itself is encrypted, so it can't be searched) and favourites */}
        {data && (data.tags.length > 0 || data.entries.some((e) => e.isFavourite) || filtered) && (
          <div className="flex flex-wrap gap-2" role="group" aria-label="Filter entries">
            <Badge asChild variant="outline" className={cn(chip, !filtered && 'border-mental/40 bg-mental-soft text-mental-foreground')}>
              <button type="button" onClick={() => { setTag(null); setFavourites(false) }} aria-pressed={!filtered}>
                All
              </button>
            </Badge>
            <Badge asChild variant="outline" className={cn(chip, favourites && 'border-mental/40 bg-mental-soft text-mental-foreground')}>
              <button type="button" onClick={() => setFavourites((f) => !f)} aria-pressed={favourites}>
                <Star className={cn(favourites && 'fill-current')} aria-hidden /> Favourites
              </button>
            </Badge>
            {data.tags.map((t) => (
              <Badge key={t} asChild variant="outline" className={cn(chip, tag === t && 'border-mental/40 bg-mental-soft text-mental-foreground')}>
                <button type="button" onClick={() => setTag(tag === t ? null : t)} aria-pressed={tag === t}>
                  #{t}
                </button>
              </Badge>
            ))}
          </div>
        )}

        {error ? (
          <ErrorNotice>{error}</ErrorNotice>
        ) : !data ? (
          <div className="space-y-3" aria-busy="true">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-28 rounded-2xl" />
            ))}
          </div>
        ) : data.entries.length === 0 ? (
          <Card>
            <EmptyState
              icon={BookHeart}
              tone="mental"
              title={filtered ? 'No entries match' : 'Your diary is waiting'}
              action={
                !filtered && (
                  <Button asChild>
                    <Link to="/diary/new">
                      <PenLine aria-hidden /> Write your first entry
                    </Link>
                  </Button>
                )
              }
            >
              {filtered ? 'Try another tag, or show all entries.' : 'A few honest lines is plenty. There\'s no right way to do this.'}
            </EmptyState>
          </Card>
        ) : (
          <ul className="space-y-3">
            {data.entries.map((entry) => (
              <li key={entry.id}>
                <Link
                  to={`/diary/${entry.id}`}
                  className="block space-y-2 surface p-4 transition-all outline-none hover:-translate-y-0.5 hover:ring-mental/40 focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground">{relativeDay(entry.date, today)}</p>
                      <p className="truncate font-heading text-lg font-semibold">{entry.title || 'Untitled'}</p>
                    </div>
                    {entry.isFavourite && <Star className="size-4 shrink-0 fill-learning text-learning" aria-label="Favourite" />}
                  </div>
                  <p className="line-clamp-2 font-serif text-muted-foreground">{entry.preview}</p>
                  {entry.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {entry.tags.map((t) => (
                        <Badge key={t} variant="secondary" className="bg-mental-soft text-mental-foreground">
                          #{t}
                        </Badge>
                      ))}
                    </div>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  )
}
