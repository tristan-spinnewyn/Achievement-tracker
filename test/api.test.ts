import { describe, expect, it, vi } from 'vitest'
import { createApi, EVENTS, type Api, type ApiTransport } from '../src/renderer/src/lib/api'

const noListen: ApiTransport['listen'] = () => Promise.resolve(() => {})

function setup(result: unknown = undefined, transport: Partial<ApiTransport> = {}) {
  const invoke = vi.fn().mockResolvedValue(result)
  const api = createApi({ invoke, listen: noListen, toAssetUrl: (path) => path, ...transport })
  return { api, invoke }
}

type Call = (api: Api) => Promise<unknown>

/** Every command method of `window.api`: how it is called, the Tauri command and its named arguments. */
const COMMANDS: [string, Call, string, Record<string, unknown>][] = [
  ['catalog.status', (a) => a.catalog.status(), 'catalog_status', {}],
  ['catalog.refresh', (a) => a.catalog.refresh(), 'catalog_refresh', {}],

  ['achievements.list', (a) => a.achievements.list({ search: 'x' }), 'achievements_list', { filter: { search: 'x' } }],
  ['achievements.get', (a) => a.achievements.get(3), 'achievements_get', { id: 3 }],
  ['achievements.focusList', (a) => a.achievements.focusList(), 'achievements_focus_list', {}],
  ['achievements.latestPatch', (a) => a.achievements.latestPatch(), 'achievements_latest_patch', {}],
  [
    'achievements.setCompletion',
    (a) => a.achievements.setCompletion(3, true),
    'achievements_set_completion',
    { id: 3, completed: true }
  ],
  ['achievements.setPriority', (a) => a.achievements.setPriority(3, 2), 'achievements_set_priority', { id: 3, priority: 2 }],
  ['achievements.setFocus', (a) => a.achievements.setFocus(12, true), 'achievements_set_focus', { id: 12, inFocus: true }],
  ['achievements.reorderFocus', (a) => a.achievements.reorderFocus([2, 1]), 'achievements_reorder_focus', { ids: [2, 1] }],
  ['achievements.setNote', (a) => a.achievements.setNote(4, null), 'achievements_set_note', { id: 4, note: null }],
  [
    'achievements.setDeadline',
    (a) => a.achievements.setDeadline(4, '2026-12-01'),
    'achievements_set_deadline',
    { id: 4, deadline: '2026-12-01' }
  ],
  ['achievements.setTags', (a) => a.achievements.setTags(4, ['raid']), 'achievements_set_tags', { id: 4, tags: ['raid'] }],

  ['meta.kinds', (a) => a.meta.kinds(), 'meta_kinds', {}],
  ['meta.categories', (a) => a.meta.categories(), 'meta_categories', {}],
  ['meta.tags', (a) => a.meta.tags(), 'meta_tags', {}],
  ['meta.patches', (a) => a.meta.patches(), 'meta_patches', {}],
  ['meta.seasonalEvents', (a) => a.meta.seasonalEvents(), 'meta_seasonal_events', {}],

  ['dashboard', (a) => a.dashboard(), 'dashboard_get', {}],

  ['data.export', (a) => a.data.export(), 'data_export', {}],
  ['data.import', (a) => a.data.import(), 'data_import', {}],
  ['data.autoBackupInfo', (a) => a.data.autoBackupInfo(), 'data_auto_backup_info', {}],
  ['data.openDocumentsFolder', (a) => a.data.openDocumentsFolder(), 'data_open_documents_folder', {}],

  ['history.undo', (a) => a.history.undo(), 'history_undo', {}],
  ['history.redo', (a) => a.history.redo(), 'history_redo', {}],
  ['history.canUndo', (a) => a.history.canUndo(), 'history_can_undo', {}],
  ['history.canRedo', (a) => a.history.canRedo(), 'history_can_redo', {}],

  ['settings.get', (a) => a.settings.get(), 'settings_get', {}],
  ['settings.update', (a) => a.settings.update({ theme: 'light' }), 'settings_update', { partial: { theme: 'light' } }],

  ['lodestone.sync', (a) => a.lodestone.sync(), 'lodestone_sync', {}],
  ['lodestone.syncLog', (a) => a.lodestone.syncLog(), 'lodestone_sync_log', {}],

  [
    'suggestions',
    (a) => a.suggestions({ priority: 1, points: 2, categoryProximity: 3 }),
    'suggestions_get',
    { weights: { priority: 1, points: 2, categoryProximity: 3 } }
  ],

  ['collections.status', (a) => a.collections.status(), 'collections_status', {}],
  ['collections.pending', (a) => a.collections.pending(), 'collections_pending', {}],
  ['collections.allProgress', (a) => a.collections.allProgress(), 'collections_all_progress', {}],
  ['collections.patches', (a) => a.collections.patches('emote'), 'collections_patches', { kind: 'emote' }],
  ['collections.refresh', (a) => a.collections.refresh(), 'collections_refresh', {}],
  ['collections.list', (a) => a.collections.list({ type: 'mount' }), 'collections_list', { filter: { type: 'mount' } }],
  ['collections.categories', (a) => a.collections.categories('minion'), 'collections_categories', { kind: 'minion' }],
  ['collections.progress', (a) => a.collections.progress('title'), 'collections_progress', { kind: 'title' }],
  [
    'collections.setOwned',
    (a) => a.collections.setOwned('mount', 3, false),
    'collections_set_owned',
    { kind: 'mount', id: 3, owned: false }
  ],
  ['collections.sync', (a) => a.collections.sync('minion'), 'collections_sync', { kind: 'minion' }],

  ['recurring.list', (a) => a.recurring.list(), 'recurring_list', {}],
  [
    'recurring.add',
    (a) => a.recurring.add({ name: 'Roulette', type: 'daily' }),
    'recurring_add',
    { input: { name: 'Roulette', type: 'daily' } }
  ],
  ['recurring.delete', (a) => a.recurring.delete('r1'), 'recurring_delete', { id: 'r1' }],
  ['recurring.setDone', (a) => a.recurring.setDone('r1', true), 'recurring_set_done', { id: 'r1', done: true }],
  ['recurring.pending', (a) => a.recurring.pending(), 'recurring_pending', {}],

  ['icons.getUrl', (a) => a.icons.getUrl('ui/icon/1.tex'), 'icons_get_url', { iconPath: 'ui/icon/1.tex' }],
  [
    'icons.prefetch',
    (a) => a.icons.prefetch(['ui/icon/1.tex', null]),
    'icons_prefetch',
    { iconPaths: ['ui/icon/1.tex', null] }
  ],

  ['difficulty.get', (a) => a.difficulty.get(7), 'difficulty_get', { achievementId: 7 }],
  ['difficulty.all', (a) => a.difficulty.all(), 'difficulty_all', {}],
  ['difficulty.stats', (a) => a.difficulty.stats(), 'difficulty_stats', {}],
  ['difficulty.filter', (a) => a.difficulty.filter('hard'), 'difficulty_filter', { level: 'hard' }],
  ['difficulty.sort', (a) => a.difficulty.sort('desc'), 'difficulty_sort', { direction: 'desc' }],
  ['difficulty.weights', (a) => a.difficulty.weights(), 'difficulty_weights', {}],
  ['difficulty.recalculate', (a) => a.difficulty.recalculate(), 'difficulty_recalculate', {}],

  ['updater.check', (a) => a.updater.check(), 'updater_check', {}],
  ['updater.download', (a) => a.updater.download(), 'updater_download', {}],
  ['updater.install', (a) => a.updater.install(), 'updater_install', {}],
  ['updater.status', (a) => a.updater.status(), 'updater_status', {}],
  ['updater.appVersion', (a) => a.updater.appVersion(), 'updater_app_version', {}]
]

/** Paths of the functions of an API object (`settings.get`, `dashboard`…). */
function methodPaths(node: object, prefix = ''): string[] {
  return Object.entries(node).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key
    return typeof value === 'function' ? [path] : methodPaths(value as object, path)
  })
}

const isSubscription = (path: string): boolean => /(^|\.)on[A-Z]/.test(path)

describe('createApi: commands', () => {
  it.each(COMMANDS.map(([path, call, command, args]) => ({ path, call, command, args })))(
    '$path calls the $command command',
    async ({ call, command, args }) => {
      const result = { value: 1 }
      const { api, invoke } = setup(result)

      await expect(call(api)).resolves.toBe(result)

      expect(invoke).toHaveBeenCalledTimes(1)
      expect(invoke).toHaveBeenCalledWith(command, args)
    }
  )

  it('maps every method of window.api to a command', () => {
    const { api } = setup()
    const commandMethods = methodPaths(api).filter((path) => !isSubscription(path))

    expect(commandMethods.sort()).toEqual(COMMANDS.map(([path]) => path).sort())
  })

  it('names every command in snake_case', () => {
    for (const [path, , command] of COMMANDS) expect(command, path).toMatch(/^[a-z]+(_[a-z]+)*$/)
  })

  it('lists every achievement when no filter is given', async () => {
    const { api, invoke } = setup([])

    await api.achievements.list()

    expect(invoke).toHaveBeenCalledWith('achievements_list', { filter: {} })
  })

  it('lets the backend apply its default weights when none are given', async () => {
    const { api, invoke } = setup([])

    await api.suggestions()

    expect(invoke.mock.calls[0][1]).toEqual({})
  })

  it('turns a cached icon path into an asset URL and keeps remote URLs', async () => {
    const toAssetUrl = (path: string): string => `asset-url:${path}`
    const local = setup('C:/cache/ui_icon_1.tex', { toAssetUrl }).api
    const remote = setup('https://v2.xivapi.com/api/asset?path=x', { toAssetUrl }).api
    const missing = setup(null, { toAssetUrl }).api

    await expect(local.icons.getUrl('ui/icon/1.tex')).resolves.toBe('asset-url:C:/cache/ui_icon_1.tex')
    await expect(remote.icons.getUrl('x')).resolves.toBe('https://v2.xivapi.com/api/asset?path=x')
    await expect(missing.icons.getUrl(null)).resolves.toBeNull()
  })

  it('propagates the errors of the backend', async () => {
    const invoke = vi.fn().mockRejectedValue('Fichier de sauvegarde invalide.')
    const api = createApi({ invoke, listen: noListen, toAssetUrl: (path) => path })

    await expect(api.data.import()).rejects.toBe('Fichier de sauvegarde invalide.')
  })
})

describe('createApi: events', () => {
  it('forwards the payloads of the backend events to the subscribers', async () => {
    const handlers = new Map<string, (payload: unknown) => void>()
    const listen = vi.fn(async (event: string, handler: (payload: unknown) => void) => {
      handlers.set(event, handler)
      return () => {}
    })
    const { api } = setup(undefined, { listen })
    const views: string[] = []
    const statuses: unknown[] = []

    api.onNavigate((view) => views.push(view))
    api.updater.onStatusChange((status) => statuses.push(status))
    await Promise.resolve()
    handlers.get(EVENTS.navigate)?.('recurring')
    handlers.get(EVENTS.updaterStatus)?.({ state: 'checking' })

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
    const { api } = setup(undefined, { listen })
    const views: string[] = []

    const offEarly = api.onNavigate((view) => views.push(view))
    offEarly()
    await Promise.resolve()
    const offLate = api.updater.onStatusChange(() => {})
    await Promise.resolve()
    offLate()
    handlers[0]('recurring')

    expect(stops).toEqual([EVENTS.navigate, EVENTS.updaterStatus])
    expect(views).toEqual([])
  })

  it('logs a subscription the webview refuses instead of throwing', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const listen = vi.fn().mockRejectedValue(new Error('event.listen not allowed'))
    const off = setup(undefined, { listen }).api.onNavigate(() => {})
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(warn).toHaveBeenCalledWith(`Cannot listen to ${EVENTS.navigate}:`, expect.any(Error))
    expect(off).not.toThrow()
    warn.mockRestore()
  })

  it('uses the event names the backend emits', () => {
    // src-tauri/src/platform/window.rs (NAVIGATE_EVENT) and commands/updater.rs (STATUS_EVENT).
    expect(EVENTS).toEqual({ navigate: 'navigate-to', updaterStatus: 'updater:status' })
  })
})
