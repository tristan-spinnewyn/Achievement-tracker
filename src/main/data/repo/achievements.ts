import type {
  Achievement,
  AchievementFilter,
  AchievementRow,
  CategoryProgress,
  DashboardData,
  KindProgress
} from '@shared/types'
import { patchSortKey } from '@shared/names'
import { store } from '../store'
import { evaluateAdvancedQuery } from '../../utils/search'

// ---------------------------------------------------------------- Read / query

function buildRow(a: Achievement): AchievementRow {
  const p = store.user.progress[a.id]
  const m = store.user.userMeta[a.id]
  const cat = store.categoryById.get(a.categoryId)
  const kind = store.kindById.get(a.kindId)
  return {
    ...a,
    categoryName: cat?.name ?? '',
    kindName: kind?.name ?? '',
    completed: p?.completed ?? false,
    completedDate: p?.completedDate ?? null,
    source: p?.source ?? null,
    priority: m?.priority ?? 0,
    inFocus: m?.inFocus ?? false,
    focusOrder: m?.focusOrder ?? null,
    note: m?.note ?? null,
    deadline: m?.deadline ?? null,
    tags: store.user.tagsByAchievement[a.id] ?? []
  }
}

function matches(row: AchievementRow, f: AchievementFilter): boolean {
  if (f.search) {
    // Advanced search engine (static import: no dynamic require,
    // otherwise the main process bundle can no longer resolve the module at runtime).
    const searchFn = evaluateAdvancedQuery(f.search)
    if (!searchFn(row)) return false
  }
  if (f.kindId != null && row.kindId !== f.kindId) return false
  if (f.categoryId != null && row.categoryId !== f.categoryId) return false
  if (f.status === 'completed' && !row.completed) return false
  if (f.status === 'todo' && row.completed) return false
  if (f.status === 'focus' && !row.inFocus) return false
  if (f.priority != null && row.priority !== f.priority) return false
  if (f.minPoints != null && row.points < f.minPoints) return false
  if (f.maxPoints != null && row.points > f.maxPoints) return false
  if (f.obtainableOnly && !row.obtainable) return false
  if (f.hasNote && !row.note) return false
  if (f.patch != null && row.patch !== f.patch) return false
  if (f.tags && f.tags.length > 0) {
    for (const t of f.tags) if (!row.tags.includes(t)) return false
  }
  // Seasonal filters
  if (f.seasonalOnly && !row.isSeasonal) return false
  if (f.seasonalEvent != null && row.seasonalEvent !== f.seasonalEvent) return false

  // Difficulty filter
  if (f.difficultyLevel != null) {
    const difficulty = store.difficulties.get(row.id)
    if (!difficulty || difficulty.level !== f.difficultyLevel) return false
  }

  return true
}

function compare(a: AchievementRow, b: AchievementRow, f: AchievementFilter): number {
  const dir = f.sortDir === 'desc' ? -1 : 1
  switch (f.sortBy) {
    case 'points':
      return (a.points - b.points) * dir
    case 'category': {
      const c = a.categoryName.localeCompare(b.categoryName, 'fr')
      return (c !== 0 ? c : a.name.localeCompare(b.name, 'fr')) * dir
    }
    case 'completedDate':
      return (a.completedDate ?? '').localeCompare(b.completedDate ?? '') * dir
    case 'priority':
      return (a.priority - b.priority) * dir
    case 'focusOrder': {
      const av = a.focusOrder ?? Number.MAX_SAFE_INTEGER
      const bv = b.focusOrder ?? Number.MAX_SAFE_INTEGER
      return (av - bv) * dir
    }
    case 'patch': {
      const d = (patchSortKey(a.patch) - patchSortKey(b.patch)) * dir
      return d !== 0 ? d : a.name.localeCompare(b.name, 'fr')
    }
    case 'difficulty': {
      const difficultyA = store.difficulties.get(a.id)
      const difficultyB = store.difficulties.get(b.id)
      const scoreA = difficultyA?.score ?? 0
      const scoreB = difficultyB?.score ?? 0
      return (scoreA - scoreB) * dir
    }
    case 'name':
    default:
      return a.name.localeCompare(b.name, 'fr') * dir
  }
}

export function listAchievements(filter: AchievementFilter = {}): AchievementRow[] {
  const rows: AchievementRow[] = []
  for (const a of store.catalog.achievements) {
    const row = buildRow(a)
    if (matches(row, filter)) rows.push(row)
  }
  rows.sort((a, b) => compare(a, b, filter))
  if (filter.offset != null || filter.limit != null) {
    const start = filter.offset ?? 0
    const end = filter.limit != null ? start + filter.limit : undefined
    return rows.slice(start, end)
  }
  return rows
}

export function getFocusList(): AchievementRow[] {
  return store.catalog.achievements
    .map(buildRow)
    .filter((r) => r.inFocus)
    .sort((a, b) => (a.focusOrder ?? 0) - (b.focusOrder ?? 0))
}

export function getAchievementRow(id: number): AchievementRow | null {
  const a = store.achievementById.get(id)
  return a ? buildRow(a) : null
}

export function countCompleted(): number {
  let n = 0
  for (const id in store.user.progress) {
    if (store.user.progress[id].completed) n++
  }
  return n
}

export function getDashboard(): DashboardData {
  const kinds = new Map<number, KindProgress>()
  const cats = new Map<number, CategoryProgress>()
  let totalPoints = 0
  let earnedPoints = 0
  let completed = 0
  const recent: { id: number; name: string; completedDate: string | null; points: number }[] = []

  for (const a of store.catalog.achievements) {
    const p = store.user.progress[a.id]
    const done = p?.completed ?? false
    totalPoints += a.points
    if (done) {
      completed++
      earnedPoints += a.points
    }

    const kind = store.kindById.get(a.kindId)
    if (kind && kind.name.trim()) {
      let k = kinds.get(a.kindId)
      if (!k) {
        k = { kindId: a.kindId, kindName: kind.name, total: 0, completed: 0, points: 0, earnedPoints: 0 }
        kinds.set(a.kindId, k)
      }
      k.total++
      k.points += a.points
      if (done) {
        k.completed++
        k.earnedPoints += a.points
      }
    }

    const cat = store.categoryById.get(a.categoryId)
    if (cat && cat.name.trim()) {
      let c = cats.get(a.categoryId)
      if (!c) {
        c = {
          categoryId: a.categoryId,
          categoryName: cat.name,
          kindId: cat.kindId,
          kindName: store.kindById.get(cat.kindId)?.name ?? '',
          total: 0,
          completed: 0,
          points: 0,
          earnedPoints: 0
        }
        cats.set(a.categoryId, c)
      }
      c.total++
      c.points += a.points
      if (done) {
        c.completed++
        c.earnedPoints += a.points
      }
    }

    if (done && p?.completedDate) {
      recent.push({ id: a.id, name: a.name, completedDate: p.completedDate, points: a.points })
    }
  }

  recent.sort((x, y) => (y.completedDate ?? '').localeCompare(x.completedDate ?? ''))

  return {
    totalAchievements: store.catalog.achievements.length,
    completedAchievements: completed,
    totalPoints,
    earnedPoints,
    focusCount: getFocusList().length,
    byKind: [...kinds.values()].sort(
      (a, b) => (store.kindById.get(a.kindId)?.order ?? 0) - (store.kindById.get(b.kindId)?.order ?? 0)
    ),
    byCategory: [...cats.values()].sort(
      (a, b) =>
        (store.categoryById.get(a.categoryId)?.order ?? 0) -
        (store.categoryById.get(b.categoryId)?.order ?? 0)
    ),
    recentCompletions: recent.slice(0, 12)
  }
}
