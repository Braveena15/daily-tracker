import { lazy, type ComponentType } from 'react'

const RELOADED_KEY = 'lazyPage.reloaded'

/**
 * A page that loads its code the first time it's opened. If that fails because a new version
 * was deployed while the app was open (the old file is gone), the page reloads once to pick up
 * the new version. If it still fails, the error is shown as usual.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- any props, like React.lazy itself
export function lazyPage<T extends ComponentType<any>>(load: () => Promise<T>) {
  return lazy(async () => {
    try {
      const component = await load()
      safeSession(() => sessionStorage.removeItem(RELOADED_KEY))
      return { default: component }
    } catch (err) {
      const alreadyReloaded = safeSession(() => sessionStorage.getItem(RELOADED_KEY)) === 'yes'
      if (!alreadyReloaded && navigator.onLine) {
        safeSession(() => sessionStorage.setItem(RELOADED_KEY, 'yes'))
        window.location.reload()
        return new Promise<never>(() => {}) // keep showing the loading view until the reload
      }
      throw err
    }
  })
}

function safeSession<R>(run: () => R): R | undefined {
  try {
    return run()
  } catch {
    return undefined
  }
}
