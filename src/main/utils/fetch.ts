/**
 * Utilitaires de fetch avec gestion des erreurs réseau robuste.
 * Retry automatique avec exponential backoff.
 */

const DEFAULT_RETRIES = 3
const BASE_DELAY_MS = 1000
const MAX_DELAY_MS = 10000
const FETCH_TIMEOUT_MS = 30000

/**
 * Erreur personnalisée pour les échecs de fetch.
 */
export class FetchError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly retriesLeft: number = 0
  ) {
    super(message)
    this.name = 'FetchError'
  }
}

/**
 * Effectue un fetch avec retry et exponential backoff.
 * @param url - URL à fetch
 * @param options - Options de fetch (headers, method, etc.)
 * @param retries - Nombre de tentatives (par défaut: 3)
 * @param baseDelay - Délai de base en ms (par défaut: 1000)
 * @param timeout - Timeout en ms (par défaut: 30000)
 * @returns Réponse Response
 */
export async function fetchWithRetry(
  url: string,
  options: RequestInit = {},
  retries: number = DEFAULT_RETRIES,
  baseDelay: number = BASE_DELAY_MS,
  timeout: number = FETCH_TIMEOUT_MS
): Promise<Response> {
  let lastError: unknown

  for (let attempt = 0; attempt <= retries; attempt++) {
    let timeoutId: NodeJS.Timeout | null = null
    try {
      const controller = new AbortController()
      timeoutId = setTimeout(() => controller.abort(), timeout)

      const response = await fetch(url, {
        ...options,
        signal: controller.signal
      })

      clearTimeout(timeoutId)

      // Considérer les erreurs HTTP 5xx et 429 comme réessayables
      if (response.ok || !isRetryableStatus(response.status)) {
        return response
      }

      lastError = new FetchError(
        `HTTP ${response.status}`,
        response.status,
        retries - attempt
      )
    } catch (error) {
      if (timeoutId) clearTimeout(timeoutId)
      lastError = error
    }

    // Ne pas attendre après la dernière tentative
    if (attempt >= retries) {
      break
    }

    // Calculer le délai avec exponential backoff + jitter
    const delay = calculateBackoffDelay(attempt, baseDelay)
    await new Promise((resolve) => setTimeout(resolve, delay))
  }

  // Si on arrive ici, toutes les tentatives ont échoué
  if (lastError instanceof FetchError) {
    throw lastError
  }
  throw new FetchError(
    `Échec après ${retries + 1} tentatives: ${String(lastError)}`,
    undefined,
    0
  )
}

/**
 * Effectue un fetch et retourne le texte.
 */
export async function fetchTextWithRetry(
  url: string,
  options?: RequestInit,
  retries?: number,
  baseDelay?: number,
  timeout?: number
): Promise<string> {
  const response = await fetchWithRetry(url, options, retries, baseDelay, timeout)
  return response.text()
}

/**
 * Vérifie si un status HTTP est réessayable.
 */
function isRetryableStatus(status: number): boolean {
  // Réessayer sur les erreurs serveur (5xx) et Too Many Requests (429)
  return status >= 500 || status === 429
}

/**
 * Calcule le délai avec exponential backoff et jitter.
 * Jitter = randomisation pour éviter la thundering herd problem.
 */
function calculateBackoffDelay(attempt: number, baseDelay: number): number {
  const exponentialDelay = baseDelay * Math.pow(2, attempt)
  const jitter = exponentialDelay * 0.2 * Math.random()
  return Math.min(MAX_DELAY_MS, exponentialDelay + jitter)
}
