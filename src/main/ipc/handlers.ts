import { ipcMain, app, type IpcMainInvokeEvent } from 'electron'
import { join } from 'path'
import { pathToFileURL } from 'url'
import { isTrustedSender } from './trust'
import { checkForUpdates, downloadUpdate, getUpdaterStatus, quitAndInstall } from '../services/updater'
import * as repo from '../data/repo'
import { refreshCatalogFromXivapi } from '../services/catalog'
import { syncLodestone } from '../services/lodestone'
import { syncCollection, refreshCollectionsFromApi } from '../services/collectionsSync'
import { exportUserData, importUserData, getAutoBackupInfo, openDocumentsBackupFolder } from '../services/backup'
import { getSuggestions } from '../services/suggestions'
import { getIconUrl, prefetchIcons } from '../utils/icons'
import { updateSearchIndex } from '../services/search'
import { store } from '../data/store'
import { 
  calculateAllDifficulties, 
  getDifficultyStats, 
  filterByDifficulty,
  sortByDifficulty,
  updateDifficultyWeights,
  DEFAULT_KIND_WEIGHTS,
  DEFAULT_CATEGORY_WEIGHTS,
  DEFAULT_PATCH_WEIGHTS
} from '../services/difficulty'
import type {
  AchievementFilter,
  CollectionFilter,
  CollectionType,
  Priority,
  RecurringType,
  Settings,
  SuggestionWeights,
  DifficultyLevel,
  DifficultyWeights,
  AchievementDifficulty
} from '@shared/types'

const APP_PAGE_URL = pathToFileURL(join(__dirname, '../renderer/index.html')).href

/** Registers a channel, rejecting any call that does not come from the app page. */
function handle(channel: string, listener: (event: IpcMainInvokeEvent, ...args: any[]) => unknown): void {
  ipcMain.handle(channel, (event, ...args) => {
    const devUrl = app.isPackaged ? null : process.env['ELECTRON_RENDERER_URL']
    if (!isTrustedSender(event.senderFrame?.url, APP_PAGE_URL, devUrl)) {
      throw new Error(`IPC rejected (untrusted sender): ${channel}`)
    }
    return listener(event, ...args)
  })
}

/** Registers every IPC channel (called once at startup). */
export function registerIpcHandlers(): void {
  // Catalog
  handle('catalog:status', () => repo.getCatalogStatus())
  handle('catalog:refresh', async () => {
    const status = await refreshCatalogFromXivapi(repo.getSettings().language)
    // The catalog changed: rebuild the search index and recompute the
    // difficulties so they are not stale until the next startup.
    updateSearchIndex()
    store.setDifficulties(calculateAllDifficulties())
    return status
  })

  // Achievements (read)
  handle('achievements:list', (_e, filter: AchievementFilter) => repo.listAchievements(filter))
  handle('achievements:focusList', () => repo.getFocusList())
  handle('achievements:latestPatch', () => repo.getLatestPatchSummary())
  handle('achievements:get', (_e, id: number) => repo.getAchievementRow(id))

  // Achievements (write)
  handle('achievements:setCompletion', (_e, p: { id: number; completed: boolean }) => {
    repo.setManualCompletion(p.id, p.completed)
    return true
  })
  handle('achievements:setPriority', (_e, p: { id: number; priority: Priority }) => {
    repo.setPriority(p.id, p.priority)
    return true
  })
  handle('achievements:setFocus', (_e, p: { id: number; inFocus: boolean }) => {
    repo.setFocus(p.id, p.inFocus)
    return true
  })
  handle('achievements:reorderFocus', (_e, ids: number[]) => {
    repo.reorderFocus(ids)
    return true
  })
  handle('achievements:setNote', (_e, p: { id: number; note: string | null }) => {
    repo.setNote(p.id, p.note)
    return true
  })
  handle('achievements:setDeadline', (_e, p: { id: number; deadline: string | null }) => {
    repo.setDeadline(p.id, p.deadline)
    return true
  })
  handle('achievements:setTags', (_e, p: { id: number; tags: string[] }) => {
    repo.setAchievementTags(p.id, p.tags)
    return true
  })

  // Metadata (filters)
  handle('meta:kinds', () => repo.getKinds())
  handle('meta:categories', () => repo.getCategories())
  handle('meta:tags', () => repo.getAllTags())
  handle('meta:patches', () => repo.getAchievementPatches())
  handle('meta:seasonalEvents', () => repo.getSeasonalEvents())

  // Difficulty
  handle('difficulty:get', (_e, achievementId: number) => {
    return store.getDifficulty(achievementId)
  })
  handle('difficulty:all', () => {
    return Array.from(store.difficulties.entries()).map(([id, diff]) => ({ id, ...diff }))
  })
  handle('difficulty:stats', () => {
    return getDifficultyStats(store.difficulties)
  })
  handle('difficulty:filter', (_e, level: DifficultyLevel | null) => {
    return filterByDifficulty(store.difficulties, level)
  })
  handle('difficulty:sort', (_e, direction: 'asc' | 'desc' = 'asc') => {
    return sortByDifficulty(store.difficulties, direction)
  })
  handle('difficulty:weights', () => ({
    kind: DEFAULT_KIND_WEIGHTS,
    category: DEFAULT_CATEGORY_WEIGHTS,
    patch: DEFAULT_PATCH_WEIGHTS
  }))
  handle('difficulty:recalculate', () => {
    const newDifficulties = calculateAllDifficulties()
    store.setDifficulties(newDifficulties)
    return { success: true, count: newDifficulties.size }
  })

  // Dashboard
  handle('dashboard:get', () => repo.getDashboard())

  // Backup / restore
  handle('data:export', () => exportUserData())
  handle('data:import', () => importUserData())
  handle('data:autoBackupInfo', () => getAutoBackupInfo())
  handle('data:openDocumentsFolder', () => openDocumentsBackupFolder())

  // Settings
  handle('settings:get', () => repo.getSettings())
  handle('settings:update', (_e, partial: Partial<Settings>) => repo.updateSettings(partial))

  // Lodestone (on-demand sync)
  handle('lodestone:sync', () => syncLodestone())
  handle('lodestone:syncLog', () => repo.getSyncLog())

  // Undo/Redo
  handle('history:undo', () => repo.undo())
  handle('history:redo', () => repo.redo())
  handle('history:canUndo', () => repo.canUndo())
  handle('history:canRedo', () => repo.canRedo())

  // Suggestions
  handle('suggestions:get', (_e, weights?: SuggestionWeights) => getSuggestions(weights))

  // Icons (local cache)
  handle('icons:getUrl', (_e, iconPath: string | null) => getIconUrl(iconPath))
  handle('icons:prefetch', (_e, iconPaths: (string | null)[]) => prefetchIcons(iconPaths))

  // Collections (mounts / minions / orchestrion)
  handle('collections:status', () => repo.getCollectionStatus())
  handle('collections:pending', () => repo.getCollectionPendingByType())
  handle('collections:allProgress', () => repo.getAllCollectionsProgress())
  handle('collections:patches', (_e, type: CollectionType) => repo.getCollectionPatches(type))
  handle('collections:refresh', () => refreshCollectionsFromApi())
  handle('collections:list', (_e, filter: CollectionFilter) => repo.listCollection(filter))
  handle('collections:categories', (_e, type: CollectionType) =>
    repo.getCollectionCategories(type)
  )
  handle('collections:progress', (_e, type: CollectionType) =>
    repo.getCollectionProgress(type)
  )
  handle('collections:setOwned', (_e, p: { type: CollectionType; id: number; owned: boolean }) => {
    repo.setCollectionOwned(p.type, p.id, p.owned)
    return true
  })
  handle('collections:sync', (_e, type: CollectionType) => syncCollection(type))

  // Recurring tasks (daily / weekly)
  handle('recurring:list', () => repo.getRecurringTasks())
  handle(
    'recurring:add',
    (_e, input: { name: string; type: RecurringType; achievementId?: number | null; iconPath?: string | null }) =>
      repo.addRecurringTask(input)
  )
  handle('recurring:delete', (_e, id: string) => {
    repo.deleteRecurringTask(id)
    return true
  })
  handle('recurring:setDone', (_e, p: { id: string; done: boolean }) => {
    repo.setRecurringDone(p.id, p.done)
    return true
  })
  handle('recurring:pending', () => repo.countPendingRecurring())

  // Application updates
  handle('updater:check', () => checkForUpdates())
  handle('updater:download', () => downloadUpdate())
  handle('updater:install', () => quitAndInstall())
  handle('updater:status', () => getUpdaterStatus())
  handle('updater:appVersion', () => app.getVersion())
}
