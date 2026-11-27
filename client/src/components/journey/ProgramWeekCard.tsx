// Weekly review → the program part: "Week 3 of 15", this week against the baseline (and week 1 for
// mood), and a grid of which daily-plan targets were hit each day.
import { Link } from 'react-router-dom'
import { Check, Minus, Route } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { IconBubble } from '@/components/IconBubble'
import { TARGET_LABELS, type ProgramWeek } from '@/lib/program'
import { cn } from '@/lib/utils'

const weekday = (date: string) => new Date(`${date}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' })
const signed = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : '±'}${Math.abs(n).toFixed(1)}`

export function ProgramWeekCard({ program }: { program: ProgramWeek }) {
  const b = program.baseline
  const compare: string[] = []
  if (b.weightChange !== null) compare.push(`Weight ${signed(b.weightChange)} kg since you started (${b.weightKg} → ${b.weekWeightKg} kg)`)
  if (b.firstWeekMood !== null && b.weekMood !== null) compare.push(`Mood ${b.firstWeekMood} in week 1 → ${b.weekMood} this week`)

  return (
    <Card>
      <CardHeader className="flex items-center gap-3">
        <IconBubble icon={Route} />
        <div className="min-w-0">
          <CardTitle className="text-lg font-semibold">
            Week {program.week} of {program.of}
          </CardTitle>
          <CardDescription>
            <Link to="/journey" className="hover:underline">
              {program.name}
            </Link>
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {compare.length > 0 && (
          <ul className="space-y-1 text-sm">
            {compare.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        )}
        {program.targets.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[20rem] text-sm">
              <caption className="pb-2 text-left text-sm text-muted-foreground">Daily plan: targets hit</caption>
              <thead>
                <tr className="text-xs text-muted-foreground">
                  <th scope="col" className="py-1 text-left font-normal">
                    <span className="sr-only">Target</span>
                  </th>
                  {program.days.map((d) => (
                    <th key={d.date} scope="col" className="py-1 text-center font-normal">
                      {weekday(d.date)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {program.targets.map((t) => (
                  <tr key={t} className="border-t">
                    <th scope="row" className="py-1.5 text-left font-medium">
                      {TARGET_LABELS[t]}
                    </th>
                    {program.days.map((d) => {
                      const hit = d.hit[t] === true
                      return (
                        <td key={d.date} className="py-1.5 text-center">
                          <span className={cn('inline-grid size-6 place-items-center rounded-full', hit ? 'bg-primary text-primary-foreground' : 'text-muted-foreground/60')}>
                            {hit ? <Check className="size-3.5" aria-label="hit" /> : <Minus className="size-3.5" aria-label="not hit" />}
                          </span>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
