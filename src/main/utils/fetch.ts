/**
 * Fetch utilities with robust network error handling.
 * Automatic retry with exponential backoff.
 */

const DEFAULT_RETRIES = 3
const BASE_DELAY_MS = 1000
const MAX_DELAY_MS = 10000
const FETCH_TIMEOUT_MS = 30000

/**
 * Custom error for fetch failures.
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
 * Performs a fetch with retry and exponential backoff.
 * @param url - URL to fetch
 * @param options - Fetch options (headers, method, etc.)
 * @param retries - Number of retries (default: 3)
 * @param baseDelay - Base delay in ms (default: 1000)
 * @param timeout - Timeout in ms (default: 30000)
 * @returns The Response
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

      // Treat HTTP 5xx and 429 errors as retryable
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

    // Do not wait after the last attempt
    if (attempt >= retries) {
      break
    }

    // Compute the delay with exponential backoff + jitter
    const delay = calculateBackoffDelay(attempt, baseDelay)
    await new Promise((resolve) => setTimeout(resolve, delay))
  }

  // If we get here, every attempt failed
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
 * Performs a fetch and returns the text.
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
 * Checks whether an HTTP status is retryable.
 */
function isRetryableStatus(status: number): boolean {
  // Retry on server errors (5xx) and Too Many Requests (429)
  return status >= 500 || status === 429
}

/**
 * Computes the delay with exponential backoff and jitter.
 * Jitter = randomisation to avoid the thundering herd problem.
 */
function calculateBackoffDelay(attempt: number, baseDelay: number): number {
  const exponentialDelay = baseDelay * Math.pow(2, attempt)
  const jitter = exponentialDelay * 0.2 * Math.random()
  return Math.min(MAX_DELAY_MS, exponentialDelay + jitter)
}
