import { ipcMain } from 'electron'
import * as repo from '../data/repo'
import { refreshCatalogFromXivapi } from '../services/catalog'
import { syncLodestone } from '../services/lodestone'
import { syncCollection, refreshCollectionsFromApi } from '../services/collections'
import { exportUserData, importUserData, getAutoBackupInfo, openDocumentsBackupFolder } from '../services/backup'
import { getSuggestions } from '../services/suggestions'
import { getIconUrl, prefetchIcons } from '../utils/icons'
import { updateSearchIndex } from '../utils/search'
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
} from '../utils/difficulty'
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

/** Enregistre tous les canaux IPC (un seul appel au démarrage). */
export function registerIpcHandlers(): void {
  // Catalogue
  ipcMain.handle('catalog:status', () => repo.getCatalogStatus())
  ipcMain.handle('catalog:refresh', async () => {
    const status = await refreshCatalogFromXivapi(repo.getSettings().language)
    // Le catalogue a changé : on reconstruit l'index de recherche et on recalcule
    // les difficultés pour qu'ils ne soient pas périmés jusqu'au prochain démarrage.
    updateSearchIndex()
    store.setDifficulties(calculateAllDifficulties())
    return status
  })

  // Hauts faits (lecture)
  ipcMain.handle('achievements:list', (_e, filter: AchievementFilter) => repo.listAchievements(filter))
  ipcMain.handle('achievements:focusList', () => repo.getFocusList())
  ipcMain.handle('achievements:latestPatch', () => repo.getLatestPatchSummary())
  ipcMain.handle('achievements:get', (_e, id: number) => repo.getAchievementRow(id))

  // Hauts faits (écriture)
  ipcMain.handle('achievements:setCompletion', (_e, p: { id: number; completed: boolean }) => {
    repo.setManualCompletion(p.id, p.completed)
    return true
  })
  ipcMain.handle('achievements:setPriority', (_e, p: { id: number; priority: Priority }) => {
    repo.setPriority(p.id, p.priority)
    return true
  })
  ipcMain.handle('achievements:setFocus', (_e, p: { id: number; inFocus: boolean }) => {
    repo.setFocus(p.id, p.inFocus)
    return true
  })
  ipcMain.handle('achievements:reorderFocus', (_e, ids: number[]) => {
    repo.reorderFocus(ids)
    return true
  })
  ipcMain.handle('achievements:setNote', (_e, p: { id: number; note: string | null }) => {
    repo.setNote(p.id, p.note)
    return true
  })
  ipcMain.handle('achievements:setDeadline', (_e, p: { id: number; deadline: string | null }) => {
    repo.setDeadline(p.id, p.deadline)
    return true
  })
  ipcMain.handle('achievements:setTags', (_e, p: { id: number; tags: string[] }) => {
    repo.setAchievementTags(p.id, p.tags)
    return true
  })

  // Métadonnées (filtres)
  ipcMain.handle('meta:kinds', () => repo.getKinds())
  ipcMain.handle('meta:categories', () => repo.getCategories())
  ipcMain.handle('meta:tags', () => repo.getAllTags())
  ipcMain.handle('meta:patches', () => repo.getAchievementPatches())
  ipcMain.handle('meta:seasonalEvents', () => repo.getSeasonalEvents())

  // Difficultés
  ipcMain.handle('difficulty:get', (_e, achievementId: number) => {
    return store.getDifficulty(achievementId)
  })
  ipcMain.handle('difficulty:all', () => {
    return Array.from(store.difficulties.entries()).map(([id, diff]) => ({ id, ...diff }))
  })
  ipcMain.handle('difficulty:stats', () => {
    return getDifficultyStats(store.difficulties)
  })
  ipcMain.handle('difficulty:filter', (_e, level: DifficultyLevel | null) => {
    return filterByDifficulty(store.difficulties, level)
  })
  ipcMain.handle('difficulty:sort', (_e, direction: 'asc' | 'desc' = 'asc') => {
    return sortByDifficulty(store.difficulties, direction)
  })
  ipcMain.handle('difficulty:weights', () => ({
    kind: DEFAULT_KIND_WEIGHTS,
    category: DEFAULT_CATEGORY_WEIGHTS,
    patch: DEFAULT_PATCH_WEIGHTS
  }))
  ipcMain.handle('difficulty:recalculate', () => {
    const newDifficulties = calculateAllDifficulties()
    store.setDifficulties(newDifficulties)
    return { success: true, count: newDifficulties.size }
  })

  // Tableau de bord
  ipcMain.handle('dashboard:get', () => repo.getDashboard())

  // Sauvegarde / restauration
  ipcMain.handle('data:export', () => exportUserData())
  ipcMain.handle('data:import', () => importUserData())
  ipcMain.handle('data:autoBackupInfo', () => getAutoBackupInfo())
  ipcMain.handle('data:openDocumentsFolder', () => openDocumentsBackupFolder())

  // Paramètres
  ipcMain.handle('settings:get', () => repo.getSettings())
  ipcMain.handle('settings:update', (_e, partial: Partial<Settings>) => repo.updateSettings(partial))

  // Lodestone (synchro à la demande)
  ipcMain.handle('lodestone:sync', () => syncLodestone())
  ipcMain.handle('lodestone:syncLog', () => repo.getSyncLog())

  // Undo/Redo
  ipcMain.handle('history:undo', () => repo.undo())
  ipcMain.handle('history:redo', () => repo.redo())
  ipcMain.handle('history:canUndo', () => repo.canUndo())
  ipcMain.handle('history:canRedo', () => repo.canRedo())

  // Suggestions
  ipcMain.handle('suggestions:get', (_e, weights?: SuggestionWeights) => getSuggestions(weights))

  // Icônes (cache local)
  ipcMain.handle('icons:getUrl', (_e, iconPath: string | null) => getIconUrl(iconPath))
  ipcMain.handle('icons:prefetch', (_e, iconPaths: (string | null)[]) => prefetchIcons(iconPaths))

  // Collections (montures / mascottes / orchestrion)
  ipcMain.handle('collections:status', () => repo.getCollectionStatus())
  ipcMain.handle('collections:pending', () => repo.getCollectionPendingByType())
  ipcMain.handle('collections:allProgress', () => repo.getAllCollectionsProgress())
  ipcMain.handle('collections:patches', (_e, type: CollectionType) => repo.getCollectionPatches(type))
  ipcMain.handle('collections:refresh', () => refreshCollectionsFromApi())
  ipcMain.handle('collections:list', (_e, filter: CollectionFilter) => repo.listCollection(filter))
  ipcMain.handle('collections:categories', (_e, type: CollectionType) =>
    repo.getCollectionCategories(type)
  )
  ipcMain.handle('collections:progress', (_e, type: CollectionType) =>
    repo.getCollectionProgress(type)
  )
  ipcMain.handle('collections:setOwned', (_e, p: { type: CollectionType; id: number; owned: boolean }) => {
    repo.setCollectionOwned(p.type, p.id, p.owned)
    return true
  })
  ipcMain.handle('collections:sync', (_e, type: CollectionType) => syncCollection(type))

  // Tâches récurrentes (quotidiennes / hebdomadaires)
  ipcMain.handle('recurring:list', () => repo.getRecurringTasks())
  ipcMain.handle(
    'recurring:add',
    (_e, input: { name: string; type: RecurringType; achievementId?: number | null; iconPath?: string | null }) =>
      repo.addRecurringTask(input)
  )
  ipcMain.handle('recurring:delete', (_e, id: string) => {
    repo.deleteRecurringTask(id)
    return true
  })
  ipcMain.handle('recurring:setDone', (_e, p: { id: string; done: boolean }) => {
    repo.setRecurringDone(p.id, p.done)
    return true
  })
  ipcMain.handle('recurring:pending', () => repo.countPendingRecurring())
}
