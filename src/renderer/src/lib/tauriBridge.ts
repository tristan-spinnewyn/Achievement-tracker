/**
 * Tauri implementation of `window.api` (migration in progress).
 *
 * Exposes the same surface as the Electron preload so the renderer does not
 * change. Every property is a callable proxy, so both namespaces
 * (`api.settings.get()`) and top-level methods (`api.dashboard()`) work.
 * Ported methods are routed to Rust commands (see tauriCommands.ts); the others
 * reject with an explicit error, and event subscriptions return a no-op
 * unsubscribe so React effect cleanups keep working.
 */
import type { Api } from '../../../preload/index'
import { PORTED_COMMANDS } from './tauriCommands'

export { PORTED_COMMANDS }

export type InvokeFn = (command: string, args?: Record<string, unknown>) => Promise<unknown>

const noop = (): void => {}

function isSubscription(path: string): boolean {
  return /^on[A-Z]/.test(path.split('.').pop() as string)
}

/** Positional arguments -> named arguments, skipping those not passed. */
function namedArgs(params: string[], args: unknown[]): Record<string, unknown> {
  const named: Record<string, unknown> = {}
  params.forEach((name, i) => {
    if (args[i] !== undefined) named[name] = args[i]
  })
  return named
}

function call(invoke: InvokeFn, path: string, args: unknown[]): unknown {
  if (isSubscription(path)) return noop
  const ported = PORTED_COMMANDS[path]
  if (!ported) return Promise.reject(new Error(`Not ported to Tauri yet: ${path}`))
  return invoke(ported.command, namedArgs(ported.params, args))
}

function createNode(invoke: InvokeFn, path: string): unknown {
  return new Proxy(noop, {
    get: (_target, prop) => {
      // Not a thenable: awaiting a namespace must not call `then` on it.
      if (typeof prop === 'symbol' || prop === 'then') return undefined
      return createNode(invoke, path ? `${path}.${prop}` : prop)
    },
    apply: (_target, _thisArg, args: unknown[]) => call(invoke, path, args)
  })
}

export function createTauriApi(invoke: InvokeFn): Api {
  return createNode(invoke, '') as Api
}

export function isTauriRuntime(globalScope: object): boolean {
  return '__TAURI_INTERNALS__' in globalScope
}
