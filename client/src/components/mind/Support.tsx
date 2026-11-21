// Support contacts. This content is fixed and written by people — never AI-generated.
import { useLayoutEffect, useRef, useState } from 'react'
import { Heart, HeartHandshake, Phone } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

const HELPLINES = [
  { name: 'CCCline', number: '1333', note: 'Free, confidential, 24/7' },
  { name: 'National Mental Health Helpline', number: '1926', note: 'Free, 24/7, call or text' },
  { name: 'Lanka Life Line', number: '1375', note: null },
]

const EMERGENCY = [
  { name: 'Police', number: '119' },
  { name: 'Suwa Seriya ambulance', number: '1990' },
]

function CallLink({ number, label }: { number: string; label: string }) {
  return (
    <a
      href={`tel:${number}`}
      aria-label={`Call ${label} on ${number}`}
      className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl bg-primary px-3.5 text-sm font-semibold text-primary-foreground tabular-nums transition-all outline-none hover:bg-primary/85 focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-95"
    >
      <Phone className="size-4" aria-hidden />
      {number}
    </a>
  )
}

/** "You don't have to carry this alone" with tap-to-call helplines. */
export function SupportCard({ className }: { className?: string }) {
  return (
    <div className={cn('space-y-4', className)}>
      <p className="font-heading text-lg leading-snug">
        You don't have to carry this alone. Talking to someone can really help.
      </p>

      <ul className="space-y-2">
        {HELPLINES.map((h) => (
          <li key={h.number} className="flex items-center justify-between gap-3 rounded-xl bg-muted/60 p-3">
            <div className="min-w-0">
              <p className="font-medium">{h.name}</p>
              {h.note && <p className="text-xs text-muted-foreground">{h.note}</p>}
            </div>
            <CallLink number={h.number} label={h.name} />
          </li>
        ))}
      </ul>

      <div className="space-y-2 rounded-xl border p-3">
        <p className="text-sm font-medium">Emergency</p>
        <div className="flex flex-wrap gap-2">
          {EMERGENCY.map((e) => (
            <a
              key={e.number}
              href={`tel:${e.number}`}
              className="inline-flex h-10 items-center gap-1.5 rounded-xl border px-3 text-sm transition-all outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <Phone className="size-4 text-muted-foreground" aria-hidden />
              <span className="font-semibold tabular-nums">{e.number}</span>
              <span className="text-muted-foreground">{e.name}</span>
            </a>
          ))}
        </div>
      </div>

      <p className="text-sm font-medium">If you're in immediate danger, please call 1990 or go to the nearest hospital.</p>
    </div>
  )
}

/** The support card in a dialog. */
export function SupportDialog({
  open,
  onOpenChange,
  description = 'Your entry is saved. These people are ready to listen, any time.',
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  description?: string
}) {
  // These dialogs are opened by plain buttons (not a DialogTrigger), so Radix wouldn't know where
  // to put focus back on close. Remember what had focus as it opens (a layout effect runs before
  // the dialog moves focus inside) and return there, so keyboard users keep their place.
  const returnTo = useRef<HTMLElement | null>(null)
  useLayoutEffect(() => {
    if (open) returnTo.current = document.activeElement as HTMLElement | null
  }, [open])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[90dvh] overflow-y-auto sm:max-w-md"
        onCloseAutoFocus={(e) => {
          e.preventDefault()
          if (returnTo.current?.isConnected) returnTo.current.focus()
        }}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <HeartHandshake className="size-5 text-mental" aria-hidden /> Support is here
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <SupportCard />
      </DialogContent>
    </Dialog>
  )
}

export const SUPPORT_NOW = 'Reaching out is a strong thing to do.'

/**
 * "Need support now" — opens the support card. `compact` is a round heart button for page
 * headers (labelled for screen readers), in the same lavender as the full button.
 */
export function SupportButton({
  className,
  compact = false,
  tooltip,
}: {
  className?: string
  compact?: boolean
  /** Show this in a tooltip (needs a TooltipProvider above, like the desktop sidebar's) */
  tooltip?: string
}) {
  const [open, setOpen] = useState(false)
  const button = (
      <Button
        type="button"
        variant="outline"
        size={compact ? 'icon-lg' : 'default'}
        className={cn(
          'border-mental/40 bg-mental-soft text-mental-foreground hover:bg-mental-soft/80 hover:text-mental-foreground',
          compact && 'rounded-full',
          className,
        )}
        onClick={() => setOpen(true)}
        aria-label={compact ? 'Need support now' : undefined}
        title={compact && !tooltip ? 'Need support now' : undefined}
      >
        <Heart className="fill-current" aria-hidden />
        {!compact && 'Need support now'}
      </Button>
  )
  return (
    <>
      {tooltip ? (
        <Tooltip>
          <TooltipTrigger asChild>{button}</TooltipTrigger>
          <TooltipContent side="right">{tooltip}</TooltipContent>
        </Tooltip>
      ) : (
        button
      )}
      <SupportDialog open={open} onOpenChange={setOpen} description={SUPPORT_NOW} />
    </>
  )
}

/** A gentle dashboard card when mood has been low for a while. */
export function LowMoodCard() {
  const [open, setOpen] = useState(false)
  return (
    <Card className="bg-mental-soft/60 ring-mental/20">
      <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-card text-mental" aria-hidden>
          <HeartHandshake className="size-5" />
        </span>
        <p className="flex-1 text-sm leading-relaxed">
          Your mood has been low for a while. It might help to talk to someone you trust or a counsellor — you deserve
          support.
        </p>
        <Button variant="outline" className="shrink-0 bg-card" onClick={() => setOpen(true)}>
          See who you can talk to
        </Button>
      </CardContent>
      <SupportDialog open={open} onOpenChange={setOpen} description={SUPPORT_NOW} />
    </Card>
  )
}
