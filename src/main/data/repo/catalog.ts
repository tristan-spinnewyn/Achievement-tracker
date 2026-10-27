import type { AchievementCategory, AchievementKind, CatalogStatus } from '@shared/types'
import { patchSortKey } from '@shared/names'
import { store } from '../store'

// ---------------------------------------------------------------- Catalog meta

export function getCatalogStatus(): CatalogStatus {
  return {
    seeded: store.catalog.achievements.length > 0,
    achievementCount: store.catalog.achievements.length,
    gameVersion: store.catalog.gameVersion,
    generatedAt: store.catalog.generatedAt
  }
}

export function getKinds(): AchievementKind[] {
  return store.catalog.kinds.filter((k) => k.name.trim().length > 0)
}

export function getCategories(): AchievementCategory[] {
  return store.catalog.categories.filter((c) => c.name.trim().length > 0)
}

/** Patches present in the catalog, from most recent to oldest. */
export function getAchievementPatches(): string[] {
  const set = new Set<string>()
  for (const a of store.catalog.achievements) if (a.patch) set.add(a.patch)
  return [...set].sort((a, b) => patchSortKey(b) - patchSortKey(a))
}

/** Seasonal events present in the catalog. */
export function getSeasonalEvents(): string[] {
  const set = new Set<string>()
  for (const a of store.catalog.achievements) if (a.seasonalEvent) set.add(a.seasonalEvent)
  return [...set].sort((a, b) => a.localeCompare(b, 'fr'))
}

/** Summary of the most recent patch (for the "New" badge). */
export function getLatestPatchSummary(): { patch: string | null; pending: number; total: number } {
  const latest = getAchievementPatches()[0] ?? null
  if (!latest) return { patch: null, pending: 0, total: 0 }
  let total = 0
  let pending = 0
  for (const a of store.catalog.achievements) {
    if (a.patch !== latest) continue
    total++
    if (!store.user.progress[a.id]?.completed) pending++
  }
  return { patch: latest, pending, total }
}

export function getAllTags(): string[] {
  const set = new Set<string>()
  for (const tags of Object.values(store.user.tagsByAchievement)) {
    for (const t of tags) set.add(t)
  }
  return [...set].sort((a, b) => a.localeCompare(b, 'fr'))
}
