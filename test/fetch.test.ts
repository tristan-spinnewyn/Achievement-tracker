import { describe, it, expect, vi, afterEach } from 'vitest'
import { FetchError, fetchTextWithRetry, fetchWithRetry } from '../src/main/utils/fetch'

afterEach(() => vi.unstubAllGlobals())

const res = (status: number, body = ''): Response => new Response(body, { status })

describe('fetchWithRetry', () => {
  it('renvoie directement une réponse OK ou une erreur non réessayable (404)', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(res(200, 'ok')).mockResolvedValueOnce(res(404))
    vi.stubGlobal('fetch', fetchMock)
    expect((await fetchWithRetry('https://x', {}, 3, 1)).status).toBe(200)
    expect((await fetchWithRetry('https://x', {}, 3, 1)).status).toBe(404)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('réessaie sur 5xx / 429 puis réussit', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(res(503)).mockResolvedValueOnce(res(429)).mockResolvedValue(res(200, 'fin'))
    vi.stubGlobal('fetch', fetchMock)
    expect(await fetchTextWithRetry('https://x', {}, 3, 1)).toBe('fin')
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('lève une FetchError avec le statut après épuisement des tentatives', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(res(500)))
    const err = await fetchWithRetry('https://x', {}, 1, 1).catch((e) => e)
    expect(err).toBeInstanceOf(FetchError)
    expect(err.status).toBe(500)
  })

  it('enveloppe les erreurs réseau dans une FetchError', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('ECONNRESET'))
    vi.stubGlobal('fetch', fetchMock)
    const err = await fetchWithRetry('https://x', {}, 2, 1).catch((e) => e)
    expect(err).toBeInstanceOf(FetchError)
    expect(err.message).toContain('3 tentatives')
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('abandonne une requête qui dépasse le timeout', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => init.signal!.addEventListener('abort', () => reject(new Error('aborted'))))
      )
    )
    const err = await fetchWithRetry('https://x', {}, 0, 1, 10).catch((e) => e)
    expect(err.message).toContain('aborted')
  })
})
