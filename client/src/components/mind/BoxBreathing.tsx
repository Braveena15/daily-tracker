import { useEffect, useRef, useState } from 'react'
import { Pause, Play } from 'lucide-react'
import { Button } from '@/components/ui/button'

const SIDE_SECONDS = 4
const PHASES = ['Breathe in', 'Hold', 'Breathe out', 'Hold'] as const
const TOTAL_SECONDS = 64 // four full rounds of 4-4-4-4, about a minute

/** Where the dot is on the square (0–1 on each axis) after `t` seconds of a 16-second round. */
function dotPosition(t: number): { x: number; y: number } {
  const side = Math.floor(t / SIDE_SECONDS) % 4
  const p = (t % SIDE_SECONDS) / SIDE_SECONDS
  // Up the left side (in), across the top (hold), down the right (out), back along the bottom (hold)
  if (side === 0) return { x: 0, y: 1 - p }
  if (side === 1) return { x: p, y: 0 }
  if (side === 2) return { x: 1, y: p }
  return { x: 1 - p, y: 1 }
}

/** The inner square grows while breathing in, stays full, shrinks while breathing out, stays small. */
function breathScale(t: number): number {
  const side = Math.floor(t / SIDE_SECONDS) % 4
  const p = (t % SIDE_SECONDS) / SIDE_SECONDS
  if (side === 0) return 0.75 + 0.25 * p
  if (side === 1) return 1
  if (side === 2) return 1 - 0.25 * p
  return 0.75
}

/** Box breathing: 4 seconds in, hold 4, out 4, hold 4 — following a dot around a square. */
export function BoxBreathing() {
  const [running, setRunning] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const startRef = useRef(0)

  useEffect(() => {
    if (!running) return
    startRef.current = performance.now() - elapsed * 1000
    let frame = requestAnimationFrame(function tick(now) {
      const seconds = (now - startRef.current) / 1000
      if (seconds >= TOTAL_SECONDS) {
        setElapsed(TOTAL_SECONDS)
        setRunning(false)
        return
      }
      setElapsed(seconds)
      frame = requestAnimationFrame(tick)
    })
    return () => cancelAnimationFrame(frame)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `elapsed` is only read when starting
  }, [running])

  const finished = elapsed >= TOTAL_SECONDS
  const phase = PHASES[Math.floor(elapsed / SIDE_SECONDS) % 4]!
  const countdown = SIDE_SECONDS - Math.floor(elapsed % SIDE_SECONDS)
  const { x, y } = dotPosition(elapsed)
  const scale = running ? breathScale(elapsed) : 0.85

  function toggle() {
    if (finished) setElapsed(0)
    setRunning((r) => !r)
  }

  return (
    <div className="flex flex-col items-center gap-5">
      <div className="relative size-48" aria-hidden>
        {/* The square path */}
        <div className="absolute inset-0 rounded-2xl border-2 border-mental/40" />
        {/* A soft square that grows as you breathe in and shrinks as you breathe out */}
        <div
          className="absolute inset-6 rounded-xl bg-mental-soft transition-transform duration-200 ease-linear"
          style={{ transform: `scale(${scale})` }}
        />
        {/* The dot to follow */}
        <div
          className="absolute size-5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-mental shadow-soft"
          style={{ left: `${x * 100}%`, top: `${y * 100}%` }}
        />
        <div className="absolute inset-0 grid place-items-center text-center">
          <div>
            <p className="font-heading text-xl font-semibold">{finished ? 'Well done' : running ? phase : 'Ready'}</p>
            {running && <p className="text-3xl font-semibold tabular-nums">{countdown}</p>}
          </div>
        </div>
      </div>

      {/* Screen readers hear the phase changes */}
      <p className="sr-only" aria-live="polite">
        {running ? phase : finished ? 'Finished' : ''}
      </p>

      <p className="text-center text-sm text-muted-foreground">
        {finished
          ? 'One minute of calm. Notice how you feel now.'
          : 'In for 4, hold for 4, out for 4, hold for 4. Follow the dot.'}
      </p>
      <Button onClick={toggle} variant={running ? 'outline' : 'default'}>
        {running ? <Pause aria-hidden /> : <Play aria-hidden />}
        {running ? 'Stop' : finished ? 'Go again' : elapsed > 0 ? 'Continue' : 'Start (1 minute)'}
      </Button>
    </div>
  )
}
