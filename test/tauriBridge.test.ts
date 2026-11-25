import { describe, expect, it, vi } from 'vitest'
import { createTauriApi, isTauriRuntime, PORTED_COMMANDS } from '../src/renderer/src/lib/tauriBridge'

describe('createTauriApi', () => {
  it('routes settings.get to the settings_get Tauri command', async () => {
    const settings = { region: 'eu', language: 'fr' }
    const invoke = vi.fn().mockResolvedValue(settings)
    const api = createTauriApi(invoke)

    await expect(api.settings.get()).resolves.toBe(settings)
    expect(invoke).toHaveBeenCalledWith('settings_get', {})
  })

  it('maps positional arguments to the named arguments of the command', async () => {
    const invoke = vi.fn().mockResolvedValue(true)
    const api = createTauriApi(invoke)

    await api.achievements.setFocus(12, true)
    await api.collections.setOwned('mount', 3, false)
    await api.achievements.setNote(4, null)

    expect(invoke).toHaveBeenNthCalledWith(1, 'achievements_set_focus', { id: 12, inFocus: true })
    expect(invoke).toHaveBeenNthCalledWith(2, 'collections_set_owned', { kind: 'mount', id: 3, owned: false })
    expect(invoke).toHaveBeenNthCalledWith(3, 'achievements_set_note', { id: 4, note: null })
  })

  it('routes difficulty and suggestions with their named arguments', async () => {
    const invoke = vi.fn().mockResolvedValue([])
    const api = createTauriApi(invoke)

    await api.difficulty.get(7)
    await api.difficulty.filter('hard')
    await api.difficulty.sort('desc')
    await api.suggestions({ priority: 1, points: 2, categoryProximity: 3 })

    expect(invoke).toHaveBeenNthCalledWith(1, 'difficulty_get', { achievementId: 7 })
    expect(invoke).toHaveBeenNthCalledWith(2, 'difficulty_filter', { level: 'hard' })
    expect(invoke).toHaveBeenNthCalledWith(3, 'difficulty_sort', { direction: 'desc' })
    expect(invoke).toHaveBeenNthCalledWith(4, 'suggestions_get', {
      weights: { priority: 1, points: 2, categoryProximity: 3 }
    })
  })

  it('routes the network commands', async () => {
    const invoke = vi.fn().mockResolvedValue(undefined)
    const api = createTauriApi(invoke)

    await api.catalog.refresh()
    await api.lodestone.sync()
    await api.icons.prefetch(['ui/icon/1.tex', null])
    await api.collections.refresh()
    await api.collections.sync('minion')

    expect(invoke).toHaveBeenNthCalledWith(1, 'catalog_refresh', {})
    expect(invoke).toHaveBeenNthCalledWith(2, 'lodestone_sync', {})
    expect(invoke).toHaveBeenNthCalledWith(3, 'icons_prefetch', { iconPaths: ['ui/icon/1.tex', null] })
    expect(invoke).toHaveBeenNthCalledWith(4, 'collections_refresh', {})
    expect(invoke).toHaveBeenNthCalledWith(5, 'collections_sync', { kind: 'minion' })
  })

  it('turns a cached icon path into an asset URL and keeps remote URLs', async () => {
    const toAssetUrl = (path: string): string => `asset-url:${path}`
    const local = createTauriApi(vi.fn().mockResolvedValue('C:/cache/ui_icon_1.tex'), { toAssetUrl })
    const remote = createTauriApi(vi.fn().mockResolvedValue('https://v2.xivapi.com/api/asset?path=x'), { toAssetUrl })
    const missing = createTauriApi(vi.fn().mockResolvedValue(null), { toAssetUrl })

    await expect(local.icons.getUrl('ui/icon/1.tex')).resolves.toBe('asset-url:C:/cache/ui_icon_1.tex')
    await expect(remote.icons.getUrl('x')).resolves.toBe('https://v2.xivapi.com/api/asset?path=x')
    await expect(missing.icons.getUrl(null)).resolves.toBeNull()
  })

  it('omits arguments that were not passed', async () => {
    const invoke = vi.fn().mockResolvedValue([])
    await createTauriApi(invoke).achievements.list()
    expect(invoke).toHaveBeenCalledWith('achievements_list', {})
  })

  it('supports top-level methods such as dashboard()', async () => {
    const invoke = vi.fn().mockResolvedValue({ totalAchievements: 3 })
    await expect(createTauriApi(invoke).dashboard()).resolves.toEqual({ totalAchievements: 3 })
    expect(invoke).toHaveBeenCalledWith('dashboard_get', {})
  })

  it('rejects calls to methods that are not ported yet, naming the method', async () => {
    const invoke = vi.fn()
    const api = createTauriApi(invoke)

    await expect(api.updater.check()).rejects.toThrow('Not ported to Tauri yet: updater.check')
    await expect(api.data.export()).rejects.toThrow('Not ported to Tauri yet: data.export')
    expect(invoke).not.toHaveBeenCalled()
  })

  it('returns a no-op unsubscribe for event subscriptions, nested or top-level', () => {
    const api = createTauriApi(vi.fn())

    const offNested = api.updater.onStatusChange(() => {})
    const offTop = api.onNavigate(() => {})

    expect(typeof offNested).toBe('function')
    expect(typeof offTop).toBe('function')
    expect(() => {
      offNested()
      offTop()
    }).not.toThrow()
  })

  it('is not mistaken for a promise when awaited', async () => {
    const api = createTauriApi(vi.fn())
    expect((api as unknown as { then?: unknown }).then).toBeUndefined()
    expect((api.settings as unknown as { then?: unknown }).then).toBeUndefined()
  })

  it('maps every ported method to a snake_case command', () => {
    for (const [path, { command }] of Object.entries(PORTED_COMMANDS)) {
      expect(command, path).toMatch(/^[a-z]+(_[a-z]+)*$/)
    }
  })
})

describe('isTauriRuntime', () => {
  it('detects the Tauri internals injected into the webview', () => {
    expect(isTauriRuntime({ __TAURI_INTERNALS__: {} })).toBe(true)
  })

  it('is false in Electron or a plain browser', () => {
    expect(isTauriRuntime({})).toBe(false)
  })
})
