// The public demo (server: DEMO_MODE=true, /api/demo). On a normal deployment /api/demo/config
// doesn't exist, so the demo is off and nothing demo-related is shown.
import { api } from '@/lib/api'

export type DemoConfig = { enabled: boolean; repoUrl: string | null; ttlHours: number }

export const DEMO_OFF: DemoConfig = { enabled: false, repoUrl: null, ttlHours: 0 }

/** Who built the app, shown in the demo's footer */
export const DEMO_AUTHOR = 'Routhiran'

let cached: Promise<DemoConfig> | null = null

/** Asked once per page load; any error (a 404 outside the demo) means "off". */
export function loadDemoConfig(): Promise<DemoConfig> {
  cached ??= api.get<DemoConfig>('/demo/config').then((c) => (c.enabled ? c : DEMO_OFF)).catch(() => DEMO_OFF)
  return cached
}
