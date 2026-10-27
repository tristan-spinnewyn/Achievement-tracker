import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { app } from 'electron'
import type { CatalogSnapshot } from '@shared/types'
import { store } from '../src/main/data/store'
import { loadSnapshotIntoStore, seedCatalogIfEmpty, refreshCatalogFromXivapi } from '../src/main/services/catalog'
import { setMockPackaged } from './stubs/electron'

let appDir: string

const snapshot = (generatedAt: string, count = 2): CatalogSnapshot => ({
  generatedAt,
  gameVersion: '7.3',
  kinds: [{ id: 1, name: 'Combat', order: 1 }],
  categories: [{ id: 1, kindId: 1, name: 'Donjons', order: 1 }],
  achievements: Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    name: `HF ${i + 1}`,
    description: '',
    points: 10,
    categoryId: 1,
    kindId: 1,
    iconPath: null,
    obtainable: true,
    patch: '7.0'
  }))
})

const writeSnapshot = (content: string | CatalogSnapshot): void => {
  mkdirSync(join(appDir, 'resources'), { recursive: true })
  writeFileSync(
    join(appDir, 'resources', 'catalog-snapshot.json'),
    typeof content === 'string' ? content : JSON.stringify(content)
  )
}

beforeEach(() => {
  appDir = mkdtempSync(join(tmpdir(), 'catalog-test-'))
  vi.spyOn(app, 'getAppPath').mockReturnValue(appDir)
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'log').mockImplementation(() => {})
  store.init()
  store.catalog = { generatedAt: null, gameVersion: null, kinds: [], categories: [], achievements: [] }
  store.reindex()
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  setMockPackaged(false)
  rmSync(appDir, { recursive: true, force: true })
})

describe('loadSnapshotIntoStore', () => {
  it('charge le snapshot embarqué dans le store', () => {
    writeSnapshot(snapshot('2026-01-01'))
    expect(loadSnapshotIntoStore()).toBe(true)
    expect(store.catalog.achievements).toHaveLength(2)
    expect(store.achievementById.get(1)?.name).toBe('HF 1')
  })

  it('échoue proprement si le snapshot est absent ou corrompu', () => {
    expect(loadSnapshotIntoStore()).toBe(false)
    writeSnapshot('{pas du json')
    expect(loadSnapshotIntoStore()).toBe(false)
    expect(console.error).toHaveBeenCalled()
  })

  it('lit le snapshot depuis process.resourcesPath une fois packagé', () => {
    setMockPackaged(true)
    ;(process as { resourcesPath?: string }).resourcesPath = appDir
    writeSnapshot(snapshot('2026-01-01'))
    expect(loadSnapshotIntoStore()).toBe(true)
  })
})

describe('seedCatalogIfEmpty', () => {
  it('seed un catalogue vide', () => {
    writeSnapshot(snapshot('2026-01-01'))
    seedCatalogIfEmpty()
    expect(store.catalog.achievements).toHaveLength(2)
  })

  it('remplace un catalogue plus ancien que le snapshot, pas un plus récent', () => {
    writeSnapshot(snapshot('2026-01-01', 3))
    store.catalog = { ...snapshot('2025-01-01', 1) }
    seedCatalogIfEmpty()
    expect(store.catalog.achievements).toHaveLength(3)

    store.catalog = { ...snapshot('2027-01-01', 1) }
    seedCatalogIfEmpty()
    expect(store.catalog.achievements).toHaveLength(1)
  })

  it('re-seed si la date stockée est absente', () => {
    writeSnapshot(snapshot('2026-01-01', 3))
    store.catalog = { ...snapshot('x', 1), generatedAt: null }
    seedCatalogIfEmpty()
    expect(store.catalog.achievements).toHaveLength(3)
  })

  it('journalise sans planter si le snapshot est absent ou illisible', () => {
    seedCatalogIfEmpty()
    expect(console.error).toHaveBeenCalledTimes(1)

    store.catalog = snapshot('2026-01-01', 1)
    seedCatalogIfEmpty() // catalogue présent : pas d'erreur
    expect(console.error).toHaveBeenCalledTimes(1)

    writeSnapshot('{oops')
    seedCatalogIfEmpty()
    expect(console.error).toHaveBeenCalledTimes(2)
  })
})

describe('refreshCatalogFromXivapi', () => {
  const cat = (id: number, kindId: number, order: number) => ({
    row_id: id,
    fields: { Name: `Cat ${id}`, Order: order, AchievementKind: { value: kindId, fields: { Name: `Kind ${kindId}`, Order: order } } }
  })

  it('pagine XIVAPI, construit le catalogue et fusionne les patchs FFXIV Collect', async () => {
    const pages = [
      {
        version: 'v7',
        rows: [
          { row_id: 1, fields: { Name: ' Alpha ', Description: 'd', Points: 10, Icon: { path: 'ui/a.tex' }, AchievementCategory: cat(2, 1, 2) } },
          { row_id: 2, fields: { Name: '', AchievementCategory: cat(2, 1, 2) } },
          { row_id: 3, fields: { Name: 'Bravo', AchievementCategory: cat(1, 2, 1) } }
        ]
      },
      { rows: [{ row_id: 4, fields: { Name: 'Charlie' } }, { row_id: 5 }] },
      { rows: [] }
    ]
    const urls: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        urls.push(url)
        if (url.includes('ffxivcollect')) {
          return Response.json({ results: [{ id: 1, patch: '7.1' }, { id: 3 }] })
        }
        return Response.json(pages.shift())
      })
    )

    const status = await refreshCatalogFromXivapi('en')
    expect(status).toMatchObject({ seeded: true, achievementCount: 3, gameVersion: 'v7' })
    expect(urls[0]).toContain('language=en')
    expect(urls[1]).toContain('after=3')
    expect(store.catalog.kinds.map((k) => k.id)).toEqual([2, 1])
    expect(store.catalog.categories.map((c) => c.id)).toEqual([1, 2])
    const alpha = store.achievementById.get(1)!
    expect(alpha).toMatchObject({ name: 'Alpha', points: 10, iconPath: 'ui/a.tex', categoryId: 2, kindId: 1, patch: '7.1' })
    expect(store.achievementById.get(4)).toMatchObject({ categoryId: 0, kindId: 0, description: '', points: 0, iconPath: null, patch: null })
  })

  it('lève une erreur sur un statut HTTP XIVAPI en échec', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 503 })))
    await expect(refreshCatalogFromXivapi()).rejects.toThrow('XIVAPI HTTP 503')
  })

  it('continue sans patchs si FFXIV Collect est indisponible', async () => {
    const pages = [{ rows: [{ row_id: 1, fields: { Name: 'A' } }] }, { rows: [] }]
    let collectCalls = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('ffxivcollect')) {
          collectCalls++
          if (collectCalls === 1) return new Response('', { status: 500 })
          throw new Error('offline')
        }
        return Response.json(pages.shift() ?? { rows: [] })
      })
    )
    await refreshCatalogFromXivapi()
    expect(store.achievementById.get(1)?.patch).toBeNull()

    pages.push({ rows: [{ row_id: 1, fields: { Name: 'A' } }] }, { rows: [] })
    await refreshCatalogFromXivapi()
    expect(store.achievementById.get(1)?.patch).toBeNull()
  })

  it('stoppe la pagination après 50 pages (garde-fou)', async () => {
    let n = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('ffxivcollect')) return Response.json({})
        n++
        return Response.json({ rows: [{ row_id: n, fields: { Name: `HF ${n}` } }] })
      })
    )
    await refreshCatalogFromXivapi()
    expect(n).toBe(51)
  })
})
