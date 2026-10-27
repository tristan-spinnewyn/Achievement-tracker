/**
 * Validation de l'émetteur des messages IPC.
 * Seule la page de l'application (index.html empaqueté, ou le serveur Vite en dev)
 * a le droit d'appeler les canaux du main process : une page tierce chargée par
 * erreur (navigation, iframe…) ne doit pas pouvoir lire ou modifier les données.
 */

/**
 * @param senderUrl - URL de la frame émettrice (`event.senderFrame.url`)
 * @param appPageUrl - URL file:// attendue pour index.html en production
 * @param devServerUrl - URL du serveur Vite (ELECTRON_RENDERER_URL), uniquement en dev
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
      // URL de dev invalide : on retombe sur la vérification de production
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
