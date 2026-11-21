// Profile → "Apple Watch sync": create or revoke the token an iOS Shortcut uses, plus a setup guide.
import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, Check, Copy, KeyRound, RefreshCw, Trash2, Watch } from 'lucide-react'
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
import { EXAMPLE_BODY, formatSyncTime, syncEndpoint, type NewTokenResponse, type SyncStatus } from '@/lib/healthSync'
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
          className={
            multiline
              ? 'min-w-0 flex-1 overflow-x-auto py-1 font-mono text-xs leading-relaxed'
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
      setStatus((s) => ({ hasToken: true, createdAt: data.createdAt, lastHealthSyncAt: s?.lastHealthSyncAt ?? null }))
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
      setStatus((s) => ({ hasToken: false, createdAt: null, lastHealthSyncAt: s?.lastHealthSyncAt ?? null }))
      toast.success('Token revoked — the Shortcut can no longer sync')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not revoke the token')
    } finally {
      setBusy(false)
      setConfirm(null)
    }
  }

  const endpoint = syncEndpoint()
  const isLocalhost = ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname)

  return (
    <Card className="max-w-3xl">
      <CardHeader>
        <div className="flex items-center gap-3">
          <IconBubble icon={Watch} tone="physical" />
          <div>
            <CardTitle className="text-lg font-semibold">Apple Watch sync</CardTitle>
            <CardDescription>
              An iOS Shortcut sends your steps, calories, workouts, weight and sleep from Apple Health.
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
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4">
              <p className="text-sm" role="status">
                <span className="block font-medium">
                  {status.lastHealthSyncAt
                    ? `Last synced: ${formatSyncTime(status.lastHealthSyncAt)}`
                    : status.hasToken
                      ? 'Waiting for the first sync'
                      : 'Not set up yet'}
                </span>
                <span className="text-muted-foreground">
                  {status.hasToken
                    ? `Token created ${status.createdAt ? formatSyncTime(status.createdAt) : ''}`.trim()
                    : status.lastHealthSyncAt
                      ? 'No active token — syncing is off'
                      : 'Create a token, then follow the guide below.'}
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
              </div>
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

        <section aria-labelledby="sync-guide" className="space-y-4 rounded-xl bg-muted/40 p-4">
          <h3 id="sync-guide" className="font-semibold">
            Setting up the Shortcut
          </h3>
          <ol className="list-decimal space-y-1.5 pl-5 text-sm text-muted-foreground">
            <li>In the Shortcuts app, add "Find Health Samples" actions for the values you want (e.g. today's steps).</li>
            <li>Add "Get Contents of URL" with the URL below, method POST, request body JSON.</li>
            <li>Add the Authorization header and the fields from the example. Leave out anything you don't track.</li>
            <li>Optional: run it every evening with a Personal Automation (e.g. at 21:00).</li>
          </ol>

          <CopyBox label="Endpoint URL (POST)" value={endpoint} />
          {import.meta.env.DEV ? (
            <p className="text-xs text-muted-foreground">
              Development: your iPhone must be on the same Wi-Fi as this computer.
              {isLocalhost &&
                ' Your phone can\'t reach "localhost" — replace it with this computer\'s Wi-Fi IP address (run ipconfig and look for IPv4 Address, e.g. 192.168.1.20).'}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Production: use your deployed site's address, e.g. https://your-app.example.com/api/health-sync. It must be https.
            </p>
          )}

          <CopyBox label="Header" value="Authorization: Bearer dt_your_token_here" />
          <CopyBox label="JSON body example" value={EXAMPLE_BODY} multiline />

          <ul className="space-y-1 text-xs text-muted-foreground">
            <li>• Every field is optional. "date" defaults to today and can go back up to 14 days.</li>
            <li>• Numbers can be sent as text ("8234", "72.4 kg") — they're rounded sensibly.</li>
            <li>• Steps, calories and exercise minutes are replaced on each sync. Weight and sleep only fill empty days.</li>
            <li>• Watch workouts replace the previous watch workouts for that day; your own workouts are never touched.</li>
            <li>• Up to 30 syncs an hour. Errors come back as {'{ "message": "…" }'} so you can see what went wrong.</li>
          </ul>
        </section>
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
