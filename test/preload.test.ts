import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const h = vi.hoisted(() => ({
  invoke: vi.fn(async (..._args: unknown[]) => 'ok'),
  on: vi.fn(),
  removeListener: vi.fn(),
  exposeInMainWorld: vi.fn()
}))

vi.mock('electron', () => ({
  ipcRenderer: { invoke: h.invoke, on: h.on, removeListener: h.removeListener },
  contextBridge: { exposeInMainWorld: h.exposeInMainWorld }
}))

type AnyApi = Record<string, unknown>

async function loadPreload(contextIsolated: boolean): Promise<AnyApi> {
  vi.resetModules()
  h.exposeInMainWorld.mockClear()
  Object.defineProperty(process, 'contextIsolated', { value: contextIsolated, configurable: true })
  await import('../src/preload/index')
  if (contextIsolated) return h.exposeInMainWorld.mock.calls[0][1] as AnyApi
  return (globalThis as unknown as { window: { api: AnyApi } }).window.api
}

beforeEach(() => {
  h.invoke.mockClear()
  h.on.mockClear()
  h.removeListener.mockClear()
})

afterEach(() => {
  delete (process as { contextIsolated?: boolean }).contextIsolated
  delete (globalThis as { window?: unknown }).window
})

describe('preload : pont IPC', () => {
  // [chemin dans l'api, arguments, canal attendu, payload attendu]
  const cases: [string, unknown[], string, unknown[]][] = [
    ['catalog.status', [], 'catalog:status', []],
    ['catalog.refresh', [], 'catalog:refresh', []],
    ['achievements.list', [], 'achievements:list', [{}]],
    ['achievements.list', [{ search: 'a' }], 'achievements:list', [{ search: 'a' }]],
    ['achievements.get', [1], 'achievements:get', [1]],
    ['achievements.focusList', [], 'achievements:focusList', []],
    ['achievements.latestPatch', [], 'achievements:latestPatch', []],
    ['achievements.setCompletion', [1, true], 'achievements:setCompletion', [{ id: 1, completed: true }]],
    ['achievements.setPriority', [1, 2], 'achievements:setPriority', [{ id: 1, priority: 2 }]],
    ['achievements.setFocus', [1, false], 'achievements:setFocus', [{ id: 1, inFocus: false }]],
    ['achievements.reorderFocus', [[1, 2]], 'achievements:reorderFocus', [[1, 2]]],
    ['achievements.setNote', [1, 'n'], 'achievements:setNote', [{ id: 1, note: 'n' }]],
    ['achievements.setDeadline', [1, null], 'achievements:setDeadline', [{ id: 1, deadline: null }]],
    ['achievements.setTags', [1, ['t']], 'achievements:setTags', [{ id: 1, tags: ['t'] }]],
    ['meta.kinds', [], 'meta:kinds', []],
    ['meta.categories', [], 'meta:categories', []],
    ['meta.tags', [], 'meta:tags', []],
    ['meta.patches', [], 'meta:patches', []],
    ['meta.seasonalEvents', [], 'meta:seasonalEvents', []],
    ['dashboard', [], 'dashboard:get', []],
    ['data.export', [], 'data:export', []],
    ['data.import', [], 'data:import', []],
    ['data.autoBackupInfo', [], 'data:autoBackupInfo', []],
    ['data.openDocumentsFolder', [], 'data:openDocumentsFolder', []],
    ['history.undo', [], 'history:undo', []],
    ['history.redo', [], 'history:redo', []],
    ['history.canUndo', [], 'history:canUndo', []],
    ['history.canRedo', [], 'history:canRedo', []],
    ['settings.get', [], 'settings:get', []],
    ['settings.update', [{ theme: 'light' }], 'settings:update', [{ theme: 'light' }]],
    ['lodestone.sync', [], 'lodestone:sync', []],
    ['lodestone.syncLog', [], 'lodestone:syncLog', []],
    ['suggestions', [{ priority: 1 }], 'suggestions:get', [{ priority: 1 }]],
    ['collections.status', [], 'collections:status', []],
    ['collections.pending', [], 'collections:pending', []],
    ['collections.allProgress', [], 'collections:allProgress', []],
    ['collections.patches', ['mount'], 'collections:patches', ['mount']],
    ['collections.refresh', [], 'collections:refresh', []],
    ['collections.list', [{ type: 'mount' }], 'collections:list', [{ type: 'mount' }]],
    ['collections.categories', ['mount'], 'collections:categories', ['mount']],
    ['collections.progress', ['mount'], 'collections:progress', ['mount']],
    ['collections.setOwned', ['mount', 3, true], 'collections:setOwned', [{ type: 'mount', id: 3, owned: true }]],
    ['collections.sync', ['minion'], 'collections:sync', ['minion']],
    ['recurring.list', [], 'recurring:list', []],
    ['recurring.add', [{ name: 'x', type: 'daily' }], 'recurring:add', [{ name: 'x', type: 'daily' }]],
    ['recurring.delete', ['id'], 'recurring:delete', ['id']],
    ['recurring.setDone', ['id', true], 'recurring:setDone', [{ id: 'id', done: true }]],
    ['recurring.pending', [], 'recurring:pending', []],
    ['icons.getUrl', ['ui/a.tex'], 'icons:getUrl', ['ui/a.tex']],
    ['icons.prefetch', [['ui/a.tex']], 'icons:prefetch', [['ui/a.tex']]],
    ['difficulty.get', [1], 'difficulty:get', [1]],
    ['difficulty.all', [], 'difficulty:all', []],
    ['difficulty.stats', [], 'difficulty:stats', []],
    ['difficulty.filter', ['easy'], 'difficulty:filter', ['easy']],
    ['difficulty.sort', ['desc'], 'difficulty:sort', ['desc']],
    ['difficulty.weights', [], 'difficulty:weights', []],
    ['difficulty.recalculate', [], 'difficulty:recalculate', []],
    ['updater.check', [], 'updater:check', []],
    ['updater.download', [], 'updater:download', []],
    ['updater.install', [], 'updater:install', []],
    ['updater.status', [], 'updater:status', []],
    ['updater.appVersion', [], 'updater:appVersion', []]
  ]

  it.each(cases)('%s → %s', async (path, args, channel, payload) => {
    const api = await loadPreload(true)
    const fn = path.split('.').reduce<unknown>((o, k) => (o as AnyApi)[k], api) as (...a: unknown[]) => Promise<unknown>
    await expect(fn(...args)).resolves.toBe('ok')
    expect(h.invoke).toHaveBeenCalledWith(channel, ...payload)
  })

  it('expose l’api via contextBridge quand le contexte est isolé', async () => {
    await loadPreload(true)
    expect(h.exposeInMainWorld).toHaveBeenCalledWith('api', expect.any(Object))
  })

  it('journalise un échec d’exposition sans planter', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    h.exposeInMainWorld.mockImplementationOnce(() => {
      throw new Error('déjà exposé')
    })
    vi.resetModules()
    Object.defineProperty(process, 'contextIsolated', { value: true, configurable: true })
    await import('../src/preload/index')
    expect(err).toHaveBeenCalled()
    err.mockRestore()
  })

  it('retombe sur window.api sans isolation de contexte', async () => {
    ;(globalThis as { window?: unknown }).window = {}
    const api = await loadPreload(false)
    expect(api).toHaveProperty('catalog')
    expect(h.exposeInMainWorld).not.toHaveBeenCalled()
  })

  it.each([
    ['onNavigate', 'navigate-to', 'recurring'],
    ['updater.onStatusChange', 'updater:status', { state: 'available' }]
  ])('%s s’abonne et se désabonne de %s', async (path, channel, payload) => {
    const api = await loadPreload(true)
    const subscribe = path.split('.').reduce<unknown>((o, k) => (o as AnyApi)[k], api) as (
      cb: (v: unknown) => void
    ) => () => void
    const cb = vi.fn()
    const unsubscribe = subscribe(cb)
    const [ch, listener] = h.on.mock.calls[0] as [string, (e: unknown, v: unknown) => void]
    expect(ch).toBe(channel)
    listener({}, payload)
    expect(cb).toHaveBeenCalledWith(payload)
    unsubscribe()
    expect(h.removeListener).toHaveBeenCalledWith(channel, listener)
  })
})
