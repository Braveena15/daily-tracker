// /journey/:id/report — what a program achieved: before vs after (weight, measurements, ratings,
// photos), totals, the best week, consistency, streaks, what mattered most and the final
// reflection. A live preview while the program is still going; "Download PDF" makes a PDF in the
// browser. An ended-early report covers only the days completed, and its wording is warm.
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Download, Quote, Sparkles, Star } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { PageHeader } from '@/components/PageHeader'
import { ErrorNotice } from '@/components/StatusViews'
import { RatingRow } from '@/components/journey/RatingRow'
import { AiMessageCard } from '@/components/ai/AiMessageCard'
import { aiRequests } from '@/lib/ai'
import { useFetch } from '@/hooks/useFetch'
import { formatDate, formatLongDate } from '@/lib/dates'
import { END_REASON_LABELS, photoUrl, type ProgramReport } from '@/lib/program'

export function JourneyReport() {
  const { id } = useParams()
  const { data: r, error } = useFetch<ProgramReport>(`/programs/${id}/report`)
  const [busy, setBusy] = useState(false)

  async function downloadPdf() {
    if (!r) return
    setBusy(true)
    try {
      const { exportProgramPdf } = await import('@/lib/programPdf')
      const blob = await exportProgramPdf(r)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${r.name.replace(/[^\w -]/g, '').trim() || 'journey'} report.pdf`
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not make the PDF')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <PageHeader
        title={r?.title ?? 'Your report'}
        back={{ to: '/journey', label: 'My Journey' }}
        action={
          r && (
            <Button type="button" variant="outline" size="sm" loading={busy} disabled={busy} onClick={() => void downloadPdf()}>
              <Download aria-hidden /> Download PDF
            </Button>
          )
        }
      />
      {error ? (
        <ErrorNotice>{error}</ErrorNotice>
      ) : !r ? (
        <Skeleton className="h-96 w-full rounded-2xl" />
      ) : (
        <>
          <AiMessageCard title="A note on your journey" request={aiRequests.program(String(id))} autoLoad={false} startLabel="Write me a summary" className="mb-4 max-w-3xl md:mb-6" />
          <Report r={r} id={String(id)} />
        </>
      )}
    </>
  )
}

function Report({ r, id }: { r: ProgramReport; id: string }) {
  const t = r.stats.totals
  const tiles: [string, string][] = [
    ['Days logged', `${r.stats.daysLogged} of ${r.stats.daysCompleted}`],
    ['Consistency', `${r.stats.consistency}%`],
    ['Longest streak', `${r.stats.streaks.longest} days`],
    ['Workouts', `${t.workouts}`],
    ['Learning', `${t.learningHours} h`],
    ['Water', `${t.waterLitres} L`],
    ['Average sleep', t.avgSleep !== null ? `${t.avgSleep} h` : '—'],
    ['Average mood', t.avgMood !== null ? `${t.avgMood}/10` : '—'],
  ]
  const ratings = r.ratings.filter((x) => x.before !== null || x.latest !== null || x.goal !== null)
  const measurements = r.measurements.filter((m) => m.before !== null || m.latest !== null)
  const pairs = Math.max(r.photos.before.length, r.photos.after.length)

  return (
    <div className="max-w-3xl space-y-4 md:space-y-6">
      <Card>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm text-muted-foreground">
              {r.name} · {formatLongDate(r.range.from)} – {formatLongDate(r.range.to)}
            </p>
            {r.status === 'active' && <Badge variant="secondary">Live preview</Badge>}
            {r.endReason && <Badge variant="outline">{END_REASON_LABELS[r.endReason]}</Badge>}
          </div>
          <p className="text-lg">
            {r.status === 'ended_early'
              ? `You showed up for ${r.stats.daysLogged} of ${r.stats.daysCompleted} days. Every day you showed up counts.`
              : r.status === 'active'
                ? `${r.stats.daysLogged} days logged so far — keep going.`
                : `You logged ${r.stats.daysLogged} of ${r.lengthDays} days. That's something to be proud of.`}
          </p>
          {r.aiSummary && (
            <p className="flex gap-2 rounded-xl bg-muted/60 p-3 text-sm">
              <Sparkles className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
              {r.aiSummary}
            </p>
          )}
        </CardContent>
      </Card>

      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {tiles.map(([k, v]) => (
          <div key={k} className="surface p-3">
            <dt className="text-xs text-muted-foreground">{k}</dt>
            <dd className="font-heading text-xl font-semibold tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>

      {r.improvements.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-semibold">What changed</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-wrap gap-2">
              {r.improvements.map((i) => (
                <li key={i} className="rounded-full bg-primary/10 px-3 py-1 text-sm font-medium text-primary">
                  {i}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Before and {r.status === 'active' ? 'now' : 'after'}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {(r.weight.before !== null || r.weight.latest !== null) && (
            <div className="space-y-1.5">
              <p className="flex justify-between gap-2 text-sm">
                <span className="font-medium">Weight</span>
                <span className="text-muted-foreground tabular-nums">
                  {r.weight.before ?? '—'} → {r.weight.latest ?? '—'} kg{r.weight.goal !== null && ` (goal ${r.weight.goal})`}
                </span>
              </p>
              {r.weight.progress !== null && (
                <>
                  <Progress value={r.weight.progress} aria-label={`${r.weight.progress}% of the way to your goal weight`} className="h-2" />
                  <p className="text-xs text-muted-foreground">{r.weight.progress}% of the way to your goal</p>
                </>
              )}
            </div>
          )}
          {measurements.length > 0 && (
            <table className="w-full text-sm">
              <caption className="sr-only">Measurements</caption>
              <thead className="text-xs text-muted-foreground">
                <tr>
                  <th className="py-1 text-left font-normal">Measurement</th>
                  <th className="py-1 text-right font-normal">Before</th>
                  <th className="py-1 text-right font-normal">After</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {measurements.map((m) => (
                  <tr key={m.key} className="border-t">
                    <td className="py-1.5">{m.key.replace('Cm', '').replace(/^./, (c) => c.toUpperCase())}</td>
                    <td className="py-1.5 text-right">{m.before ?? '—'} cm</td>
                    <td className="py-1.5 text-right">{m.latest ?? '—'} cm</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {ratings.length > 0 && (
            <ul className="space-y-3">
              {ratings.map((row) => (
                <RatingRow key={row.key} row={row} />
              ))}
            </ul>
          )}
          {r.latest.source === 'entries' && <p className="text-xs text-muted-foreground">"After" comes from your most recent entries (no final check-in).</p>}
        </CardContent>
      </Card>

      {pairs > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-semibold">Photos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3 text-center text-xs text-muted-foreground">
              <span>Before</span>
              <span>{r.photos.afterFrom === 'midpoint' ? 'Halfway' : 'After'}</span>
            </div>
            {Array.from({ length: pairs }, (_, i) => (
              <div key={i} className="grid grid-cols-2 gap-3">
                {[r.photos.before[i], r.photos.after[i]].map((fileId, col) =>
                  fileId ? (
                    <img key={col} src={photoUrl(fileId)} alt={`${col === 0 ? 'Before' : 'After'} photo ${i + 1}`} className="aspect-[3/4] w-full rounded-xl object-cover" loading="lazy" />
                  ) : (
                    <div key={col} className="aspect-[3/4] rounded-xl bg-muted" />
                  ),
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Week by week</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="divide-y text-sm">
            {r.stats.weeks.map((w) => (
              <li key={w.week} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
                <span className="w-28 font-medium">
                  Week {w.week}
                  {w.partial && <span className="ml-1 text-xs font-normal text-muted-foreground">(partial)</span>}
                  {r.stats.bestWeek?.week === w.week && <Star className="ml-1 inline size-3.5 fill-current text-primary" aria-label="best week" />}
                </span>
                <span className="text-muted-foreground">
                  {formatDate(w.from)} – {formatDate(w.to)}
                </span>
                <span className="ml-auto tabular-nums">
                  {w.daysLogged}/{w.days} days{w.avgOverall !== null && ` · score ${Math.round(w.avgOverall)}`}
                </span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {r.stats.habits.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-semibold">Daily habits</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3">
              {r.stats.habits.map((h) => (
                <li key={h.id} className="space-y-1">
                  <p className="flex justify-between gap-2 text-sm">
                    <span className="font-medium">{h.label}</span>
                    <span className="text-muted-foreground tabular-nums">
                      {h.daysDone} days · {h.percent}%
                    </span>
                  </p>
                  <Progress value={h.percent} aria-label={`${h.label}: ${h.percent}%`} className="h-2" />
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {(r.recurringPurposes.length > 0 || r.topValues.length > 0) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-semibold">What mattered most</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {r.recurringPurposes.length > 0 && (
              <ul className="space-y-1">
                {r.recurringPurposes.map((p) => (
                  <li key={p.text} className="flex justify-between gap-3">
                    <span>{p.text}</span>
                    <span className="shrink-0 text-muted-foreground">{p.days} days</span>
                  </li>
                ))}
              </ul>
            )}
            {r.topValues.length > 0 && <p className="text-muted-foreground">Values you chose most: {r.topValues.map((v) => v.value).join(', ')}</p>}
          </CardContent>
        </Card>
      )}

      {r.reflection && (
        <Card>
          <CardContent className="flex gap-3">
            <Quote className="size-5 shrink-0 text-muted-foreground" aria-hidden />
            <div>
              <p className="text-sm font-medium">My final reflection</p>
              <p className="mt-1 whitespace-pre-wrap">{r.reflection}</p>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-wrap gap-2">
        <Button asChild variant="outline">
          <Link to="/journey/history">All my journeys</Link>
        </Button>
        {r.status !== 'active' && (
          <Button asChild>
            <Link to={`/journey/new?from=${encodeURIComponent(id)}`}>Start a new journey</Link>
          </Button>
        )}
      </div>
    </div>
  )
}
