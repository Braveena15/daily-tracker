// Receipt files in the page: object URLs made from the in-memory copy (fetched with the login cookie).
import { useEffect, useState } from 'react'
import { receiptBlob } from '@/lib/expenses'

/** An object URL for the receipt's file (revoked when no longer shown). */
export function useReceiptUrl(fileId: string | null): { url: string | null; error: string | null } {
  const [state, setState] = useState<{ id: string | null; url: string | null; error: string | null }>({ id: null, url: null, error: null })
  useEffect(() => {
    if (!fileId) return
    let url: string | null = null
    let alive = true
    receiptBlob(fileId).then(
      (blob) => {
        url = URL.createObjectURL(blob)
        if (alive) setState({ id: fileId, url, error: null })
      },
      (err: unknown) => alive && setState({ id: fileId, url: null, error: err instanceof Error ? err.message : 'Could not load the receipt' }),
    )
    return () => {
      alive = false
      if (url) URL.revokeObjectURL(url)
    }
  }, [fileId])
  return state.id === fileId ? { url: state.url, error: state.error } : { url: null, error: null }
}

/** Opens a receipt (e.g. a PDF) in a new tab, from its in-memory copy. */
export async function openReceipt(fileId: string) {
  // Open the tab first (in the tap), so phones don't block it as a pop-up
  const tab = window.open('', '_blank')
  try {
    const url = URL.createObjectURL(await receiptBlob(fileId))
    if (tab) tab.location.href = url
    else window.location.href = url
  } catch {
    tab?.close()
  }
}
