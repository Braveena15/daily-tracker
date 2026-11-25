// "This week" on the Expenses page: the 7 days ending on the chosen day (the same weeks as the
// Weekly review): total, a bar per day, categories, the biggest expense, vs last week and the budget.
import { ArrowDown, ArrowUp, Trophy } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import { Card, CardContent } from '@/components/ui/card'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'
import { Progress } from '@/components/ui/progress'
import { IconBubble } from '@/components/IconBubble'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { compact, niceAxis } from '@/lib/chartAxis'
import { formatDate } from '@/lib/dates'
import { CATEGORY, money, moneyShort, type ExpenseSummary } from '@/lib/expenses'
import { tooltipDate, weekdayShort } from '@/lib/progress'
import { cn } from '@/lib/utils'

const config = { total: { label: 'Spent', color: 'var(--primary)' } } satisfies ChartConfig

export function WeekView({ summary, today }: { summary: ExpenseSummary; today: string }) {
  const animate = !useMediaQuery('(prefers-reduced-motion: reduce)')
  const s = summary
  const yAxis = niceAxis({ max: Math.max(1, ...s.perDay.map((d) => d.total)), format: compact })
  const up = s.change > 0

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-3">
          <div>
            <p className="text-sm text-muted-foreground">
              {formatDate(s.from, today)} – {formatDate(s.to, today)}
            </p>
            <p className="font-heading text-3xl font-semibold tabular-nums sm:text-4xl">{money(s.total, s.currency)}</p>
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
              {s.count} {s.count === 1 ? 'expense' : 'expenses'}
              {s.previous.total > 0 || s.total > 0 ? (
                <span className={cn('inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-medium tabular-nums', 'bg-muted text-muted-foreground')}>
                  {s.change === 0 ? (
                    'Same as last week'
                  ) : (
                    <>
                      {up ? <ArrowUp className="size-3.5" aria-hidden /> : <ArrowDown className="size-3.5" aria-hidden />}
                      {moneyShort(Math.abs(s.change), s.currency)} {up ? 'more' : 'less'} than last week
                    </>
                  )}
                </span>
              ) : null}
            </p>
          </div>

          {s.budget !== null && s.budgetUsedPercent !== null && (
            <div className="space-y-1.5">
              <div className="flex justify-between text-sm">
                <span>Weekly budget {moneyShort(s.budget, s.currency)}</span>
                <span className="tabular-nums">{s.budgetUsedPercent}% used</span>
              </div>
              <Progress value={Math.min(100, s.budgetUsedPercent)} aria-label={`${s.budgetUsedPercent}% of the weekly budget used`} />
              {s.budgetUsedPercent > 100 && <p className="text-xs text-muted-foreground">Over the budget by {moneyShort(s.total - s.budget, s.currency)}.</p>}
            </div>
          )}

          <ChartContainer
            config={config}
            className="aspect-auto h-48 w-full"
            summary={`Spending by day: ${s.perDay.map((d) => `${tooltipDate(d.date)} ${money(d.total, s.currency)}`).join('; ')}.`}
          >
            <BarChart data={s.perDay} margin={{ left: 0, right: 8, top: 8 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={8} interval={0} tickFormatter={weekdayShort} />
              <YAxis tickLine={false} axisLine={false} tickMargin={8} width={yAxis.width} domain={yAxis.domain} ticks={yAxis.ticks} tickFormatter={yAxis.format} />
              <ChartTooltip
                cursor={false}
                content={
                  <ChartTooltipContent
                    hideIndicator
                    labelFormatter={(_, p) => tooltipDate(String(p[0]?.payload.date))}
                    formatter={(value) => <span className="font-medium tabular-nums">{money(Number(value), s.currency)}</span>}
                  />
                }
              />
              <Bar dataKey="total" fill="var(--color-total)" radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={animate} />
            </BarChart>
          </ChartContainer>
        </CardContent>
      </Card>

      {s.perCategory.length > 0 && (
        <Card>
          <CardContent className="space-y-2">
            <h3 className="font-semibold">By category</h3>
            <ul className="space-y-2">
              {s.perCategory.map((c) => {
                const meta = CATEGORY[c.category]
                return (
                  <li key={c.category} className="space-y-1">
                    <div className="flex items-center gap-2 text-sm">
                      <meta.icon className="size-4 text-muted-foreground" aria-hidden />
                      <span className="flex-1">{meta.label}</span>
                      <span className="font-medium tabular-nums">{money(c.total, s.currency)}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted" aria-hidden>
                      <div className="h-full rounded-full bg-primary" style={{ width: `${s.total ? (c.total / s.total) * 100 : 0}%` }} />
                    </div>
                  </li>
                )
              })}
            </ul>
          </CardContent>
        </Card>
      )}

      {s.biggest && (
        <Card size="sm">
          <CardContent className="flex items-center gap-3">
            <IconBubble icon={Trophy} tone="learning" />
            <div className="min-w-0 flex-1">
              <p className="text-sm text-muted-foreground">Biggest expense</p>
              <p className="truncate font-medium">
                {s.biggest.title} · {formatDate(s.biggest.date, today)}
              </p>
            </div>
            <p className="shrink-0 font-semibold tabular-nums">{money(s.biggest.amount, s.currency)}</p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
