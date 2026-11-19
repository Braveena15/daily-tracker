import type { ReactNode } from 'react'
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card'
import { ThemeToggle } from '@/components/ThemeToggle'

/** Centred card for the login and register pages. */
export function AuthLayout({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <main className="relative isolate grid min-h-dvh place-items-center overflow-hidden px-4 py-12">
      {/* Soft colour glows in the background */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-24 -left-24 size-80 rounded-full bg-primary/15 blur-3xl" />
        <div className="absolute -right-24 -bottom-24 size-80 rounded-full bg-mental/15 blur-3xl" />
      </div>

      <ThemeToggle className="absolute top-4 right-4" />

      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div
            className="mx-auto mb-4 grid size-16 place-items-center rounded-3xl bg-secondary text-3xl shadow-soft"
            aria-hidden
          >
            🌱
          </div>
          <p className="font-heading text-3xl font-semibold tracking-tight">Daily Tracker</p>
          <p className="mt-2 text-pretty text-muted-foreground">
            A gentle place to check in with yourself, one day at a time.
          </p>
        </div>

        <Card>
          <CardHeader>
            <h1 className="text-xl font-semibold">{title}</h1>
            <CardDescription>{description}</CardDescription>
          </CardHeader>
          <CardContent>{children}</CardContent>
        </Card>
      </div>
    </main>
  )
}
