// Settings → "Apple Watch sync": status, the token an iOS Shortcut uses, a connection test, and a
// collapsed setup guide.
import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, Check, ChevronDown, Copy, KeyRound, PlugZap, RefreshCw, Trash2, Watch, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { IconBubble } from '@/components/IconBubble'
import { api } from '@/lib/api'
import {
  EXAMPLE_BODY,
  formatSyncTime,
  relativeTime,
  syncEndpoints,
  type NewTokenResponse,
  type SyncStatus,
  type SyncTestResponse,
} from '@/lib/healthSync'
import { cn } from '@/lib/utils'
import { FormError } from '@/components/StatusViews'

/** Copies text, falling back to selecting it (the clipboard API needs https or localhost). */
async function copyText(text: string, fallbackTarget: HTMLElement | null): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    if (fallbackTarget) {
      const range = document.createRange()
      range.selectNodeContents(fallbackTarget)
      const selection = window.getSelection()
      selection?.removeAllRanges()
      selection?.addRange(range)
    }
    return false
  }
}

/** A monospace box with a copy button. */
function CopyBox({ label, value, multiline = false }: { label: string; value: string; multiline?: boolean }) {
  const ref = useRef<HTMLPreElement>(null)
  const [copied, setCopied] = useState(false)

  async function copy() {
    if (await copyText(value, ref.current)) {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } else {
      toast.info('Selected — press Ctrl+C (or ⌘C) to copy')
    }
  }

  return (
    <div className="space-y-1.5">
      <p className="text-sm font-medium">{label}</p>
      <div className="flex items-start gap-2 rounded-xl border bg-muted/60 p-2 pl-3">
        <pre
          ref={ref}
          tabIndex={0}
          role="region"
          aria-label={label}
          className={
            multiline
              ? 'min-w-0 flex-1 overflow-x-auto rounded-md py-1 font-mono text-xs leading-relaxed outline-none focus-visible:ring-3 focus-visible:ring-ring/50'
              : 'min-w-0 flex-1 overflow-x-auto py-1.5 font-mono text-sm break-all whitespace-pre-wrap'
          }
        >
          {value}
        </pre>
        <Button type="button" variant="outline" size="sm" onClick={() => void copy()} aria-label={`Copy ${label}`}>
          {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </div>
    </div>
  )
}

type Confirm = 'revoke' | 'regenerate' | null

export function AppleWatchSync() {
  const [status, setStatus] = useState<SyncStatus | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [newToken, setNewToken] = useState<string | null>(null) // shown once, never stored
  const [busy, setBusy] = useState(false)
  const [confirm, setConfirm] = useState<Confirm>(null)
  const [testing, setTesting] = useState(false)
  const [test, setTest] = useState<{ ok: boolean; message: string } | null>(null)

  useEffect(() => {
    api
      .get<SyncStatus>('/health-sync/status')
      .then(setStatus)
      .catch((err: unknown) => setLoadError(err instanceof Error ? err.message : 'Could not load sync status'))
  }, [])

  async function generate() {
    setBusy(true)
    try {
      const data = await api.post<NewTokenResponse>('/health-sync/token')
      setNewToken(data.token)
      setStatus((s) => ({ ...s, hasToken: true, createdAt: data.createdAt, lastHealthSyncAt: s?.lastHealthSyncAt ?? null }))
      setTest(null)
      toast.success('Sync token created')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not create a token')
    } finally {
      setBusy(false)
      setConfirm(null)
    }
  }

  async function revoke() {
    setBusy(true)
    try {
      await api.delete('/health-sync/token')
      setNewToken(null)
      setStatus((s) => ({ ...s, hasToken: false, createdAt: null, lastHealthSyncAt: s?.lastHealthSyncAt ?? null }))
      setTest(null)
      toast.success('Token revoked — the Shortcut can no longer sync')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not revoke the token')
    } finally {
      setBusy(false)
      setConfirm(null)
    }
  }

  /** Calls the logged-in test endpoint: is the server reachable, and is a token active? */
  async function testConnection() {
    setTesting(true)
    setTest(null)
    try {
      const data = await api.get<SyncTestResponse>('/health-sync/test')
      setTest({
        ok: true,
        message: data.hasToken
          ? 'OK — the server is reachable and a sync token is active.'
          : "OK — the server is reachable, but there's no sync token yet.",
      })
    } catch (err) {
      setTest({ ok: false, message: err instanceof Error ? err.message : 'Could not reach the server' })
    } finally {
      setTesting(false)
    }
  }

  const endpoints = syncEndpoints(status?.lanAddresses)

  return (
    <Card className="max-w-3xl">
      <CardHeader>
        <div className="flex items-center gap-3">
          <IconBubble icon={Watch} tone="physical" />
          <div>
            <CardTitle className="text-lg font-semibold">Apple Watch sync</CardTitle>
            <CardDescription>
              An iOS Shortcut sends your sleep from Apple Health. Steps, calories, workouts and weight are entered on the Today page.
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        {loadError ? (
          <FormError>{loadError}</FormError>
        ) : !status ? (
          <Skeleton className="h-16 w-full rounded-xl" />
        ) : (
          <>
            <div className="space-y-3 rounded-xl border p-4">
              <p className="text-sm" role="status">
                <span className="flex items-center gap-2 font-medium">
                  <span aria-hidden className={cn('size-2 shrink-0 rounded-full', status.hasToken ? 'bg-physical' : 'bg-muted-foreground/50')} />
                  {status.hasToken
                    ? `Connected · ${status.lastHealthSyncAt ? `last sync ${relativeTime(status.lastHealthSyncAt)}` : 'waiting for the first sync'}`
                    : 'Not set up'}
                </span>
                <span className="text-muted-foreground">
                  {status.hasToken
                    ? `Token created ${status.createdAt ? formatSyncTime(status.createdAt) : ''}`.trim()
                    : status.lastHealthSyncAt
                      ? `No active token — syncing is off (last sync ${relativeTime(status.lastHealthSyncAt)})`
                      : 'Generate a token, then follow the setup guide below.'}
                </span>
              </p>
              <div className="flex flex-wrap gap-2">
                {status.hasToken ? (
                  <>
                    <Button type="button" variant="outline" disabled={busy} onClick={() => setConfirm('regenerate')}>
                      <RefreshCw aria-hidden /> Regenerate
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={busy}
                      onClick={() => setConfirm('revoke')}
                      className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 aria-hidden /> Revoke
                    </Button>
                  </>
                ) : (
                  <Button loading={busy} type="button" disabled={busy} onClick={() => void generate()}>
                    <KeyRound aria-hidden />
                    Generate sync token
                  </Button>
                )}
                <Button type="button" variant="ghost" loading={testing} disabled={testing} onClick={() => void testConnection()}>
                  <PlugZap aria-hidden /> Test connection
                </Button>
              </div>
              {test && (
                <p role="status" className={cn('flex items-center gap-1.5 text-sm', test.ok ? 'text-physical-foreground' : 'text-destructive')}>
                  {test.ok ? <Check className="size-4 shrink-0" aria-hidden /> : <X className="size-4 shrink-0" aria-hidden />}
                  {test.message}
                </p>
              )}
            </div>

            {newToken && (
              <div className="space-y-3 rounded-xl border border-physical/40 bg-physical-soft p-4 text-physical-foreground">
                <p className="flex items-center gap-2 text-sm font-semibold">
                  <AlertTriangle className="size-4 shrink-0" aria-hidden />
                  Copy this now — you won't see it again
                </p>
                <CopyBox label="Sync token" value={newToken} />
                <p className="text-xs text-muted-foreground">
                  Paste it into the Shortcut's Authorization header. Anyone with this token can add Health data to your
                  account (but can't read anything). Lost it? Regenerate a new one.
                </p>
              </div>
            )}
          </>
        )}

        <div className="space-y-3">
          <CopyBox label="Endpoint URL (POST)" value={endpoints[0]!} />
          {import.meta.env.DEV && (
            <>
              {endpoints.slice(1).map((url) => (
                <CopyBox key={url} label="If that name doesn't work: this computer's IP address" value={url} />
              ))}
              <p className="text-xs text-muted-foreground">
                Development: your iPhone must be on the same Wi-Fi as this computer.
                {status && endpoints.length === 1 && ' No LAN IPv4 address was found — is this computer on Wi-Fi?'}
              </p>
            </>
          )}
        </div>

        <details className="group rounded-xl bg-muted/40">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-xl p-4 font-semibold outline-none focus-visible:ring-3 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
            Setup guide
            <ChevronDown className="size-4 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden />
          </summary>
          <div className="space-y-4 px-4 pb-4">
            <ol className="list-decimal space-y-1.5 pl-5 text-sm text-muted-foreground">
              <li>In the Shortcuts app, add a "Find Health Samples" action for last night's Sleep Analysis.</li>
              <li>Add "Get Contents of URL" with the endpoint URL above, method POST, request body JSON.</li>
              <li>Add the Authorization header and the fields from the example. Leave out anything you don't track.</li>
              <li>Optional: run it every evening with a Personal Automation (e.g. at 21:00).</li>
            </ol>

            <CopyBox label="Header" value="Authorization: Bearer dt_your_token_here" />
            <CopyBox label="JSON body example" value={EXAMPLE_BODY} multiline />

            <ul className="space-y-1 text-xs text-muted-foreground">
              <li>• Every field is optional. "date" defaults to today and can go back up to 14 days.</li>
              <li>• Numbers can be sent as text ("8234", "72.4 kg") — they're rounded sensibly.</li>
              <li>• Only sleep is used: sleepSamples (or sleepHours). Anything else the Shortcut sends is ignored, without an error.</li>
              <li>• Sleep hours or a score you entered yourself on the Today page are never overwritten by a sync.</li>
              <li>• Up to 30 syncs an hour. Errors come back as {'{ "message": "…" }'} so you can see what went wrong.</li>
            </ul>
          </div>
        </details>
      </CardContent>

      <Dialog open={confirm !== null} onOpenChange={(open) => !open && setConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{confirm === 'revoke' ? 'Revoke the sync token?' : 'Create a new sync token?'}</DialogTitle>
            <DialogDescription>
              {confirm === 'revoke'
                ? 'The Shortcut will stop syncing straight away. Data already synced stays.'
                : 'The current token stops working straight away. You\'ll need to paste the new one into your Shortcut.'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirm(null)}>
              Cancel
            </Button>
            <Button loading={busy}
              type="button"
              variant={confirm === 'revoke' ? 'destructive' : 'default'}
              disabled={busy}
              onClick={() => void (confirm === 'revoke' ? revoke() : generate())}
            >
              {confirm === 'revoke' ? 'Revoke' : 'Regenerate'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
