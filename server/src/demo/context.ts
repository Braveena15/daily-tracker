// Which demo account the current request belongs to, so every document it creates gets the same
// expiry as the account (see expiryPlugin.ts). Only ever set by requireAuth when DEMO_MODE=true,
// so outside the demo nothing reads or writes `expiresAt`.
import { AsyncLocalStorage } from "node:async_hooks";

export type DemoRequestContext = { expiresAt: Date };

export const demoContext = new AsyncLocalStorage<DemoRequestContext>();

/** The current demo account's expiry, or undefined outside a demo request. */
export const currentDemoExpiry = (): Date | undefined => demoContext.getStore()?.expiresAt;
