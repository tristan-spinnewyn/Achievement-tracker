import { describe, it, expect, beforeEach } from 'vitest'
import type { Achievement, CollectionItem } from '@shared/types'
import { store } from '../src/main/data/store'
import * as repo from '../src/main/data/repo'

const ach = (id: number, partial: Partial<Achievement> = {}): Achievement => ({
  id,
  name: `HF ${id}`,
  description: '',
  points: 10,
  categoryId: 1,
  kindId: 1,
  iconPath: null,
  obtainable: true,
  patch: '7.0',
  ...partial
})

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

beforeEach(() => {
  store.init()
  store.replaceUser({ settings: { ...store.user.settings, autoBackupDocuments: false } })
  store.catalog = {
    generatedAt: null,
    gameVersion: null,
    kinds: [
      { id: 1, name: 'Combat', order: 2 },
      { id: 2, name: 'Quêtes', order: 1 }
    ],
    categories: [
      { id: 1, kindId: 1, name: 'Donjons', order: 1 },
      { id: 2, kindId: 2, name: 'Scénario', order: 2 }
    ],
    achievements: [
      ach(1, { name: 'Alpha', points: 5, patch: '7.1' }),
      ach(2, { name: 'Bravo', points: 20, categoryId: 2, kindId: 2, patch: '6.5', isSeasonal: true, seasonalEvent: 'Halloween' }),
      ach(3, { name: 'Charlie', points: 10, obtainable: false, patch: '7.1' })
    ]
  }
  store.collections = {
    generatedAt: null,
    gameVersion: null,
    categories: [{ type: 'mount', id: 1, name: 'Raid', order: 1 }],
    items: [item(1, { patch: '7.1', categoryId: 1 }), item(2, { patch: '7.1' }), item(3, { patch: '6.0' }), item(1, { type: 'minion' })]
  }
  store.reindex()
})

describe('metadata and filters', () => {
  it('exposes patches, seasonal events and the latest patch', () => {
    expect(repo.getAchievementPatches()).toEqual(['7.1', '6.5'])
    expect(repo.getSeasonalEvents()).toEqual(['Halloween'])
    expect(repo.getLatestPatchSummary()).toEqual({ patch: '7.1', pending: 2, total: 2 })
    expect(repo.getCatalogStatus().achievementCount).toBe(3)
    expect(repo.getKinds().map((k) => k.id)).toEqual([1, 2])
    expect(repo.getCategories()).toHaveLength(2)
  })

  it('filters and sorts achievements', () => {
    expect(repo.listAchievements({ obtainableOnly: true }).map((r) => r.id)).toEqual([1, 2])
    expect(repo.listAchievements({ kindId: 2 }).map((r) => r.id)).toEqual([2])
    expect(repo.listAchievements({ minPoints: 10, maxPoints: 15 }).map((r) => r.id)).toEqual([3])
    expect(repo.listAchievements({ seasonalOnly: true, seasonalEvent: 'Halloween' }).map((r) => r.id)).toEqual([2])
    expect(repo.listAchievements({ sortBy: 'points', sortDir: 'desc' }).map((r) => r.id)).toEqual([2, 3, 1])
    expect(repo.listAchievements({ sortBy: 'patch' }).map((r) => r.id)).toEqual([2, 1, 3])
    expect(repo.listAchievements({ sortBy: 'category' }).map((r) => r.id)).toEqual([1, 3, 2])
    expect(repo.listAchievements({ offset: 1, limit: 1 }).map((r) => r.id)).toEqual([2])
    expect(repo.listAchievements({ search: 'bravo' }).map((r) => r.id)).toEqual([2])
    expect(repo.getAchievementRow(999)).toBeNull()
  })
})

describe('mutations and history', () => {
  it('checks / unchecks with undo and redo', () => {
    repo.setManualCompletion(1, true)
    expect(repo.getAchievementRow(1)!.completed).toBe(true)
    expect(repo.listAchievements({ status: 'completed' }).map((r) => r.id)).toEqual([1])
    expect(repo.canUndo()).toBe(true)

    expect(repo.undo()).toBe(true)
    expect(repo.getAchievementRow(1)!.completed).toBe(false)
    expect(repo.canRedo()).toBe(true)
    expect(repo.redo()).toBe(true)
    expect(repo.getAchievementRow(1)!.completed).toBe(true)

    repo.setManualCompletion(1, false)
    expect(repo.listAchievements({ status: 'todo' }).map((r) => r.id)).toEqual([1, 2, 3])
  })

  it('does not allow unchecking an achievement obtained via the Lodestone', () => {
    expect(repo.applyLodestoneCompletions([{ id: 2, date: '2026-01-01' }, { id: 3, date: null }])).toEqual({ newly: 2, total: 2 })
    repo.setManualCompletion(2, false)
    expect(repo.getAchievementRow(2)!.completed).toBe(true)
    expect(repo.applyLodestoneCompletions([{ id: 2, date: null }]).newly).toBe(0)
  })

  it('handles priority, focus, note, deadline and tags', () => {
    repo.setPriority(1, 3)
    repo.setFocus(1, true)
    repo.setFocus(2, true)
    repo.reorderFocus([2, 1])
    repo.setNote(1, '  ')
    repo.setNote(2, 'à faire')
    repo.setDeadline(2, '2026-12-31')
    repo.setAchievementTags(2, [' raid ', 'raid', '', 'solo'])

    expect(repo.listAchievements({ priority: 3 }).map((r) => r.id)).toEqual([1])
    expect(repo.getFocusList().map((r) => r.id)).toEqual([2, 1])
    expect(repo.listAchievements({ status: 'focus', sortBy: 'focusOrder' }).map((r) => r.id)).toEqual([2, 1])
    expect(repo.listAchievements({ hasNote: true }).map((r) => r.id)).toEqual([2])
    expect(repo.getAchievementRow(2)!.deadline).toBe('2026-12-31')
    expect(repo.listAchievements({ tags: ['raid', 'solo'] }).map((r) => r.id)).toEqual([2])
    expect(repo.getAllTags()).toEqual(['raid', 'solo'])

    // Every mutation can be undone
    expect(repo.undo()).toBe(true)
    expect(repo.getAchievementRow(2)!.tags).toEqual([])
    expect(repo.undo()).toBe(true)
    expect(repo.getAchievementRow(2)!.deadline).toBeNull()
    expect(repo.undo()).toBe(true)
    expect(repo.getAchievementRow(2)!.note).toBeNull()
  })

  it('returns false when there is nothing to undo or redo', () => {
    expect(repo.undo()).toBe(false)
    expect(repo.redo()).toBe(false)
  })

  it('updates settings and logs syncs', () => {
    expect(repo.updateSettings({ region: 'na' }).region).toBe('na')
    repo.addSyncLog({ at: 'x', ok: true, newlyCompleted: 1, totalCompleted: 1, message: 'ok' })
    expect(repo.getSyncLog()[0].message).toBe('ok')
  })
})

describe('dashboard', () => {
  it('aggregates points and progress by kind and category', () => {
    repo.setManualCompletion(2, true)
    const d = repo.getDashboard()
    expect(d).toMatchObject({ totalAchievements: 3, completedAchievements: 1, totalPoints: 35, earnedPoints: 20 })
    expect(d.byKind.map((k) => k.kindId)).toEqual([2, 1])
    expect(d.byCategory.find((c) => c.categoryId === 2)).toMatchObject({ completed: 1, total: 1, kindName: 'Quêtes' })
    expect(d.recentCompletions[0].id).toBe(2)
  })
})

describe('recurring tasks', () => {
  it('adds, checks, unchecks, deletes and counts pending tasks', () => {
    const daily = repo.addRecurringTask({ name: '  Roulette  ', type: 'daily' })
    const weekly = repo.addRecurringTask({ name: 'Raid', type: 'weekly' })
    repo.addRecurringTask({ name: 'Ravitaillement', type: 'daily22' })
    expect(daily.name).toBe('Roulette')
    expect(repo.countPendingRecurring()).toEqual({ daily: 1, weekly: 1, daily22: 1 })

    repo.setRecurringDone(daily.id, true)
    repo.setRecurringDone(daily.id, true) // idempotent
    expect(repo.getRecurringTasks().find((t) => t.id === daily.id)!.streak).toBe(1)
    expect(repo.countPendingRecurring().daily).toBe(0)

    repo.setRecurringDone(daily.id, false)
    repo.setRecurringDone(daily.id, false)
    expect(repo.countPendingRecurring().daily).toBe(1)

    repo.deleteRecurringTask(weekly.id)
    repo.setRecurringDone('inconnu', true)
    expect(repo.getRecurringTasks()).toHaveLength(2)
  })

  it('automatically removes a task linked to an obtained achievement', () => {
    repo.addRecurringTask({ name: 'Lié', type: 'daily', achievementId: 1 })
    repo.setManualCompletion(1, true)
    expect(repo.getRecurringTasks()).toHaveLength(0)
  })
})

describe('collections', () => {
  it('lists, filters and computes progress', () => {
    repo.setCollectionOwned('mount', 1, true)
    expect(repo.getCollectionStatus().counts.mount).toBe(3)
    expect(repo.getCollectionPendingByType().mount).toBe(1)
    expect(repo.getCollectionPatches('mount')).toEqual(['7.1', '6.0'])
    expect(repo.getCollectionCategories('mount').map((c) => c.name)).toEqual(['Raid'])
    expect(repo.getCollectionProgress('mount')).toEqual({ type: 'mount', total: 3, owned: 1 })
    expect(repo.getAllCollectionsProgress().find((p) => p.type === 'minion')).toEqual({ type: 'minion', owned: 0, total: 1 })

    expect(repo.listCollection({ type: 'mount' }).map((r) => r.id)).toEqual([1, 2, 3])
    expect(repo.listCollection({ type: 'mount', status: 'owned' })[0]).toMatchObject({ id: 1, categoryName: 'Raid' })
    expect(repo.listCollection({ type: 'mount', status: 'missing', patch: '7.1' }).map((r) => r.id)).toEqual([2])
    expect(repo.listCollection({ type: 'mount', search: 'MONTURE 3' }).map((r) => r.id)).toEqual([3])
    expect(repo.listCollection({ type: 'mount', categoryId: 1 }).map((r) => r.id)).toEqual([1])

    repo.setCollectionOwned('mount', 1, false)
    expect(repo.getCollectionProgress('mount').owned).toBe(0)
  })

  it('matches Lodestone names through normalised aliases', () => {
    expect(repo.applyLodestoneCollection('mount', ['Monture  2', 'MONTURE 3', 'Inconnue'])).toEqual({
      matched: 2,
      unmatched: 1,
      newly: 2
    })
    expect(repo.applyLodestoneCollection('mount', ['monture 2']).newly).toBe(0)
  })
})

describe('utilities', () => {
  it('normalises names (accents, apostrophes, spaces)', () => {
    expect(repo.normalizeName('  Élan   d’Été ')).toBe("elan d'ete")
  })

  it('computes a consistent patch sort key', () => {
    expect(repo.patchSortKey(null)).toBe(-1)
    expect(repo.patchSortKey('7.5')).toBe(750)
    expect(repo.patchSortKey('7.51')).toBe(751)
    expect(repo.patchSortKey('2.0')).toBe(200)
    expect(repo.patchSortKey('6.5a')).toBeGreaterThan(repo.patchSortKey('6.5'))
  })
})
