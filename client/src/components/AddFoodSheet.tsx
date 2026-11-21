import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Plus, Search, Star, UtensilsCrossed } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { FoodForm } from '@/components/FoodForm'
import { ServingsStepper } from '@/components/ServingsStepper'
import { EmptyState, ErrorNotice } from '@/components/StatusViews'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { api } from '@/lib/api'
import { createBody, macroText, type Food, type FoodResponse, type FoodsResponse } from '@/lib/foods'
import { itemKcal, kcal, type MealItem, type MealType } from '@/lib/meals'
import { cn } from '@/lib/utils'

const errorMessage = (err: unknown, fallback: string) => (err instanceof Error ? err.message : fallback)

/** A bottom sheet on phones, a side panel on desktop, for adding one food to a meal. */
export function AddFoodSheet({
  open,
  onOpenChange,
  mealType,
  mealLabel,
  onAdd,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  mealType: MealType
  mealLabel: string
  onAdd: (item: MealItem) => void
}) {
  const desktop = useMediaQuery('(min-width: 768px)')

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={desktop ? 'right' : 'bottom'}
        className={cn(
          'gap-0 p-0',
          desktop ? 'w-full sm:max-w-md' : 'max-h-[88dvh] rounded-t-3xl pb-[env(safe-area-inset-bottom)]',
        )}
      >
        <SheetHeader className="border-b px-5 pt-5 pb-4">
          <SheetTitle className="text-xl font-semibold">Add to {mealLabel}</SheetTitle>
          <SheetDescription>Pick a food from your list or create a new one.</SheetDescription>
        </SheetHeader>
        {/* Only mounted while open, so it starts fresh each time */}
        {open && (
          <AddFoodBody
            mealType={mealType}
            mealLabel={mealLabel}
            onAdd={(item) => {
              onAdd(item)
              onOpenChange(false)
            }}
          />
        )}
      </SheetContent>
    </Sheet>
  )
}

type View = { kind: 'pick' } | { kind: 'create' } | { kind: 'servings'; food: Food }

function AddFoodBody({
  mealType,
  mealLabel,
  onAdd,
}: {
  mealType: MealType
  mealLabel: string
  onAdd: (item: MealItem) => void
}) {
  const [view, setView] = useState<View>({ kind: 'pick' })
  const [query, setQuery] = useState('')

  if (view.kind === 'create') {
    return (
      <div className="overflow-y-auto p-5">
        <BackButton onClick={() => setView({ kind: 'pick' })} />
        <h3 className="mb-4 text-lg font-semibold">New food</h3>
        <FoodForm
          initialName={query.trim()}
          submitLabel="Save and continue"
          onCancel={() => setView({ kind: 'pick' })}
          onSubmit={async (values) => {
            const { food } = await api.post<FoodResponse>('/foods', createBody(values))
            setView({ kind: 'servings', food })
          }}
        />
      </div>
    )
  }

  if (view.kind === 'servings') {
    return (
      <ServingsView
        food={view.food}
        mealLabel={mealLabel}
        onBack={() => setView({ kind: 'pick' })}
        onAdd={(servings) => {
          const { food } = view
          onAdd({
            mealType,
            foodId: food.id,
            name: food.name,
            servingDescription: food.servingDescription,
            servings,
            kcalPerServing: food.kcalPerServing,
            ...(food.proteinG != null && { proteinG: food.proteinG }),
            ...(food.carbsG != null && { carbsG: food.carbsG }),
            ...(food.fatG != null && { fatG: food.fatG }),
            ...(food.fiberG != null && { fiberG: food.fiberG }),
          })
        }}
      />
    )
  }

  return (
    <PickFood
      query={query}
      onQueryChange={setQuery}
      onPick={(food) => setView({ kind: 'servings', food })}
      onCreate={() => setView({ kind: 'create' })}
    />
  )
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <Button type="button" variant="ghost" size="sm" className="-ml-2 mb-2 text-muted-foreground" onClick={onClick}>
      <ArrowLeft aria-hidden /> Back
    </Button>
  )
}

function PickFood({
  query,
  onQueryChange,
  onPick,
  onCreate,
}: {
  query: string
  onQueryChange: (q: string) => void
  onPick: (food: Food) => void
  onCreate: () => void
}) {
  const [library, setLibrary] = useState<Food[] | null>(null)
  const [results, setResults] = useState<{ q: string; foods: Food[] } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const q = query.trim()

  // The default list: favourites first, then most recently used
  useEffect(() => {
    api
      .get<FoodsResponse>('/foods?limit=100')
      .then((data) => setLibrary(data.foods))
      .catch((err: unknown) => setError(errorMessage(err, 'Could not load your foods')))
  }, [])

  // Search as you type, after a short pause
  useEffect(() => {
    if (!q) return
    const timer = setTimeout(() => {
      api
        .get<FoodsResponse>(`/foods?limit=30&q=${encodeURIComponent(q)}`)
        .then((data) => setResults({ q, foods: data.foods }))
        .catch((err: unknown) => setError(errorMessage(err, 'Search failed')))
    }, 250)
    return () => clearTimeout(timer)
  }, [q])

  const favourites = useMemo(() => library?.filter((f) => f.isFavourite) ?? [], [library])
  const recent = useMemo(
    () =>
      [...(library ?? [])].sort(
        (a, b) => (b.lastUsedAt ?? b.createdAt).localeCompare(a.lastUsedAt ?? a.createdAt),
      ),
    [library],
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="space-y-3 px-5 pt-4">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            type="search"
            aria-label="Search your foods"
            placeholder="Search your foods"
            className="pl-9"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
          />
        </div>
        <Button type="button" variant="outline" className="w-full justify-start border-dashed" onClick={onCreate}>
          <Plus aria-hidden />
          {q ? `Create “${q}”` : 'Create new food'}
        </Button>
        {error && <ErrorNotice>{error}</ErrorNotice>}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 pt-3 pb-5">
        {q ? (
          results?.q !== q ? (
            <ListSkeleton />
          ) : results.foods.length === 0 ? (
            <EmptyState icon={Search} title="No matches">
              Nothing called “{q}” yet. Create it above and it'll be here next time.
            </EmptyState>
          ) : (
            <FoodList foods={results.foods} onPick={onPick} />
          )
        ) : !library ? (
          <ListSkeleton />
        ) : library.length === 0 ? (
          <EmptyState icon={UtensilsCrossed} title="Your food list is empty">
            Create the foods you eat often once, then add them to meals with a tap.
          </EmptyState>
        ) : (
          <Tabs defaultValue={favourites.length > 0 ? 'favourites' : 'recent'}>
            <TabsList className="mb-3 h-10 w-full rounded-xl bg-muted p-1">
              <TabsTrigger value="favourites" className="rounded-lg">
                <Star aria-hidden /> Favourites
              </TabsTrigger>
              <TabsTrigger value="recent" className="rounded-lg">
                Recent
              </TabsTrigger>
            </TabsList>
            <TabsContent value="favourites">
              {favourites.length === 0 ? (
                <EmptyState icon={Star} title="No favourites yet">
                  Star a food when you create it, or on the My Foods page.
                </EmptyState>
              ) : (
                <FoodList foods={favourites} onPick={onPick} />
              )}
            </TabsContent>
            <TabsContent value="recent">
              <FoodList foods={recent} onPick={onPick} />
            </TabsContent>
          </Tabs>
        )}
      </div>
    </div>
  )
}

function FoodList({ foods, onPick }: { foods: Food[]; onPick: (food: Food) => void }) {
  return (
    <ul className="space-y-1.5">
      {foods.map((food) => (
        <li key={food.id}>
          <button
            type="button"
            onClick={() => onPick(food)}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-all outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-[0.99]"
          >
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5 font-medium">
                <span className="truncate">{food.name}</span>
                {food.isFavourite && (
                  <Star className="size-3.5 shrink-0 fill-learning text-learning" aria-label="Favourite" />
                )}
              </span>
              <span className="block truncate text-xs text-muted-foreground">
                {food.servingDescription}
                {macroText(food) && ` · ${macroText(food)}`}
              </span>
            </span>
            <span className="shrink-0 text-sm font-semibold tabular-nums">
              {kcal(food.kcalPerServing)} <span className="font-normal text-muted-foreground">kcal</span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  )
}

function ListSkeleton() {
  return (
    <div className="space-y-3 pt-1" aria-busy="true" aria-label="Loading foods">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="flex items-center justify-between gap-3 px-3">
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-1/3" />
          </div>
          <Skeleton className="h-4 w-14" />
        </div>
      ))}
    </div>
  )
}

function ServingsView({
  food,
  mealLabel,
  onBack,
  onAdd,
}: {
  food: Food
  mealLabel: string
  onBack: () => void
  onAdd: (servings: number) => void
}) {
  const [servings, setServings] = useState(1)

  return (
    <div className="flex flex-col gap-5 overflow-y-auto p-5">
      <div>
        <BackButton onClick={onBack} />
        <h3 className="text-xl font-semibold">{food.name}</h3>
        <p className="text-sm text-muted-foreground">
          {food.servingDescription} · {kcal(food.kcalPerServing)} kcal
          {macroText(food) && ` · ${macroText(food)}`}
        </p>
      </div>

      <div className="flex flex-col items-center gap-3 rounded-2xl bg-muted/60 p-5">
        <span className="text-sm font-medium text-muted-foreground">Servings</span>
        <ServingsStepper value={servings} onChange={setServings} size="lg" className="bg-card" />
        <p className="font-heading text-3xl font-semibold tabular-nums">
          {kcal(itemKcal({ servings, kcalPerServing: food.kcalPerServing }))}{' '}
          <span className="font-sans text-base font-normal text-muted-foreground">kcal</span>
        </p>
      </div>

      <Button type="button" size="lg" onClick={() => onAdd(servings)}>
        <Plus aria-hidden /> Add to {mealLabel}
      </Button>
    </div>
  )
}
