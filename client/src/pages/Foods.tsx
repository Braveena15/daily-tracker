import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Loader2, Pencil, Plus, Search, Star, Trash2, UtensilsCrossed } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
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
import { FoodForm } from '@/components/FoodForm'
import { PageHeader } from '@/components/PageHeader'
import { EmptyState, ErrorNotice } from '@/components/StatusViews'
import { api } from '@/lib/api'
import { createBody, macroText, type Food, type FoodResponse, type FoodValues, type FoodsResponse } from '@/lib/foods'
import { kcal } from '@/lib/meals'
import { cn } from '@/lib/utils'

const errorMessage = (err: unknown, fallback: string) => (err instanceof Error ? err.message : fallback)

/** Favourites first, then A–Z. */
const sortFoods = (foods: Food[]) =>
  [...foods].sort((a, b) => Number(b.isFavourite) - Number(a.isFavourite) || a.name.localeCompare(b.name))

export function Foods() {
  const [foods, setFoods] = useState<Food[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState('')
  const [editing, setEditing] = useState<Food | 'new' | null>(null)
  const [deleting, setDeleting] = useState<Food | null>(null)

  useEffect(() => {
    api
      .get<FoodsResponse>('/foods?limit=200')
      .then((data) => setFoods(sortFoods(data.foods)))
      .catch((err: unknown) => setError(errorMessage(err, 'Could not load your foods')))
  }, [])

  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase()
    return q ? (foods ?? []).filter((f) => f.name.toLowerCase().includes(q)) : (foods ?? [])
  }, [foods, filter])

  function replace(food: Food) {
    setFoods((list) => sortFoods([...(list ?? []).filter((f) => f.id !== food.id), food]))
  }

  async function toggleFavourite(food: Food) {
    replace({ ...food, isFavourite: !food.isFavourite }) // show it straight away
    try {
      const data = await api.put<FoodResponse>(`/foods/${food.id}`, { isFavourite: !food.isFavourite })
      replace(data.food)
    } catch (err) {
      replace(food) // put it back
      toast.error(errorMessage(err, 'Could not update this food'))
    }
  }

  async function save(values: FoodValues) {
    if (editing === 'new') {
      const data = await api.post<FoodResponse>('/foods', createBody(values))
      replace(data.food)
      toast.success(`Added ${data.food.name}`)
    } else if (editing) {
      const data = await api.put<FoodResponse>(`/foods/${editing.id}`, values)
      replace(data.food)
      toast.success('Saved')
    }
    setEditing(null)
  }

  return (
    <>
      <PageHeader
        title="My Foods"
        description="Foods you eat often. Editing one doesn't change meals you've already logged."
      />

      <div className="space-y-4 md:space-y-6">
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="ghost" className="-ml-2 text-muted-foreground">
            <Link to="/meals">
              <ArrowLeft aria-hidden /> Meals
            </Link>
          </Button>
          <div className="relative min-w-0 flex-1 basis-48">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              type="search"
              aria-label="Filter your foods"
              placeholder="Filter"
              className="pl-9"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
          </div>
          <Button onClick={() => setEditing('new')}>
            <Plus aria-hidden /> New food
          </Button>
        </div>

        {error ? (
          <ErrorNotice>{error}</ErrorNotice>
        ) : !foods ? (
          <FoodsSkeleton />
        ) : foods.length === 0 ? (
          <Card>
            <EmptyState
              icon={UtensilsCrossed}
              title="No foods yet"
              action={
                <Button onClick={() => setEditing('new')}>
                  <Plus aria-hidden /> Add your first food
                </Button>
              }
            >
              Save the foods you eat often once, then add them to meals with a tap.
            </EmptyState>
          </Card>
        ) : shown.length === 0 ? (
          <Card>
            <EmptyState icon={Search} title="No matches">
              No foods match “{filter.trim()}”.
            </EmptyState>
          </Card>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {shown.map((food) => (
              <li key={food.id}>
                <Card size="sm" className="h-full">
                  <CardContent className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{food.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {food.servingDescription} ·{' '}
                        <span className="font-semibold text-foreground tabular-nums">{kcal(food.kcalPerServing)}</span>{' '}
                        kcal
                      </p>
                      {macroText(food) && <p className="text-xs text-muted-foreground">{macroText(food)}</p>}
                      <p className="mt-1 text-xs text-muted-foreground">
                        {food.timesUsed === 0 ? 'Not used yet' : `Used ${food.timesUsed} time${food.timesUsed === 1 ? '' : 's'}`}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={food.isFavourite ? `Remove ${food.name} from favourites` : `Add ${food.name} to favourites`}
                        aria-pressed={food.isFavourite}
                        onClick={() => void toggleFavourite(food)}
                      >
                        <Star className={cn(food.isFavourite ? 'fill-learning text-learning' : 'text-muted-foreground')} />
                      </Button>
                      <Button variant="ghost" size="icon-sm" aria-label={`Edit ${food.name}`} onClick={() => setEditing(food)}>
                        <Pencil className="text-muted-foreground" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Delete ${food.name}`}
                        onClick={() => setDeleting(food)}
                        className="hover:bg-destructive/10 hover:text-destructive"
                      >
                        <Trash2 className="text-muted-foreground" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing === 'new' ? 'New food' : 'Edit food'}</DialogTitle>
            <DialogDescription>Calories and macros are for one serving.</DialogDescription>
          </DialogHeader>
          {editing !== null && (
            <FoodForm
              key={editing === 'new' ? 'new' : editing.id}
              initial={editing === 'new' ? undefined : editing}
              submitLabel={editing === 'new' ? 'Add food' : 'Save changes'}
              onCancel={() => setEditing(null)}
              onSubmit={save}
            />
          )}
        </DialogContent>
      </Dialog>

      <DeleteDialog
        food={deleting}
        onClose={() => setDeleting(null)}
        onDeleted={(food) => {
          setFoods((list) => (list ?? []).filter((f) => f.id !== food.id))
          toast.success(`Deleted ${food.name}`)
        }}
      />
    </>
  )
}

function DeleteDialog({
  food,
  onClose,
  onDeleted,
}: {
  food: Food | null
  onClose: () => void
  onDeleted: (food: Food) => void
}) {
  const [busy, setBusy] = useState(false)

  async function confirm() {
    if (!food) return
    setBusy(true)
    try {
      await api.delete(`/foods/${food.id}`)
      onDeleted(food)
      onClose()
    } catch (err) {
      toast.error(errorMessage(err, 'Could not delete this food'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={food !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Delete {food?.name}?</DialogTitle>
          <DialogDescription>
            It will be removed from your foods. Meals you've already logged with it stay exactly as they are.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Keep it
          </Button>
          <Button variant="destructive" onClick={() => void confirm()} disabled={busy}>
            {busy && <Loader2 className="animate-spin" aria-hidden />}
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function FoodsSkeleton() {
  return (
    <div className="grid gap-3 sm:grid-cols-2" aria-busy="true" aria-label="Loading foods">
      {Array.from({ length: 6 }, (_, i) => (
        <Card key={i} size="sm">
          <CardContent className="space-y-2">
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-3 w-20" />
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
