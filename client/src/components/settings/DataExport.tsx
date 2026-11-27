// Settings → Data → "Export my data": one JSON file of everything the user wrote, decrypted
// (it's their own download). Receipt files aren't in it; the Expenses page exports those.
import { useState } from 'react'
import { Database, Download } from 'lucide-react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { IconBubble } from '@/components/IconBubble'
import { api } from '@/lib/api'
import { todayInTimezone } from '@/lib/dates'

export function DataExport() {
  const [busy, setBusy] = useState(false)

  async function download() {
    setBusy(true)
    try {
      const data = await api.get<unknown>('/profile/export')
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
      const a = document.createElement('a')
      a.href = url
      a.download = `daily-tracker-export-${todayInTimezone()}.json`
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
      toast.success('Your data is downloading')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not export your data')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex min-w-0 items-center gap-3">
          <IconBubble icon={Database} />
          <div className="min-w-0">
            <CardTitle className="text-lg font-semibold">Export my data</CardTitle>
            <CardDescription>
              A JSON file of your entries, meals, expenses, purpose, diary and thought logs — readable, not encrypted, so keep it safe.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <Button type="button" variant="outline" loading={busy} disabled={busy} onClick={() => void download()}>
          <Download aria-hidden /> Export my data
        </Button>
        <p className="text-xs text-muted-foreground">
          Receipt files aren't included. Download them from the{' '}
          <Link to="/expenses" className="underline underline-offset-2 hover:text-foreground">
            Expenses page
          </Link>{' '}
          (Report or Receipts).
        </p>
      </CardContent>
    </Card>
  )
}
