import { describe, expect, it, vi } from 'vitest'
import { createTauriApi, isTauriRuntime, PORTED_COMMANDS, PORTED_EVENTS } from '../src/renderer/src/lib/tauriBridge'

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

  it('routes the backup and update commands', async () => {
    const invoke = vi.fn().mockResolvedValue(undefined)
    const api = createTauriApi(invoke)

    await api.data.export()
    await api.data.import()
    await api.data.autoBackupInfo()
    await api.data.openDocumentsFolder()
    await api.updater.check()
    await api.updater.download()
    await api.updater.install()
    await api.updater.status()
    await api.updater.appVersion()

    expect(invoke.mock.calls.map(([command]) => command)).toEqual([
      'data_export',
      'data_import',
      'data_auto_backup_info',
      'data_open_documents_folder',
      'updater_check',
      'updater_download',
      'updater_install',
      'updater_status',
      'updater_app_version'
    ])
  })

  it('rejects calls to methods that are not ported, naming the method', async () => {
    const invoke = vi.fn()
    const api = createTauriApi(invoke) as unknown as { legacy: { call: () => Promise<unknown> } }

    await expect(api.legacy.call()).rejects.toThrow('Not ported to Tauri yet: legacy.call')
    expect(invoke).not.toHaveBeenCalled()
  })

  it('forwards the payloads of the Tauri events to the subscribers', async () => {
    const handlers = new Map<string, (payload: unknown) => void>()
    const listen = vi.fn(async (event: string, handler: (payload: unknown) => void) => {
      handlers.set(event, handler)
      return () => {}
    })
    const api = createTauriApi(vi.fn(), { listen })
    const views: string[] = []
    const statuses: unknown[] = []

    api.onNavigate((view) => views.push(view))
    api.updater.onStatusChange((status) => statuses.push(status))
    await Promise.resolve()
    handlers.get('navigate-to')?.('recurring')
    handlers.get('updater:status')?.({ state: 'checking' })

    expect(views).toEqual(['recurring'])
    expect(statuses).toEqual([{ state: 'checking' }])
  })

  it('stops listening on unsubscribe, even before the listener is registered', async () => {
    const stops: string[] = []
    const handlers: ((payload: unknown) => void)[] = []
    const listen = vi.fn(async (event: string, handler: (payload: unknown) => void) => {
      handlers.push(handler)
      return () => stops.push(event)
    })
    const api = createTauriApi(vi.fn(), { listen })
    const views: string[] = []

    const offEarly = api.onNavigate((view) => views.push(view))
    offEarly()
    await Promise.resolve()
    const offLate = api.updater.onStatusChange(() => {})
    await Promise.resolve()
    offLate()
    handlers[0]('recurring')

    expect(stops).toEqual(['navigate-to', 'updater:status'])
    expect(views).toEqual([])
  })

  it('logs a subscription the webview refuses instead of throwing', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const listen = vi.fn().mockRejectedValue(new Error('event.listen not allowed'))
    const off = createTauriApi(vi.fn(), { listen }).onNavigate(() => {})
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(warn).toHaveBeenCalledWith('Cannot listen to navigate-to:', expect.any(Error))
    expect(off).not.toThrow()
    warn.mockRestore()
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

  it('maps every subscription to an event name Tauri accepts', () => {
    for (const [path, event] of Object.entries(PORTED_EVENTS)) {
      expect(path, event).toMatch(/(^|\.)on[A-Z]/)
      expect(event, path).toMatch(/^[a-z:-]+$/)
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
