import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { app } from 'electron'
import type { CollectionItem, CollectionsSnapshot } from '@shared/types'

const fetchMock = vi.hoisted(() => ({ fn: vi.fn<(url: string) => Promise<string>>() }))
vi.mock('../src/main/utils/fetch', () => ({ fetchTextWithRetry: (url: string) => fetchMock.fn(url) }))

const built = vi.hoisted(() => ({ fn: vi.fn() }))
vi.mock('../src/main/services/collectionsCatalog', () => ({ buildCollections: () => built.fn() }))

import { store } from '../src/main/data/store'
import {
  loadCollectionsSnapshot,
  seedCollectionsIfEmpty,
  refreshCollectionsFromApi,
  syncCollection
} from '../src/main/services/collections'
import { setMockPackaged } from './stubs/electron'

let appDir: string

const item = (id: number, partial: Partial<CollectionItem> = {}): CollectionItem => ({
  type: 'mount',
  id,
  name: `Monture ${id}`,
  description: '',
  iconPath: null,
  categoryId: null,
  order: id,
  patch: '7.0',
  sources: [],
  aliases: [`monture ${id}`],
  ...partial
})

const snapshot = (generatedAt: string, count = 2): CollectionsSnapshot => ({
  generatedAt,
  gameVersion: '7.3',
  categories: [],
  items: Array.from({ length: count }, (_, i) => item(i + 1))
})

const writeSnapshot = (content: string | CollectionsSnapshot): void => {
  mkdirSync(join(appDir, 'resources'), { recursive: true })
  writeFileSync(
    join(appDir, 'resources', 'collections-snapshot.json'),
    typeof content === 'string' ? content : JSON.stringify(content)
  )
}

beforeEach(() => {
  appDir = mkdtempSync(join(tmpdir(), 'collections-test-'))
  vi.spyOn(app, 'getAppPath').mockReturnValue(appDir)
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'log').mockImplementation(() => {})
  fetchMock.fn.mockReset()
  built.fn.mockReset()
  store.init()
  store.replaceUser({ settings: { ...store.user.settings, autoBackupDocuments: false } })
  store.collections = { generatedAt: null, gameVersion: null, categories: [], items: [] }
  store.reindex()
})

afterEach(() => {
  vi.restoreAllMocks()
  setMockPackaged(false)
  rmSync(appDir, { recursive: true, force: true })
})

describe('snapshot des collections', () => {
  it('loadCollectionsSnapshot charge, ou échoue proprement', () => {
    expect(loadCollectionsSnapshot()).toBe(false)
    writeSnapshot('{bad')
    expect(loadCollectionsSnapshot()).toBe(false)
    writeSnapshot(snapshot('2026-01-01'))
    expect(loadCollectionsSnapshot()).toBe(true)
    expect(store.collections.items).toHaveLength(2)
  })

  it('lit depuis resourcesPath une fois packagé', () => {
    setMockPackaged(true)
    ;(process as { resourcesPath?: string }).resourcesPath = appDir
    writeSnapshot(snapshot('2026-01-01'))
    expect(loadCollectionsSnapshot()).toBe(true)
  })

  it('seedCollectionsIfEmpty ne remplace que par un snapshot plus récent', () => {
    seedCollectionsIfEmpty()
    expect(console.error).toHaveBeenCalledTimes(1)

    writeSnapshot(snapshot('2026-01-01', 3))
    seedCollectionsIfEmpty()
    expect(store.collections.items).toHaveLength(3)

    store.collections = snapshot('2027-01-01', 1)
    seedCollectionsIfEmpty()
    expect(store.collections.items).toHaveLength(1)

    store.collections = { ...snapshot('', 1), generatedAt: null }
    seedCollectionsIfEmpty()
    expect(store.collections.items).toHaveLength(3)
  })

  it('seedCollectionsIfEmpty journalise un snapshot illisible ou absent avec cache rempli', () => {
    store.collections = snapshot('2026-01-01', 1)
    seedCollectionsIfEmpty() // absent mais cache présent : silencieux
    expect(console.error).not.toHaveBeenCalled()
    writeSnapshot('{bad')
    seedCollectionsIfEmpty()
    expect(console.error).toHaveBeenCalledTimes(1)
  })
})

describe('refreshCollectionsFromApi', () => {
  it('remplace le catalogue sans toucher aux possessions', async () => {
    store.user.collections['mount:1'] = { owned: true, ownedDate: null, source: 'manual', updatedAt: '' }
    built.fn.mockResolvedValue({ gameVersion: '7.4', categories: [], items: [item(1), item(2), item(3)] })
    const status = await refreshCollectionsFromApi()
    expect(store.collections.items).toHaveLength(3)
    expect(store.collections.gameVersion).toBe('7.4')
    expect(status.counts.mount).toBe(3)
    expect(store.user.collections['mount:1'].owned).toBe(true)
  })

  it('retombe sur la version du catalogue des hauts faits', async () => {
    store.catalog.gameVersion = '7.2'
    built.fn.mockResolvedValue({ gameVersion: '', categories: [], items: [] })
    await refreshCollectionsFromApi()
    expect(store.collections.gameVersion).toBe('7.2')
  })
})

describe('syncCollection', () => {
  const tooltip = (name: string, kind = 'label'): string => `<div class="x__header__${kind}">${name}</div>`

  beforeEach(() => {
    store.collections = {
      generatedAt: null,
      gameVersion: null,
      categories: [],
      items: [item(1, { aliases: ['licorne'] }), item(2, { aliases: ["chocobo d'or & co"] }), item(3, { type: 'emote', aliases: ['danse'] })]
    }
    store.reindex()
    store.user.settings.lodestoneCharacterId = 'https://eu.finalfantasyxiv.com/lodestone/character/4242/'
    store.user.settings.region = 'fr'
  })

  it('refuse une collection non synchronisable', async () => {
    const res = await syncCollection('orchestrion')
    expect(res.ok).toBe(false)
    expect(res.message).toContain("n'est pas synchronisable")
    expect(store.user.syncLog[0].message).toMatch(/^\[orchestrion\]/)
  })

  it('exige un ID de personnage', async () => {
    store.user.settings.lodestoneCharacterId = null
    expect((await syncCollection('mount')).message).toContain('Aucun ID')
    store.user.settings.lodestoneCharacterId = 'abc'
    expect((await syncCollection('mount')).message).toContain('Aucun ID')
  })

  it('scrape la liste, résout les tooltips, met en cache et applique les possessions', async () => {
    fetchMock.fn.mockImplementation(async (url) => {
      if (url.endsWith('/mount/'))
        return 'mount/tooltip/aa mount/tooltip/bb mount/tooltip/aa mount/tooltip/cc mount/tooltip/dd'
      if (url.endsWith('/aa')) return tooltip('Licorne')
      if (url.endsWith('/bb')) return tooltip('Chocobo d&#39;or &amp; co')
      if (url.endsWith('/cc')) return tooltip('Inconnue')
      if (url.endsWith('/dd')) throw new Error('timeout')
      throw new Error(`url inattendue ${url}`)
    })

    const res = await syncCollection('mount')
    expect(fetchMock.fn.mock.calls[0][0]).toBe('https://fr.finalfantasyxiv.com/lodestone/character/4242/mount/')
    expect(res).toMatchObject({ ok: true, type: 'mount', matched: 2, unmatched: 1, newly: 2 })
    expect(res.message).toBe('2 reconnu(s) · 2 nouveau(x) · 1 non reconnu(s) (3 téléchargé(s)).')
    expect(store.user.collectionHashCache['mount:aa']).toBe('Licorne')
    expect(store.user.collections['mount:1'].owned).toBe(true)

    // 2ᵉ synchro : seul le tooltip en échec est retéléchargé
    fetchMock.fn.mockClear()
    const again = await syncCollection('mount')
    expect(fetchMock.fn).toHaveBeenCalledTimes(2)
    expect(again.message).toContain('3 en cache')
    expect(again.newly).toBe(0)
  })

  it('décode les entités hexadécimales et lit le libellé des emotes', async () => {
    fetchMock.fn.mockImplementation(async (url) => {
      if (url.endsWith('/emote/')) return 'emote/tooltip/ee emote/tooltip/ff'
      if (url.endsWith('/ee')) return tooltip('D&#x61;nse', 'name')
      return tooltip('&quot;x&quot; &lt;&gt; &apos;', 'name')
    })
    const res = await syncCollection('emote')
    expect(res.matched).toBe(1)
    expect(store.user.collectionHashCache['emote:ff']).toBe(`"x" <> '`)
  })

  it('signale une liste vide (collection privée)', async () => {
    store.user.settings.lodestoneCharacterId = '4242'
    fetchMock.fn.mockResolvedValue('<html>rien</html>')
    const res = await syncCollection('minion')
    expect(res.ok).toBe(false)
    expect(res.message).toContain('Liste vide')
  })

  it('traduit un personnage introuvable et les erreurs réseau', async () => {
    fetchMock.fn.mockResolvedValueOnce('<h1>Character Not Found</h1>')
    expect((await syncCollection('mount')).message).toContain('introuvable (404)')

    fetchMock.fn.mockRejectedValueOnce(new Error('HTTP 404'))
    expect((await syncCollection('mount')).message).toContain('introuvable (404)')

    fetchMock.fn.mockRejectedValueOnce(new Error('ECONNRESET'))
    expect((await syncCollection('mount')).message).toBe('Lodestone a répondu avec une erreur : ECONNRESET')

    fetchMock.fn.mockRejectedValueOnce('boom')
    expect((await syncCollection('mount')).message).toBe('Lodestone a répondu avec une erreur : boom')
  })
})
