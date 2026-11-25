/**
 * `window.api`: the renderer's access to the Rust backend.
 *
 * Each method calls one Tauri command with named arguments (Tauri converts their
 * camelCase names to the snake_case parameters of the Rust command); each `on…`
 * method subscribes to an event the backend emits and returns its unsubscribe.
 */
import type {
  AchievementCategory,
  AchievementDifficulty,
  AchievementFilter,
  AchievementKind,
  AchievementRow,
  AutoBackupInfo,
  CatalogStatus,
  CollectionCategory,
  CollectionFilter,
  CollectionItemRow,
  CollectionProgress,
  CollectionSyncResult,
  CollectionType,
  DashboardData,
  DifficultyLevel,
  Priority,
  RecurringTask,
  RecurringType,
  Settings,
  Suggestion,
  SuggestionWeights,
  SyncLogEntry,
  SyncResult,
  UpdateStatus
} from '@shared/types'
import { subscribe, type ListenFn } from './subscribe'

export type InvokeFn = (command: string, args?: Record<string, unknown>) => Promise<unknown>

/** What the adapter needs from Tauri, injected so that tests can fake it. */
export interface ApiTransport {
  invoke: InvokeFn
  listen: ListenFn
  /** Turns a local file path into a URL the webview may load (Tauri `convertFileSrc`). */
  toAssetUrl: (path: string) => string
}

/** Events emitted by the backend (src-tauri/src/platform/window.rs, commands/updater.rs). */
export const EVENTS = { navigate: 'navigate-to', updaterStatus: 'updater:status' } as const

type BackupResult = { ok: boolean; canceled?: boolean; path?: string; error?: string }
type CollectionCounts = Record<CollectionType, number>
type DifficultySummary = { id: number; score: number; level: DifficultyLevel; levelName: string; color: string; stars: string }
type RankedAchievement = { id: number; name: string; score: number }

/** Local paths become asset URLs; remote URLs and null are kept. */
function toWebviewUrl(value: string | null, toAssetUrl: (path: string) => string): string | null {
  return value !== null && !/^https?:/.test(value) ? toAssetUrl(value) : value
}

export function createApi({ invoke, listen, toAssetUrl }: ApiTransport) {
  const call = <T>(command: string, args: Record<string, unknown> = {}): Promise<T> =>
    invoke(command, args) as Promise<T>
  const on =
    <T>(event: string) =>
    (callback: (payload: T) => void): (() => void) =>
      subscribe(listen, event, (payload) => callback(payload as T))

  return {
    catalog: {
      status: () => call<CatalogStatus>('catalog_status'),
      refresh: () => call<CatalogStatus>('catalog_refresh')
    },
    achievements: {
      list: (filter: AchievementFilter = {}) => call<AchievementRow[]>('achievements_list', { filter }),
      get: (id: number) => call<AchievementRow | null>('achievements_get', { id }),
      focusList: () => call<AchievementRow[]>('achievements_focus_list'),
      latestPatch: () =>
        call<{ patch: string | null; pending: number; total: number }>('achievements_latest_patch'),
      setCompletion: (id: number, completed: boolean) =>
        call<boolean>('achievements_set_completion', { id, completed }),
      setPriority: (id: number, priority: Priority) => call<boolean>('achievements_set_priority', { id, priority }),
      setFocus: (id: number, inFocus: boolean) => call<boolean>('achievements_set_focus', { id, inFocus }),
      reorderFocus: (ids: number[]) => call<boolean>('achievements_reorder_focus', { ids }),
      setNote: (id: number, note: string | null) => call<boolean>('achievements_set_note', { id, note }),
      setDeadline: (id: number, deadline: string | null) =>
        call<boolean>('achievements_set_deadline', { id, deadline }),
      setTags: (id: number, tags: string[]) => call<boolean>('achievements_set_tags', { id, tags })
    },
    meta: {
      kinds: () => call<AchievementKind[]>('meta_kinds'),
      categories: () => call<AchievementCategory[]>('meta_categories'),
      tags: () => call<string[]>('meta_tags'),
      patches: () => call<string[]>('meta_patches'),
      seasonalEvents: () => call<string[]>('meta_seasonal_events')
    },
    dashboard: () => call<DashboardData>('dashboard_get'),
    data: {
      export: () => call<BackupResult>('data_export'),
      import: () => call<BackupResult>('data_import'),
      autoBackupInfo: () => call<AutoBackupInfo>('data_auto_backup_info'),
      openDocumentsFolder: () => call<string>('data_open_documents_folder')
    },
    history: {
      undo: () => call<boolean>('history_undo'),
      redo: () => call<boolean>('history_redo'),
      canUndo: () => call<boolean>('history_can_undo'),
      canRedo: () => call<boolean>('history_can_redo')
    },
    settings: {
      get: () => call<Settings>('settings_get'),
      update: (partial: Partial<Settings>) => call<Settings>('settings_update', { partial })
    },
    lodestone: {
      sync: () => call<SyncResult>('lodestone_sync'),
      syncLog: () => call<SyncLogEntry[]>('lodestone_sync_log')
    },
    suggestions: (weights?: SuggestionWeights) => call<Suggestion[]>('suggestions_get', { weights }),
    collections: {
      status: () =>
        call<{ seeded: boolean; counts: CollectionCounts; generatedAt: string | null; gameVersion: string | null }>(
          'collections_status'
        ),
      pending: () => call<CollectionCounts>('collections_pending'),
      allProgress: () => call<{ type: CollectionType; owned: number; total: number }[]>('collections_all_progress'),
      patches: (kind: CollectionType) => call<string[]>('collections_patches', { kind }),
      refresh: () => call<{ seeded: boolean; counts: CollectionCounts }>('collections_refresh'),
      list: (filter: CollectionFilter) => call<CollectionItemRow[]>('collections_list', { filter }),
      categories: (kind: CollectionType) => call<CollectionCategory[]>('collections_categories', { kind }),
      progress: (kind: CollectionType) => call<CollectionProgress>('collections_progress', { kind }),
      setOwned: (kind: CollectionType, id: number, owned: boolean) =>
        call<boolean>('collections_set_owned', { kind, id, owned }),
      sync: (kind: CollectionType) => call<CollectionSyncResult>('collections_sync', { kind })
    },
    recurring: {
      list: () => call<RecurringTask[]>('recurring_list'),
      add: (input: { name: string; type: RecurringType; achievementId?: number | null; iconPath?: string | null }) =>
        call<RecurringTask>('recurring_add', { input }),
      delete: (id: string) => call<boolean>('recurring_delete', { id }),
      setDone: (id: string, done: boolean) => call<boolean>('recurring_set_done', { id, done }),
      pending: () => call<{ daily: number; weekly: number; daily22: number }>('recurring_pending')
    },
    icons: {
      getUrl: (iconPath: string | null) =>
        call<string | null>('icons_get_url', { iconPath }).then((url) => toWebviewUrl(url, toAssetUrl)),
      prefetch: (iconPaths: (string | null)[]) => call<void>('icons_prefetch', { iconPaths })
    },
    difficulty: {
      get: (achievementId: number) => call<AchievementDifficulty | undefined>('difficulty_get', { achievementId }),
      all: () => call<DifficultySummary[]>('difficulty_all'),
      stats: () =>
        call<{
          total: number
          byLevel: Record<DifficultyLevel, number>
          averageScore: number
          hardest: RankedAchievement | null
          easiest: RankedAchievement | null
        }>('difficulty_stats'),
      filter: (level: DifficultyLevel | null) => call<number[]>('difficulty_filter', { level }),
      sort: (direction: 'asc' | 'desc') => call<number[]>('difficulty_sort', { direction }),
      weights: () =>
        call<{ kind: Record<number, number>; category: Record<number, number>; patch: Record<string, number> }>(
          'difficulty_weights'
        ),
      recalculate: () => call<{ success: boolean; count: number }>('difficulty_recalculate')
    },
    /** Navigation requested by the backend (e.g. a click on a notification). */
    onNavigate: on<string>(EVENTS.navigate),
    updater: {
      check: () => call<UpdateStatus>('updater_check'),
      download: () => call<void>('updater_download'),
      install: () => call<void>('updater_install'),
      status: () => call<UpdateStatus>('updater_status'),
      appVersion: () => call<string>('updater_app_version'),
      onStatusChange: on<UpdateStatus>(EVENTS.updaterStatus)
    }
  }
}

export type Api = ReturnType<typeof createApi>
