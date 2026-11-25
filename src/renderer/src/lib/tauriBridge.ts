/**
 * Tauri implementation of `window.api` (migration in progress).
 *
 * Exposes the same surface as the Electron preload so the renderer does not
 * change. Every property is a callable proxy, so both namespaces
 * (`api.settings.get()`) and top-level methods (`api.dashboard()`) work.
 * Ported methods are routed to Rust commands and subscriptions to Tauri events
 * (see tauriCommands.ts); other methods reject with an explicit error, other
 * subscriptions return a no-op unsubscribe so React effect cleanups keep working.
 */
import type { Api } from '../../../preload/index'
import { PORTED_COMMANDS, PORTED_EVENTS } from './tauriCommands'

export { PORTED_COMMANDS, PORTED_EVENTS }

export type InvokeFn = (command: string, args?: Record<string, unknown>) => Promise<unknown>

/** Registers a handler for an app event; resolves to the function that removes it. */
export type ListenFn = (event: string, handler: (payload: unknown) => void) => Promise<() => void>

export interface BridgeOptions {
  /** Turns a local file path into a URL the webview may load (Tauri `convertFileSrc`). */
  toAssetUrl?: (path: string) => string
  /** Listens to the events sent by the Rust side (Tauri `listen`, unwrapping the payload). */
  listen?: ListenFn
}

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

/** Local paths become asset URLs; remote URLs and null are kept. */
function toWebviewUrl(value: unknown, toAssetUrl: (path: string) => string): unknown {
  return typeof value === 'string' && !/^https?:/.test(value) ? toAssetUrl(value) : value
}

/**
 * Subscribes to an event and returns the unsubscribe function right away, as the
 * preload did: an unsubscribe that comes before the registration still applies.
 */
function subscribe(listen: ListenFn, event: string, callback: (payload: unknown) => void): () => void {
  let unsubscribed = false
  let stop: () => void = noop
  listen(event, (payload) => {
    if (!unsubscribed) callback(payload)
  })
    .then((unlisten) => {
      if (unsubscribed) unlisten()
      else stop = unlisten
    })
    .catch((error) => console.warn(`Cannot listen to ${event}:`, error))
  return () => {
    unsubscribed = true
    stop()
  }
}

function call(invoke: InvokeFn, options: Required<BridgeOptions>, path: string, args: unknown[]): unknown {
  if (isSubscription(path)) {
    const event = PORTED_EVENTS[path]
    return event ? subscribe(options.listen, event, args[0] as (payload: unknown) => void) : noop
  }
  const ported = PORTED_COMMANDS[path]
  if (!ported) return Promise.reject(new Error(`Not ported to Tauri yet: ${path}`))
  const result = invoke(ported.command, namedArgs(ported.params, args))
  return ported.assetUrl ? result.then((value) => toWebviewUrl(value, options.toAssetUrl)) : result
}

function createNode(invoke: InvokeFn, options: Required<BridgeOptions>, path: string): unknown {
  return new Proxy(noop, {
    get: (_target, prop) => {
      // Not a thenable: awaiting a namespace must not call `then` on it.
      if (typeof prop === 'symbol' || prop === 'then') return undefined
      return createNode(invoke, options, path ? `${path}.${prop}` : prop)
    },
    apply: (_target, _thisArg, args: unknown[]) => call(invoke, options, path, args)
  })
}

export function createTauriApi(invoke: InvokeFn, options: BridgeOptions = {}): Api {
  const resolved: Required<BridgeOptions> = {
    toAssetUrl: options.toAssetUrl ?? ((path) => path),
    listen: options.listen ?? (() => Promise.resolve(noop))
  }
  return createNode(invoke, resolved, '') as Api
}

export function isTauriRuntime(globalScope: object): boolean {
  return '__TAURI_INTERNALS__' in globalScope
}
