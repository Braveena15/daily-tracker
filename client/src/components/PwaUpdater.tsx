/// <reference types="vite-plugin-pwa/react" />
// Registers the service worker (production builds only) and offers a refresh when a new version is ready.
import { useEffect } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { toast } from 'sonner'

const UPDATE_TOAST = 'pwa-update'
// An installed app can stay open for days, so look for a new version every hour as well as on launch
const CHECK_EVERY_MS = 60 * 60 * 1000

export function PwaUpdater() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (registration) setInterval(() => void registration.update(), CHECK_EVERY_MS)
    },
  })

  useEffect(() => {
    if (!needRefresh) return
    toast('New version available', {
      id: UPDATE_TOAST,
      duration: Infinity,
      action: { label: 'Refresh', onClick: () => void updateServiceWorker(true) },
    })
  }, [needRefresh, updateServiceWorker])

  return null
}
