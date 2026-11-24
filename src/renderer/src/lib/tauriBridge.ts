/**
 * Tauri implementation of `window.api` (migration spike).
 *
 * Exposes the same surface as the Electron preload so the renderer does not
 * change. Methods are routed to Rust commands as they get ported; the others
 * reject with an explicit error, and event subscriptions return a no-op
 * unsubscribe so React effect cleanups keep working.
 */
import type { Api } from '../../../preload/index'

export type InvokeFn = (command: string, args?: Record<string, unknown>) => Promise<unknown>

/** `namespace.method` → Rust command name. Grows phase after phase. */
const PORTED_COMMANDS: Record<string, string> = {
  'settings.get': 'settings_get'
}

const noop = (): void => {}

function isSubscription(method: string): boolean {
  return /^on[A-Z]/.test(method)
}

function createMethod(invoke: InvokeFn, path: string): (...args: unknown[]) => unknown {
  const method = path.split('.').pop() as string
  if (isSubscription(method)) return () => noop

  const command = PORTED_COMMANDS[path]
  if (!command) {
    return () => Promise.reject(new Error(`Not ported to Tauri yet: ${path}`))
  }
  return (args?: unknown) => invoke(command, args as Record<string, unknown> | undefined)
}

function createNamespace(invoke: InvokeFn, namespace: string): object {
  return new Proxy(
    {},
    { get: (_target, method) => createMethod(invoke, `${namespace}.${String(method)}`) }
  )
}

export function createTauriApi(invoke: InvokeFn): Api {
  return new Proxy({} as Api, {
    get: (_target, prop) => {
      const name = String(prop)
      return isSubscription(name) ? createMethod(invoke, name) : createNamespace(invoke, name)
    }
  })
}

export function isTauriRuntime(globalScope: object): boolean {
  return '__TAURI_INTERNALS__' in globalScope
}
