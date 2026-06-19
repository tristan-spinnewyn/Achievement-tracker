import { contextBridge, ipcRenderer } from 'electron'
import type {
  AchievementCategory,
  AchievementDifficulty,
  AchievementFilter,
  AchievementKind,
  AchievementRow,
  CatalogStatus,
  CollectionCategory,
  CollectionFilter,
  CollectionItemRow,
  CollectionProgress,
  CollectionSyncResult,
  CollectionType,
  DashboardData,
  DifficultyLevel,
  DifficultyWeights,
  Priority,
  RecurringTask,
  RecurringType,
  Settings,
  Suggestion,
  SuggestionWeights,
  SyncLogEntry,
  SyncResult
} from '../shared/types'

const api = {
  catalog: {
    status: (): Promise<CatalogStatus> => ipcRenderer.invoke('catalog:status'),
    refresh: (): Promise<CatalogStatus> => ipcRenderer.invoke('catalog:refresh')
  },
  achievements: {
    list: (filter: AchievementFilter = {}): Promise<AchievementRow[]> =>
      ipcRenderer.invoke('achievements:list', filter),
    get: (id: number): Promise<AchievementRow | null> =>
      ipcRenderer.invoke('achievements:get', id),
    focusList: (): Promise<AchievementRow[]> => ipcRenderer.invoke('achievements:focusList'),
    latestPatch: (): Promise<{ patch: string | null; pending: number; total: number }> =>
      ipcRenderer.invoke('achievements:latestPatch'),
    setCompletion: (id: number, completed: boolean): Promise<boolean> =>
      ipcRenderer.invoke('achievements:setCompletion', { id, completed }),
    setPriority: (id: number, priority: Priority): Promise<boolean> =>
      ipcRenderer.invoke('achievements:setPriority', { id, priority }),
    setFocus: (id: number, inFocus: boolean): Promise<boolean> =>
      ipcRenderer.invoke('achievements:setFocus', { id, inFocus }),
    reorderFocus: (ids: number[]): Promise<boolean> =>
      ipcRenderer.invoke('achievements:reorderFocus', ids),
    setNote: (id: number, note: string | null): Promise<boolean> =>
      ipcRenderer.invoke('achievements:setNote', { id, note }),
    setDeadline: (id: number, deadline: string | null): Promise<boolean> =>
      ipcRenderer.invoke('achievements:setDeadline', { id, deadline }),
    setTags: (id: number, tags: string[]): Promise<boolean> =>
      ipcRenderer.invoke('achievements:setTags', { id, tags })
  },
  meta: {
    kinds: (): Promise<AchievementKind[]> => ipcRenderer.invoke('meta:kinds'),
    categories: (): Promise<AchievementCategory[]> => ipcRenderer.invoke('meta:categories'),
    tags: (): Promise<string[]> => ipcRenderer.invoke('meta:tags'),
    patches: (): Promise<string[]> => ipcRenderer.invoke('meta:patches'),
    seasonalEvents: (): Promise<string[]> => ipcRenderer.invoke('meta:seasonalEvents')
  },
  dashboard: (): Promise<DashboardData> => ipcRenderer.invoke('dashboard:get'),
  data: {
    export: (): Promise<{ ok: boolean; canceled?: boolean; path?: string; error?: string }> =>
      ipcRenderer.invoke('data:export'),
    import: (): Promise<{ ok: boolean; canceled?: boolean; path?: string; error?: string }> =>
      ipcRenderer.invoke('data:import')
  },
  history: {
    undo: (): Promise<boolean> => ipcRenderer.invoke('history:undo'),
    redo: (): Promise<boolean> => ipcRenderer.invoke('history:redo'),
    canUndo: (): Promise<boolean> => ipcRenderer.invoke('history:canUndo'),
    canRedo: (): Promise<boolean> => ipcRenderer.invoke('history:canRedo')
  },
  settings: {
    get: (): Promise<Settings> => ipcRenderer.invoke('settings:get'),
    update: (partial: Partial<Settings>): Promise<Settings> =>
      ipcRenderer.invoke('settings:update', partial)
  },
  lodestone: {
    sync: (force?: boolean): Promise<SyncResult> => ipcRenderer.invoke('lodestone:sync', force),
    syncLog: (): Promise<SyncLogEntry[]> => ipcRenderer.invoke('lodestone:syncLog'),
    isSyncNeeded: (): Promise<boolean> => ipcRenderer.invoke('lodestone:isSyncNeeded')
  },
  suggestions: (weights?: SuggestionWeights): Promise<Suggestion[]> =>
    ipcRenderer.invoke('suggestions:get', weights),
  collections: {
    status: (): Promise<{
      seeded: boolean
      counts: Record<CollectionType, number>
      generatedAt: string | null
      gameVersion: string | null
    }> => ipcRenderer.invoke('collections:status'),
    pending: (): Promise<Record<CollectionType, number>> =>
      ipcRenderer.invoke('collections:pending'),
    allProgress: (): Promise<{ type: CollectionType; owned: number; total: number }[]> =>
      ipcRenderer.invoke('collections:allProgress'),
    patches: (type: CollectionType): Promise<string[]> =>
      ipcRenderer.invoke('collections:patches', type),
    refresh: (): Promise<{ seeded: boolean; counts: Record<CollectionType, number> }> =>
      ipcRenderer.invoke('collections:refresh'),
    list: (filter: CollectionFilter): Promise<CollectionItemRow[]> =>
      ipcRenderer.invoke('collections:list', filter),
    categories: (type: CollectionType): Promise<CollectionCategory[]> =>
      ipcRenderer.invoke('collections:categories', type),
    progress: (type: CollectionType): Promise<CollectionProgress> =>
      ipcRenderer.invoke('collections:progress', type),
    setOwned: (type: CollectionType, id: number, owned: boolean): Promise<boolean> =>
      ipcRenderer.invoke('collections:setOwned', { type, id, owned }),
    sync: (type: CollectionType): Promise<CollectionSyncResult> =>
      ipcRenderer.invoke('collections:sync', type)
  },
  recurring: {
    list: (): Promise<RecurringTask[]> => ipcRenderer.invoke('recurring:list'),
    add: (input: {
      name: string
      type: RecurringType
      achievementId?: number | null
      iconPath?: string | null
    }): Promise<RecurringTask> => ipcRenderer.invoke('recurring:add', input),
    delete: (id: string): Promise<boolean> => ipcRenderer.invoke('recurring:delete', id),
    setDone: (id: string, done: boolean): Promise<boolean> =>
      ipcRenderer.invoke('recurring:setDone', { id, done }),
    pending: (): Promise<{ daily: number; weekly: number; daily22: number }> =>
      ipcRenderer.invoke('recurring:pending')
  },
  icons: {
    getUrl: (iconPath: string | null): Promise<string | null> => ipcRenderer.invoke('icons:getUrl', iconPath),
    prefetch: (iconPaths: (string | null)[]): Promise<void> => ipcRenderer.invoke('icons:prefetch', iconPaths)
  },
  difficulty: {
    get: (achievementId: number): Promise<AchievementDifficulty | undefined> =>
      ipcRenderer.invoke('difficulty:get', achievementId),
    all: (): Promise<{ id: number; score: number; level: DifficultyLevel; levelName: string; color: string; stars: string }[]> =>
      ipcRenderer.invoke('difficulty:all'),
    stats: (): Promise<{
      total: number
      byLevel: Record<DifficultyLevel, number>
      averageScore: number
      hardest: { id: number; name: string; score: number } | null
      easiest: { id: number; name: string; score: number } | null
    }> => ipcRenderer.invoke('difficulty:stats'),
    filter: (level: DifficultyLevel | null): Promise<number[]> =>
      ipcRenderer.invoke('difficulty:filter', level),
    sort: (direction: 'asc' | 'desc'): Promise<number[]> =>
      ipcRenderer.invoke('difficulty:sort', direction),
    weights: (): Promise<{
      kind: Record<number, number>
      category: Record<number, number>
      patch: Record<string, number>
    }> => ipcRenderer.invoke('difficulty:weights'),
    recalculate: (): Promise<{ success: boolean; count: number }> =>
      ipcRenderer.invoke('difficulty:recalculate')
  },
  /**
   * Écoute les demandes de navigation envoyées par le main process
   * (ex: clic sur une notification). Retourne une fonction de désabonnement.
   */
  onNavigate: (callback: (view: string) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, view: string): void => callback(view)
    ipcRenderer.on('navigate-to', listener)
    return () => ipcRenderer.removeListener('navigate-to', listener)
  }
}

export type Api = typeof api

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (fallback quand l'isolation de contexte est désactivée)
  window.api = api
}
