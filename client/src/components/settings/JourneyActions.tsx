// Settings → Data → My Journey: end the active program, or end it and start a new one (the same
// flow as on My Journey; history and reports are kept).
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Flag, Rocket, Route } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { IconBubble } from '@/components/IconBubble'
import { EndProgramDialog } from '@/components/journey/EndProgram'
import { useFetch } from '@/hooks/useFetch'
import type { ActiveProgramResponse } from '@/lib/program'

export function JourneyActions() {
  const [version, setVersion] = useState(0)
  const { data } = useFetch<ActiveProgramResponse>(`/programs/active?v=${version}`)
  const [ending, setEnding] = useState<'end' | 'restart' | null>(null)
  const program = data?.program
  if (!data) return null

  return (
    <Card>
      <CardHeader>
        <div className="flex min-w-0 items-center gap-3">
          <IconBubble icon={Route} />
          <div className="min-w-0">
            <CardTitle className="text-lg font-semibold">My Journey</CardTitle>
            <CardDescription>{program ? `${program.name}: day ${program.clock.dayNumber} of ${program.lengthDays}` : 'No active program right now.'}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        {program && program.clock.phase === 'running' ? (
          <>
            <Button type="button" variant="outline" onClick={() => setEnding('end')}>
              <Flag aria-hidden /> End this program
            </Button>
            <Button type="button" variant="ghost" onClick={() => setEnding('restart')}>
              <Rocket aria-hidden /> End & start a new one
            </Button>
          </>
        ) : (
          <Button asChild variant="outline">
            <Link to="/journey">Open My Journey</Link>
          </Button>
        )}
      </CardContent>
      {program && ending && (
        <EndProgramDialog program={program} open startNew={ending === 'restart'} onOpenChange={(o) => !o && setEnding(null)} onEnded={() => setVersion((v) => v + 1)} />
      )}
    </Card>
  )
}
