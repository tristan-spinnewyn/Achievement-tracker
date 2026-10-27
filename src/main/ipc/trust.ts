/**
 * Validation of the IPC message sender.
 * Only the application page (packaged index.html, or the Vite server in dev)
 * may call the main process channels: a third-party page loaded by
 * mistake (navigation, iframe…) must not be able to read or modify the data.
 */

/**
 * @param senderUrl - URL of the sending frame (`event.senderFrame.url`)
 * @param appPageUrl - expected file:// URL of index.html in production
 * @param devServerUrl - URL of the Vite server (ELECTRON_RENDERER_URL), dev only
 */
export function isTrustedSender(
  senderUrl: string | null | undefined,
  appPageUrl: string,
  devServerUrl?: string | null
): boolean {
  if (!senderUrl) return false
  let sender: URL
  try {
    sender = new URL(senderUrl)
  } catch {
    return false
  }

  if (devServerUrl) {
    try {
      if (sender.origin === new URL(devServerUrl).origin) return true
    } catch {
      // Invalid dev URL: fall back to the production check
    }
  }

  const expected = new URL(appPageUrl)
  return (
    sender.protocol === 'file:' &&
    expected.protocol === 'file:' &&
    decodeURIComponent(sender.pathname).toLowerCase() ===
      decodeURIComponent(expected.pathname).toLowerCase()
  )
}
