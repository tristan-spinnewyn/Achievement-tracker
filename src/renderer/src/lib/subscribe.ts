/** Registers a handler for a backend event; resolves to the function that removes it. */
export type ListenFn = (event: string, handler: (payload: unknown) => void) => Promise<() => void>

const noop = (): void => {}

/**
 * Subscribes to a backend event and returns the unsubscribe function right away,
 * so that a React effect cleanup can run before the registration completes.
 * A subscription the webview refuses is logged instead of breaking the view.
 */
export function subscribe(listen: ListenFn, event: string, callback: (payload: unknown) => void): () => void {
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
