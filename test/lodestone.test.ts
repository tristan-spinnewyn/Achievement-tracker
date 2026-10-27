import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import {
  extractCharacterId,
  fetchLodestoneText,
  lodestoneCharacterUrl,
  scrapeAchievements,
  syncLodestone
} from '../src/main/services/lodestone'
import { store } from '../src/main/data/store'

afterEach(() => vi.unstubAllGlobals())

const page = (entries: { id: number; ts?: number }[], current: number, total: number): string =>
  entries
    .map(
      (e) =>
        `<li class="entry"><a href="/lodestone/character/1/achievement/detail/${e.id}/">x</a>` +
        (e.ts ? `<script>ldst_strftime(${e.ts}, 'YMD')</script>` : '') +
        '</li>'
    )
    .join('') + `<div>Page ${current} of ${total}</div>`

describe('extractCharacterId', () => {
  it('accepts a raw ID or a Lodestone URL', () => {
    expect(extractCharacterId(' 12345 ')).toBe('12345')
    expect(extractCharacterId('https://eu.finalfantasyxiv.com/lodestone/character/987654/')).toBe('987654')
  })

  it('rejects anything that could alter the built URL', () => {
    expect(extractCharacterId('123/../../admin')).toBeNull()
    expect(extractCharacterId('abc')).toBeNull()
    expect(extractCharacterId('')).toBeNull()
  })
})

describe('lodestoneCharacterUrl', () => {
  it('maps the region to its Lodestone subdomain', () => {
    expect(lodestoneCharacterUrl('ja', '7')).toBe('https://jp.finalfantasyxiv.com/lodestone/character/7')
    expect(lodestoneCharacterUrl('fr', '7')).toBe('https://fr.finalfantasyxiv.com/lodestone/character/7')
  })
})

describe('fetchLodestoneText', () => {
  it('sends the browser user agent plus any extra headers', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('ok'))
    vi.stubGlobal('fetch', fetchMock)
    expect(await fetchLodestoneText('https://x', { headers: { 'X-Requested-With': 'XMLHttpRequest' } })).toBe('ok')
    const headers = fetchMock.mock.calls[0][1].headers
    expect(headers['User-Agent']).toMatch(/Mozilla/)
    expect(headers['X-Requested-With']).toBe('XMLHttpRequest')
  })

  it('reports a missing character', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('Page Not Found')))
    await expect(fetchLodestoneText('https://x')).rejects.toThrow('introuvable (404)')
  })

  it('wraps network failures in a Lodestone error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('boom')))
    await expect(fetchLodestoneText('https://x', { retries: 0 })).rejects.toThrow('Lodestone a répondu avec une erreur')
  })
})

describe('scrapeAchievements', () => {
  it('walks every page and extracts IDs and dates', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(page([{ id: 1, ts: 1700000000 }, { id: 2 }], 1, 2)))
      .mockResolvedValueOnce(new Response(page([{ id: 3, ts: 1600000000 }], 2, 2)))
    vi.stubGlobal('fetch', fetchMock)

    const { items, pages } = await scrapeAchievements('42', 'fr')
    expect(pages).toBe(2)
    expect(items).toEqual([
      { id: 1, date: '2023-11-14' },
      { id: 2, date: null },
      { id: 3, date: '2020-09-13' }
    ])
    expect(fetchMock.mock.calls[0][0]).toBe('https://fr.finalfantasyxiv.com/lodestone/character/42/achievement/?page=1')
  })

  it('reports a missing character', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<h1>Character Not Found</h1>')))
    await expect(scrapeAchievements('42', 'eu')).rejects.toThrow('introuvable')
  })

  it('yields no entry on a non-retryable HTTP status', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 403 })))
    // 403 is not retried and its empty body contains no entries
    const { items } = await scrapeAchievements('42', 'eu')
    expect(items).toEqual([])
  })
})

describe('syncLodestone', () => {
  beforeEach(() => {
    store.init()
    store.replaceUser({ settings: { ...store.user.settings, autoBackupDocuments: false } })
    store.catalog = {
      generatedAt: null,
      gameVersion: null,
      kinds: [],
      categories: [],
      achievements: [1, 2].map((id) => ({ id, name: `HF ${id}`, description: '', points: 10, categoryId: 1, kindId: 1, iconPath: null, obtainable: true, patch: '7.0' }))
    }
    store.reindex()
  })

  it('requires a valid character ID', async () => {
    const res = await syncLodestone()
    expect(res.ok).toBe(false)
    expect(res.message).toContain('Aucun ID')
    store.user.settings.lodestoneCharacterId = 'pas-un-id'
    expect((await syncLodestone()).ok).toBe(false)
    expect(store.user.syncLog).toHaveLength(2)
  })

  it('applies the achievements read and updates lastSyncAt', async () => {
    store.user.settings.lodestoneCharacterId = '42'
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(page([{ id: 1, ts: 1700000000 }, { id: 2 }], 1, 1))))
    const res = await syncLodestone()
    expect(res).toMatchObject({ ok: true, newlyCompleted: 2, totalCompleted: 2 })
    expect(res.message).toBe('2 hauts faits lus (1 page(s)) · 2 nouveau(x).')
    expect(store.user.settings.lastSyncAt).toBe(res.at)
    expect(store.user.syncLog[0].ok).toBe(true)
  })

  it('reports an empty list (private achievements)', async () => {
    store.user.settings.lodestoneCharacterId = '42'
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(page([], 1, 1))))
    const res = await syncLodestone()
    expect(res.ok).toBe(false)
    expect(res.message).toContain('Aucun haut fait public')
  })

  it('logs a scraping error', async () => {
    store.user.settings.lodestoneCharacterId = '42'
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<h1>Character Not Found</h1>')))
    const res = await syncLodestone()
    expect(res.ok).toBe(false)
    expect(res.message).toContain('introuvable')
    expect(store.user.syncLog[0].message).toBe(res.message)
  })
})
