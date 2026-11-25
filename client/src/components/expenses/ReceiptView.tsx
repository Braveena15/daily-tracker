// Showing receipts: a thumbnail (image, or a PDF tile with "Open"), and a full-screen lightbox that
// swipes between receipts and zooms. Files are fetched with the login cookie (lib/expenses.ts).
import { useEffect, useRef, useState } from 'react'
import { openReceipt, useReceiptUrl } from '@/hooks/useReceiptUrl'
import { ChevronLeft, ChevronRight, ExternalLink, FileText, Loader2, X, ZoomIn, ZoomOut } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { isPdf, type Receipt } from '@/lib/expenses'
import { cn } from '@/lib/utils'

/** A square thumbnail: the photo, or a PDF tile. */
export function ReceiptThumb({ receipt, onOpen, className }: { receipt: Receipt; onOpen?: () => void; className?: string }) {
  const pdf = isPdf(receipt)
  const { url, error } = useReceiptUrl(pdf ? null : receipt.fileId)
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn('relative grid aspect-square shrink-0 place-items-center overflow-hidden rounded-xl bg-muted ring-1 ring-foreground/10 outline-none focus-visible:ring-3 focus-visible:ring-ring/50', className)}
      aria-label={`Open receipt ${receipt.filename}`}
    >
      {pdf ? (
        <span className="flex flex-col items-center gap-1 p-1 text-center text-[10px] leading-tight text-muted-foreground">
          <FileText className="size-6 text-foreground/70" aria-hidden />
          PDF
        </span>
      ) : url ? (
        <img src={url} alt="" className="size-full object-cover" />
      ) : error ? (
        <span className="p-1 text-center text-[10px] text-muted-foreground">Unavailable</span>
      ) : (
        <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden />
      )}
    </button>
  )
}

/** A receipt shown large: the photo, or a PDF card with "Open". */
export function ReceiptLarge({ receipt, onOpen }: { receipt: Receipt; onOpen?: () => void }) {
  const pdf = isPdf(receipt)
  const { url, error } = useReceiptUrl(pdf ? null : receipt.fileId)
  if (pdf) {
    return (
      <div className="flex aspect-[3/4] flex-col items-center justify-center gap-3 rounded-2xl bg-muted p-4 text-center ring-1 ring-foreground/10">
        <FileText className="size-10 text-foreground/70" aria-hidden />
        <p className="max-w-full truncate text-sm font-medium">{receipt.filename}</p>
        <Button type="button" variant="outline" size="sm" className="bg-card" onClick={() => void openReceipt(receipt.fileId)}>
          <ExternalLink aria-hidden /> Open PDF
        </Button>
      </div>
    )
  }
  return (
    <button
      type="button"
      onClick={onOpen}
      className="block w-full overflow-hidden rounded-2xl bg-muted ring-1 ring-foreground/10 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      aria-label={`View receipt ${receipt.filename} full screen`}
    >
      {url ? (
        <img src={url} alt={`Receipt ${receipt.filename}`} className="max-h-[70vh] w-full object-contain" />
      ) : (
        <span className="grid aspect-[3/4] place-items-center text-sm text-muted-foreground">
          {error ?? <Loader2 className="size-5 animate-spin" aria-label="Loading" />}
        </span>
      )}
    </button>
  )
}

/** Full-screen receipts: swipe (or ‹ ›) between them, tap or the button to zoom in and pan. */
export function Lightbox({
  receipts,
  index,
  caption,
  onIndex,
  onClose,
}: {
  receipts: Receipt[]
  index: number | null
  caption?: (r: Receipt) => string
  onIndex: (i: number) => void
  onClose: () => void
}) {
  const open = index !== null
  const receipt = open ? receipts[index] : undefined
  const [zoomed, setZoomed] = useState(false)
  const start = useRef<{ x: number; y: number } | null>(null)
  const { url, error } = useReceiptUrl(receipt && !isPdf(receipt) ? receipt.fileId : null)

  const go = (delta: number) => {
    if (index === null) return
    const next = index + delta
    if (next >= 0 && next < receipts.length) {
      setZoomed(false)
      onIndex(next)
    }
  }

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') go(1)
      if (e.key === 'ArrowLeft') go(-1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  return (
    <Dialog open={open} onOpenChange={(o) => !o && (setZoomed(false), onClose())}>
      <DialogContent showCloseButton={false} className="h-dvh max-h-dvh w-screen max-w-none gap-0 rounded-none border-0 bg-black p-0 text-white sm:max-w-none">
        <DialogTitle className="sr-only">Receipt {index !== null ? index + 1 : ''} of {receipts.length}</DialogTitle>
        <DialogDescription className="sr-only">{receipt && caption ? caption(receipt) : 'Receipt'}</DialogDescription>
        <div className="flex items-center justify-between gap-2 px-3 pt-[max(env(safe-area-inset-top),0.75rem)] pb-2">
          <p className="min-w-0 truncate text-sm text-white/80">{receipt && caption ? caption(receipt) : receipt?.filename}</p>
          <div className="flex shrink-0 items-center gap-1">
            {receipt && !isPdf(receipt) && (
              <Button type="button" variant="ghost" size="icon" className="text-white hover:bg-white/10 hover:text-white" aria-label={zoomed ? 'Zoom out' : 'Zoom in'} onClick={() => setZoomed((z) => !z)}>
                {zoomed ? <ZoomOut /> : <ZoomIn />}
              </Button>
            )}
            <Button type="button" variant="ghost" size="icon" className="text-white hover:bg-white/10 hover:text-white" aria-label="Close" onClick={onClose}>
              <X />
            </Button>
          </div>
        </div>
        <div
          className={cn('relative min-h-0 flex-1', zoomed ? 'overflow-auto' : 'grid place-items-center overflow-hidden')}
          onTouchStart={(e) => (start.current = { x: e.touches[0]!.clientX, y: e.touches[0]!.clientY })}
          onTouchEnd={(e) => {
            if (!start.current || zoomed) return
            const dx = e.changedTouches[0]!.clientX - start.current.x
            const dy = e.changedTouches[0]!.clientY - start.current.y
            if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) go(dx < 0 ? 1 : -1)
            start.current = null
          }}
        >
          {receipt && isPdf(receipt) ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
              <FileText className="size-12 text-white/70" aria-hidden />
              <p className="max-w-full truncate">{receipt.filename}</p>
              <Button type="button" variant="secondary" onClick={() => void openReceipt(receipt.fileId)}>
                <ExternalLink aria-hidden /> Open PDF
              </Button>
            </div>
          ) : url ? (
            <img
              src={url}
              alt={receipt ? `Receipt ${receipt.filename}` : ''}
              onClick={() => setZoomed((z) => !z)}
              className={cn('select-none', zoomed ? 'max-w-none cursor-zoom-out' : 'max-h-full max-w-full cursor-zoom-in object-contain')}
              style={zoomed ? { width: '200%' } : undefined}
              draggable={false}
            />
          ) : (
            <p className="text-sm text-white/70">{error ?? 'Loading…'}</p>
          )}
          {receipts.length > 1 && !zoomed && (
            <>
              <Button type="button" variant="ghost" size="icon" className="absolute top-1/2 left-2 -translate-y-1/2 bg-black/40 text-white hover:bg-black/60 hover:text-white disabled:opacity-30" aria-label="Previous receipt" disabled={index === 0} onClick={() => go(-1)}>
                <ChevronLeft />
              </Button>
              <Button type="button" variant="ghost" size="icon" className="absolute top-1/2 right-2 -translate-y-1/2 bg-black/40 text-white hover:bg-black/60 hover:text-white disabled:opacity-30" aria-label="Next receipt" disabled={index === receipts.length - 1} onClick={() => go(1)}>
                <ChevronRight />
              </Button>
            </>
          )}
        </div>
        <p className="pt-2 pb-[max(env(safe-area-inset-bottom),0.75rem)] text-center text-xs text-white/60 tabular-nums">
          {index !== null ? `${index + 1} of ${receipts.length}` : ''}
        </p>
      </DialogContent>
    </Dialog>
  )
}
