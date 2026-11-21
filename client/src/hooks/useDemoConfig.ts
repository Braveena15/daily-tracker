import { useEffect, useState } from 'react'
import { DEMO_OFF, loadDemoConfig, type DemoConfig } from '@/lib/demo'

/**
 * The demo settings, or null while they load. `ask: false` skips the request and returns "off"
 * (e.g. for a logged-in user who isn't a demo account, so normal deployments make no extra request).
 */
export function useDemoConfig(ask = true): DemoConfig | null {
  const [config, setConfig] = useState<DemoConfig | null>(null)
  useEffect(() => {
    if (!ask) return
    let live = true
    void loadDemoConfig().then((c) => live && setConfig(c))
    return () => {
      live = false
    }
  }, [ask])
  return ask ? config : DEMO_OFF
}
