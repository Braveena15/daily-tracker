import { useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { DemoFooter } from '@/components/demo/DemoBanner'
import { useDemoConfig } from '@/hooks/useDemoConfig'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AuthLayout } from '@/components/AuthLayout'
import { ErrorNotice, FullPageLoader } from '@/components/StatusViews'
import { useAuth } from '@/context/useAuth'

export function Login() {
  const { user, loading, login, startDemo } = useAuth()
  const demo = useDemoConfig()
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from ?? '/'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [starting, setStarting] = useState(false)

  if (loading) return <FullPageLoader />
  if (user) return <Navigate to={from} replace />

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await login(email, password)
      navigate(from, { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setSubmitting(false)
    }
  }

  async function tryDemo() {
    setError(null)
    setStarting(true)
    try {
      await startDemo()
      navigate('/', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start the demo')
      setStarting(false)
    }
  }

  const demoOn = demo?.enabled === true

  return (
    <AuthLayout
      title={demoOn ? 'Try Daily Tracker' : 'Welcome back'}
      description={demoOn ? 'Explore an account with 60 days of sample data.' : 'Log in to your account'}
      footer={demoOn ? <DemoFooter repoUrl={demo.repoUrl} className="mt-6" /> : undefined}
    >
      {error && <ErrorNotice className="mb-5">{error}</ErrorNotice>}

      {demoOn && (
        <div className="mb-6 space-y-3">
          <Button
            loading={starting}
            type="button"
            size="lg"
            className="h-12 w-full text-base"
            disabled={starting || submitting}
            onClick={() => void tryDemo()}
          >
            <Sparkles aria-hidden />
            {starting ? 'Setting up your demo…' : 'Try the demo — no sign-up'}
          </Button>
          <p className="text-center text-xs text-pretty text-muted-foreground">
            A fresh account just for you, filled with made-up data. It's deleted after 24 hours.
          </p>
          <div className="flex items-center gap-3 pt-2 text-xs text-muted-foreground">
            <Separator className="flex-1" />
            or log in
            <Separator className="flex-1" />
          </div>
        </div>
      )}

      <form className="space-y-5" onSubmit={handleSubmit} noValidate>

        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>

        <Button loading={submitting} type="submit" size="lg" className="w-full" disabled={submitting}>
          {submitting ? 'Logging in…' : 'Log in'}
        </Button>

        {/* The demo has no sign-up: "Try the demo" is the way in */}
        {!demoOn && (
          <p className="text-center text-sm text-muted-foreground">
            No account yet?{' '}
            <Link to="/register" className="font-medium text-primary underline-offset-4 hover:underline">
              Create one
            </Link>
          </p>
        )}
      </form>
    </AuthLayout>
  )
}
