import { describe, it, expect, vi, afterEach } from 'vitest'
import { extractCharacterId, scrapeAchievements } from '../src/main/services/lodestone'

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
  it('accepte un ID brut ou une URL Lodestone', () => {
    expect(extractCharacterId(' 12345 ')).toBe('12345')
    expect(extractCharacterId('https://eu.finalfantasyxiv.com/lodestone/character/987654/')).toBe('987654')
  })

  it('refuse tout ce qui pourrait altérer l’URL construite', () => {
    expect(extractCharacterId('123/../../admin')).toBeNull()
    expect(extractCharacterId('abc')).toBeNull()
    expect(extractCharacterId('')).toBeNull()
  })
})

describe('scrapeAchievements', () => {
  it('parcourt toutes les pages et extrait IDs et dates', async () => {
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

  it('signale un personnage introuvable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<h1>Character Not Found</h1>')))
    await expect(scrapeAchievements('42', 'eu')).rejects.toThrow('introuvable')
  })

  it('ne produit aucune entrée sur un statut HTTP non réessayable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 403 })))
    // 403 n'est pas réessayé et son corps vide ne contient pas d'entrées
    const { items } = await scrapeAchievements('42', 'eu')
    expect(items).toEqual([])
  })
})
