import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest'
import { join } from 'path'
import { pathToFileURL } from 'url'

const ipc = vi.hoisted(() => ({ handlers: new Map<string, (event: unknown, ...args: unknown[]) => unknown>() }))
vi.mock('electron', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  ipcMain: { handle: (ch: string, fn: (event: unknown, ...args: unknown[]) => unknown) => ipc.handlers.set(ch, fn) }
}))

// Automocks : chaque export devient un vi.fn() — on vérifie le routage, pas la logique métier.
vi.mock('../src/main/data/repo')
vi.mock('../src/main/services/catalog')
vi.mock('../src/main/services/lodestone')
vi.mock('../src/main/services/collections')
vi.mock('../src/main/services/backup')
vi.mock('../src/main/services/suggestions')
vi.mock('../src/main/services/updater')
vi.mock('../src/main/utils/icons')
vi.mock('../src/main/utils/search')

import * as repo from '../src/main/data/repo'
import * as catalog from '../src/main/services/catalog'
import * as lodestone from '../src/main/services/lodestone'
import * as collections from '../src/main/services/collections'
import * as backup from '../src/main/services/backup'
import * as suggestions from '../src/main/services/suggestions'
import * as updater from '../src/main/services/updater'
import * as icons from '../src/main/utils/icons'
import * as search from '../src/main/utils/search'
import { store } from '../src/main/data/store'
import { registerIpcHandlers } from '../src/main/ipc/handlers'
import { setMockPackaged } from './stubs/electron'

const APP_URL = pathToFileURL(join(__dirname, '../src/main/renderer/index.html')).href
const trusted = { senderFrame: { url: APP_URL } }

const invoke = (channel: string, ...args: unknown[]): unknown => {
  const fn = ipc.handlers.get(channel)
  if (!fn) throw new Error(`canal non enregistré : ${channel}`)
  return fn(trusted, ...args)
}

beforeAll(() => registerIpcHandlers())

beforeEach(() => {
  vi.clearAllMocks()
  store.init()
  store.catalog = {
    generatedAt: null,
    gameVersion: null,
    kinds: [{ id: 1, name: 'Combat', order: 1 }],
    categories: [{ id: 1, kindId: 1, name: 'Donjons', order: 1 }],
    achievements: [
      { id: 1, name: 'A', description: '', points: 10, categoryId: 1, kindId: 1, iconPath: null, obtainable: true, patch: '7.0' },
      { id: 2, name: 'B', description: '', points: 50, categoryId: 1, kindId: 1, iconPath: null, obtainable: true, patch: '2.0' }
    ]
  }
  store.reindex()
})

afterEach(() => {
  setMockPackaged(false)
  delete process.env['ELECTRON_RENDERER_URL']
})

describe('contrôle de l’émetteur IPC', () => {
  it('refuse un émetteur non autorisé', () => {
    const fn = ipc.handlers.get('settings:get')!
    expect(() => fn({ senderFrame: { url: 'https://evil.example/' } })).toThrow('IPC refusé')
    expect(() => fn({})).toThrow('IPC refusé')
    expect(repo.getSettings).not.toHaveBeenCalled()
  })

  it('accepte le serveur Vite en dev, pas une fois packagé', () => {
    process.env['ELECTRON_RENDERER_URL'] = 'http://localhost:5173'
    const fn = ipc.handlers.get('settings:get')!
    fn({ senderFrame: { url: 'http://localhost:5173/' } })
    expect(repo.getSettings).toHaveBeenCalledTimes(1)

    setMockPackaged(true)
    expect(() => fn({ senderFrame: { url: 'http://localhost:5173/' } })).toThrow('IPC refusé')
  })
})

describe('routage des canaux', () => {
  // [canal, arguments, fonction attendue, arguments attendus, valeur de retour attendue (optionnelle)]
  const cases: [string, unknown[], () => unknown, unknown[], unknown?][] = [
    ['catalog:status', [], () => repo.getCatalogStatus, []],
    ['achievements:list', [{ search: 'x' }], () => repo.listAchievements, [{ search: 'x' }]],
    ['achievements:focusList', [], () => repo.getFocusList, []],
    ['achievements:latestPatch', [], () => repo.getLatestPatchSummary, []],
    ['achievements:get', [3], () => repo.getAchievementRow, [3]],
    ['achievements:setCompletion', [{ id: 1, completed: true }], () => repo.setManualCompletion, [1, true], true],
    ['achievements:setPriority', [{ id: 1, priority: 2 }], () => repo.setPriority, [1, 2], true],
    ['achievements:setFocus', [{ id: 1, inFocus: true }], () => repo.setFocus, [1, true], true],
    ['achievements:reorderFocus', [[2, 1]], () => repo.reorderFocus, [[2, 1]], true],
    ['achievements:setNote', [{ id: 1, note: 'n' }], () => repo.setNote, [1, 'n'], true],
    ['achievements:setDeadline', [{ id: 1, deadline: null }], () => repo.setDeadline, [1, null], true],
    ['achievements:setTags', [{ id: 1, tags: ['a'] }], () => repo.setAchievementTags, [1, ['a']], true],
    ['meta:kinds', [], () => repo.getKinds, []],
    ['meta:categories', [], () => repo.getCategories, []],
    ['meta:tags', [], () => repo.getAllTags, []],
    ['meta:patches', [], () => repo.getAchievementPatches, []],
    ['meta:seasonalEvents', [], () => repo.getSeasonalEvents, []],
    ['dashboard:get', [], () => repo.getDashboard, []],
    ['data:export', [], () => backup.exportUserData, []],
    ['data:import', [], () => backup.importUserData, []],
    ['data:autoBackupInfo', [], () => backup.getAutoBackupInfo, []],
    ['data:openDocumentsFolder', [], () => backup.openDocumentsBackupFolder, []],
    ['settings:get', [], () => repo.getSettings, []],
    ['settings:update', [{ theme: 'light' }], () => repo.updateSettings, [{ theme: 'light' }]],
    ['lodestone:sync', [], () => lodestone.syncLodestone, []],
    ['lodestone:syncLog', [], () => repo.getSyncLog, []],
    ['history:undo', [], () => repo.undo, []],
    ['history:redo', [], () => repo.redo, []],
    ['history:canUndo', [], () => repo.canUndo, []],
    ['history:canRedo', [], () => repo.canRedo, []],
    ['suggestions:get', [{ priority: 1 }], () => suggestions.getSuggestions, [{ priority: 1 }]],
    ['icons:getUrl', ['ui/a.tex'], () => icons.getIconUrl, ['ui/a.tex']],
    ['icons:prefetch', [['ui/a.tex']], () => icons.prefetchIcons, [['ui/a.tex']]],
    ['collections:status', [], () => repo.getCollectionStatus, []],
    ['collections:pending', [], () => repo.getCollectionPendingByType, []],
    ['collections:allProgress', [], () => repo.getAllCollectionsProgress, []],
    ['collections:patches', ['mount'], () => repo.getCollectionPatches, ['mount']],
    ['collections:refresh', [], () => collections.refreshCollectionsFromApi, []],
    ['collections:list', [{ type: 'mount' }], () => repo.listCollection, [{ type: 'mount' }]],
    ['collections:categories', ['minion'], () => repo.getCollectionCategories, ['minion']],
    ['collections:progress', ['mount'], () => repo.getCollectionProgress, ['mount']],
    ['collections:setOwned', [{ type: 'mount', id: 4, owned: true }], () => repo.setCollectionOwned, ['mount', 4, true], true],
    ['collections:sync', ['emote'], () => collections.syncCollection, ['emote']],
    ['recurring:list', [], () => repo.getRecurringTasks, []],
    ['recurring:add', [{ name: 'x', type: 'daily' }], () => repo.addRecurringTask, [{ name: 'x', type: 'daily' }]],
    ['recurring:delete', ['id1'], () => repo.deleteRecurringTask, ['id1'], true],
    ['recurring:setDone', [{ id: 'id1', done: true }], () => repo.setRecurringDone, ['id1', true], true],
    ['recurring:pending', [], () => repo.countPendingRecurring, []],
    ['updater:check', [], () => updater.checkForUpdates, []],
    ['updater:download', [], () => updater.downloadUpdate, []],
    ['updater:install', [], () => updater.quitAndInstall, []],
    ['updater:status', [], () => updater.getUpdaterStatus, []]
  ]

  it.each(cases)('%s', (channel, args, target, expectedArgs, expectedReturn) => {
    const result = invoke(channel, ...args)
    expect(target()).toHaveBeenCalledWith(...expectedArgs)
    if (expectedReturn !== undefined) expect(result).toBe(expectedReturn)
  })

  it('updater:appVersion renvoie la version de l’app', () => {
    expect(invoke('updater:appVersion')).toBe('1.0.1')
  })

  it('catalog:refresh rafraîchit puis reconstruit l’index et les difficultés', async () => {
    vi.mocked(repo.getSettings).mockReturnValue({ language: 'de' } as never)
    vi.mocked(catalog.refreshCatalogFromXivapi).mockResolvedValue({ seeded: true } as never)
    store.difficulties = new Map()

    await expect(invoke('catalog:refresh')).resolves.toEqual({ seeded: true })
    expect(catalog.refreshCatalogFromXivapi).toHaveBeenCalledWith('de')
    expect(search.updateSearchIndex).toHaveBeenCalled()
    expect(store.difficulties.size).toBe(2)
  })
})

describe('canaux de difficulté', () => {
  it('recalcule puis expose les difficultés', () => {
    expect(invoke('difficulty:recalculate')).toEqual({ success: true, count: 2 })
    expect(invoke('difficulty:get', 1)).toMatchObject({ level: expect.any(String) })
    const all = invoke('difficulty:all') as { id: number }[]
    expect(all.map((d) => d.id).sort()).toEqual([1, 2])
    expect(invoke('difficulty:stats')).toMatchObject({ total: 2 })
    const lvl = store.getDifficulty(1)!.level
    expect(invoke('difficulty:filter', lvl)).toContain(1)
    expect(invoke('difficulty:sort')).toHaveLength(2)
    expect(invoke('difficulty:sort', 'desc')).toHaveLength(2)
    expect(invoke('difficulty:weights')).toEqual({ kind: expect.any(Object), category: expect.any(Object), patch: expect.any(Object) })
  })
})
