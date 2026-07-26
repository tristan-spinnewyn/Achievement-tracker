import type {
  Achievement,
  AchievementCategory,
  AchievementFilter,
  AchievementKind,
  AchievementRow,
  CatalogStatus,
  CategoryProgress,
  CollectionCategory,
  CollectionFilter,
  CollectionItem,
  CollectionItemRow,
  CollectionProgress,
  CollectionType,
  DashboardData,
  KindProgress,
  Priority,
  RecurringTask,
  RecurringType,
  Settings,
  SyncLogEntry,
  UndoableAction
} from '@shared/types'
import { randomUUID } from 'crypto'
import { isDoneThisPeriod, periodStart, previousPeriodStart } from '@shared/resets'
import { store, collKey } from './store'
import { initSearchIndex, updateSearchIndex, evaluateAdvancedQuery } from '../utils/search'

const MAX_SYNC_LOG = 50

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

/** Liste des patchs présents dans le catalogue, du plus récent au plus ancien. */
export function getAchievementPatches(): string[] {
  const set = new Set<string>()
  for (const a of store.catalog.achievements) if (a.patch) set.add(a.patch)
  return [...set].sort((a, b) => patchSortKey(b) - patchSortKey(a))
}

/** Liste des événements saisonniers présents dans le catalogue. */
export function getSeasonalEvents(): string[] {
  const set = new Set<string>()
  for (const a of store.catalog.achievements) if (a.seasonalEvent) set.add(a.seasonalEvent)
  return [...set].sort((a, b) => a.localeCompare(b, 'fr'))
}

/** Résumé du patch le plus récent (pour le badge « Nouveautés »). */
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

// ---------------------------------------------------------------- Settings

export function getSettings(): Settings {
  return store.user.settings
}

export function updateSettings(partial: Partial<Settings>): Settings {
  store.user.settings = { ...store.user.settings, ...partial }
  store.saveUser()
  return store.user.settings
}

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
    // Moteur de recherche avancée (import statique : pas de require dynamique,
    // sinon le bundle du process principal ne résout plus le module à l'exécution).
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
  // Filtres saisonniers
  if (f.seasonalOnly && !row.isSeasonal) return false
  if (f.seasonalEvent != null && row.seasonalEvent !== f.seasonalEvent) return false
  
  // Filtre par difficulté
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

// ---------------------------------------------------------------- Mutations

function ensureMeta(id: number) {
  let m = store.user.userMeta[id]
  if (!m) {
    m = { achievementId: id, priority: 0, inFocus: false, focusOrder: null, note: null, deadline: null }
    store.user.userMeta[id] = m
  }
  return m
}

// ---------------------------------------------------------------- Undo/Redo history

const MAX_HISTORY = 50

/**
 * Enregistre une action dans l'historique undo.
 */
function pushUndoAction(action: UndoableAction): void {
  // Limiter la taille de l'historique
  if (store.user.undoStack.length >= MAX_HISTORY) {
    store.user.undoStack.shift()
  }
  store.user.undoStack.push(action)
  // Vider la pile redo lorsqu'une nouvelle action est effectuée
  store.user.redoStack = []
  store.saveUser()
}

/**
 * Annule la dernière action.
 */
export function undo(): boolean {
  const action = store.user.undoStack.pop()
  if (!action) return false

  // Appliquer l'action inverse
  restoreActionState(action.previousData, action.achievementId)
  
  // Ajouter à la pile redo
  if (store.user.redoStack.length >= MAX_HISTORY) {
    store.user.redoStack.shift()
  }
  store.user.redoStack.push(action)
  
  store.saveUser()
  return true
}

/**
 * Rétablit la dernière action annulée.
 */
export function redo(): boolean {
  const action = store.user.redoStack.pop()
  if (!action) return false

  // Appliquer l'action
  restoreActionState(action.newData, action.achievementId)
  
  // Ajouter à la pile undo
  if (store.user.undoStack.length >= MAX_HISTORY) {
    store.user.undoStack.shift()
  }
  store.user.undoStack.push(action)
  
  store.saveUser()
  return true
}

/**
 * Vérifie si une action peut être annulée.
 */
export function canUndo(): boolean {
  return store.user.undoStack.length > 0
}

/**
 * Vérifie si une action peut être rétablie.
 */
export function canRedo(): boolean {
  return store.user.redoStack.length > 0
}

/**
 * Restaure l'état d'un haut fait à partir de données.
 */
function restoreActionState(data: Record<string, unknown>, achievementId: number): void {
  const id = String(achievementId)
  
  // Restaurer la progression
  if ('completed' in data) {
    const completed = data.completed as boolean | undefined
    if (completed === true) {
      const progress = store.user.progress[id] ?? { achievementId, completed: false, completedDate: null, source: 'manual', updatedAt: '' }
      store.user.progress[id] = {
        ...progress,
        completed: true
      }
    } else if (completed === false) {
      delete store.user.progress[id]
    }
  }
  
  // Restaurer les métadonnées
  if ('priority' in data) {
    ensureMeta(achievementId).priority = data.priority as Priority
  }
  if ('inFocus' in data) {
    ensureMeta(achievementId).inFocus = data.inFocus as boolean
  }
  if ('focusOrder' in data) {
    ensureMeta(achievementId).focusOrder = data.focusOrder as number | null
  }
  if ('note' in data) {
    ensureMeta(achievementId).note = data.note as string | null
  }
  if ('deadline' in data) {
    ensureMeta(achievementId).deadline = data.deadline as string | null
  }
  
  // Restaurer les tags
  if ('tags' in data) {
    const tags = data.tags as string[] | undefined
    if (tags && tags.length > 0) {
      store.user.tagsByAchievement[id] = [...tags]
    } else {
      delete store.user.tagsByAchievement[id]
    }
  }
}

export function setManualCompletion(id: number, completed: boolean): void {
  const now = new Date().toISOString()
  // Verrou : un haut fait obtenu via le Lodestone ne peut pas être décoché manuellement.
  if (!completed && store.user.progress[id]?.source === 'lodestone') return
  
  // Sauvegarder l'état actuel pour l'historique
  const previousData: Record<string, unknown> = {
    completed: store.user.progress[id]?.completed ?? false
  }
  
  if (completed) {
    const ex = store.user.progress[id]
    store.user.progress[id] = {
      achievementId: id,
      completed: true,
      completedDate: ex?.completedDate ?? now.slice(0, 10),
      source: 'manual',
      updatedAt: now
    }
  } else {
    delete store.user.progress[id]
  }
  
  // Enregistrer l'action pour undo/redo
  pushUndoAction({
    type: 'setCompletion',
    achievementId: id,
    timestamp: now,
    previousData,
    newData: { completed }
  })
  
  store.saveUser()
}

/** Lodestone ne liste que les hauts faits obtenus : on ajoute, on ne retire jamais. */
export function applyLodestoneCompletions(
  items: { id: number; date: string | null }[]
): { newly: number; total: number } {
  const now = new Date().toISOString()
  let newly = 0
  for (const it of items) {
    const ex = store.user.progress[it.id]
    if (!ex || !ex.completed) newly++
    store.user.progress[it.id] = {
      achievementId: it.id,
      completed: true,
      completedDate: it.date ?? ex?.completedDate ?? null,
      source: 'lodestone',
      updatedAt: now
    }
  }
  store.saveUser()
  return { newly, total: countCompleted() }
}

export function setPriority(id: number, priority: Priority): void {
  const meta = ensureMeta(id)
  const previousData: Record<string, unknown> = {
    priority: meta.priority
  }
  
  meta.priority = priority
  
  pushUndoAction({
    type: 'setPriority',
    achievementId: id,
    timestamp: new Date().toISOString(),
    previousData,
    newData: { priority }
  })
  
  store.saveUser()
}

export function setFocus(id: number, inFocus: boolean): void {
  const m = ensureMeta(id)
  const previousData: Record<string, unknown> = {
    inFocus: m.inFocus,
    focusOrder: m.focusOrder
  }
  
  m.inFocus = inFocus
  if (inFocus) {
    const max = Math.max(0, ...Object.values(store.user.userMeta).map((x) => x.focusOrder ?? 0))
    m.focusOrder = max + 1
  } else {
    m.focusOrder = null
  }
  
  pushUndoAction({
    type: 'setFocus',
    achievementId: id,
    timestamp: new Date().toISOString(),
    previousData,
    newData: { inFocus, focusOrder: m.focusOrder }
  })
  
  store.saveUser()
}

export function reorderFocus(ids: number[]): void {
  ids.forEach((id, i) => {
    ensureMeta(id).focusOrder = i + 1
  })
  store.saveUser()
}

export function setNote(id: number, note: string | null): void {
  const meta = ensureMeta(id)
  const previousData: Record<string, unknown> = {
    note: meta.note
  }
  
  meta.note = note && note.trim() ? note : null
  
  pushUndoAction({
    type: 'setNote',
    achievementId: id,
    timestamp: new Date().toISOString(),
    previousData,
    newData: { note: meta.note }
  })
  
  store.saveUser()
}

export function setDeadline(id: number, deadline: string | null): void {
  const meta = ensureMeta(id)
  const previousData: Record<string, unknown> = {
    deadline: meta.deadline
  }
  
  meta.deadline = deadline || null
  
  pushUndoAction({
    type: 'setDeadline',
    achievementId: id,
    timestamp: new Date().toISOString(),
    previousData,
    newData: { deadline: meta.deadline }
  })
  
  store.saveUser()
}

export function setAchievementTags(id: number, tags: string[]): void {
  const previousData: Record<string, unknown> = {
    tags: [...(store.user.tagsByAchievement[id] ?? [])]
  }
  
  const clean = [...new Set(tags.map((t) => t.trim()).filter(Boolean))]
  if (clean.length) store.user.tagsByAchievement[id] = clean
  else delete store.user.tagsByAchievement[id]
  
  pushUndoAction({
    type: 'setTags',
    achievementId: id,
    timestamp: new Date().toISOString(),
    previousData,
    newData: { tags: clean }
  })
  
  store.saveUser()
}

// ---------------------------------------------------------------- Sync log

export function addSyncLog(entry: SyncLogEntry): void {
  store.user.syncLog.unshift(entry)
  if (store.user.syncLog.length > MAX_SYNC_LOG) store.user.syncLog.length = MAX_SYNC_LOG
  store.saveUser()
}

export function getSyncLog(): SyncLogEntry[] {
  return store.user.syncLog
}

// ---------------------------------------------------------------- Tâches récurrentes

/** Supprime les tâches liées à un haut fait désormais obtenu (auto-nettoyage). */
function pruneCompletedRecurring(): void {
  const before = store.user.recurringTasks.length
  store.user.recurringTasks = store.user.recurringTasks.filter(
    (t) => t.achievementId == null || !(store.user.progress[t.achievementId]?.completed ?? false)
  )
  if (store.user.recurringTasks.length !== before) store.saveUser()
}

export function getRecurringTasks(): RecurringTask[] {
  pruneCompletedRecurring()
  return store.user.recurringTasks
}

export function addRecurringTask(input: {
  name: string
  type: RecurringType
  achievementId?: number | null
  iconPath?: string | null
}): RecurringTask {
  const task: RecurringTask = {
    id: randomUUID(),
    name: input.name.trim(),
    type: input.type,
    achievementId: input.achievementId ?? null,
    iconPath: input.iconPath ?? null,
    lastCompletedAt: null,
    streak: 0,
    createdAt: new Date().toISOString()
  }
  store.user.recurringTasks.push(task)
  store.saveUser()
  return task
}

export function deleteRecurringTask(id: string): void {
  store.user.recurringTasks = store.user.recurringTasks.filter((t) => t.id !== id)
  store.saveUser()
}

export function setRecurringDone(id: string, done: boolean): void {
  const t = store.user.recurringTasks.find((x) => x.id === id)
  if (!t) return

  const now = new Date()
  const alreadyDone = isDoneThisPeriod(t.type, t.lastCompletedAt, now)

  if (done) {
    if (alreadyDone) return // idempotent : déjà validé cette période
    // Série continue si la validation précédente tombait dans la période juste avant.
    const prevStart = previousPeriodStart(t.type, now)
    const curStart = periodStart(t.type, now)
    const last = t.lastCompletedAt ? new Date(t.lastCompletedAt) : null
    const continued = !!last && last.getTime() >= prevStart.getTime() && last.getTime() < curStart.getTime()
    t.streak = continued ? (t.streak ?? 0) + 1 : 1
    t.lastCompletedAt = now.toISOString()
  } else {
    if (!alreadyDone) return // rien à annuler pour cette période
    t.streak = Math.max(0, (t.streak ?? 0) - 1)
    t.lastCompletedAt = null
  }

  store.saveUser()
}

// ---------------------------------------------------------------- Collections

/** Normalise un nom pour le matching Lodestone (identique au script build-collections). */
export function normalizeName(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Clé de tri d'un patch (« 7.51 » -> 751, « 7.5 » -> 750, « 2.0 » -> 200).
 * Un seul chiffre après le point = dixièmes (×10). null/inconnu -> -1 (classé en dernier).
 */
export function patchSortKey(patch: string | null): number {
  if (!patch) return -1
  const [maj, min = '0'] = patch.split('.')
  const m = min.match(/^(\d+)([a-z]?)$/i)
  const digits = m ? m[1] : '0'
  const letter = m && m[2] ? m[2].toLowerCase().charCodeAt(0) - 96 : 0
  const base = digits.length === 1 ? Number(digits) * 10 : Number(digits)
  return Number(maj) * 100 + (Number.isFinite(base) ? base : 0) + letter * 0.1
}

const ALL_COLLECTION_TYPES: CollectionType[] = [
  'mount',
  'minion',
  'orchestrion',
  'emote',
  'fashion',
  'hairstyle',
  'barding',
  'title',
  'faceaccessory',
  'spell',
  'tripletriad'
]

function emptyTypeRecord(): Record<CollectionType, number> {
  return Object.fromEntries(ALL_COLLECTION_TYPES.map((t) => [t, 0])) as Record<CollectionType, number>
}

export function getCollectionStatus(): {
  seeded: boolean
  counts: Record<CollectionType, number>
  generatedAt: string | null
  gameVersion: string | null
} {
  const counts = emptyTypeRecord()
  for (const it of store.collections.items) counts[it.type]++
  return {
    seeded: store.collections.items.length > 0,
    counts,
    generatedAt: store.collections.generatedAt,
    gameVersion: store.collections.gameVersion
  }
}

/** Patch le plus récent présent pour une collection donnée. */
function getCollectionLatestPatch(type: CollectionType): string | null {
  let best: string | null = null
  let bestKey = -1
  for (const it of store.collections.items) {
    if (it.type !== type || !it.patch) continue
    const k = patchSortKey(it.patch)
    if (k > bestKey) {
      bestKey = k
      best = it.patch
    }
  }
  return best
}

/** Nombre d'éléments du dernier patch non encore obtenus, par type (badges sidebar). */
export function getCollectionPendingByType(): Record<CollectionType, number> {
  const result = emptyTypeRecord()
  for (const type of ALL_COLLECTION_TYPES) {
    const latest = getCollectionLatestPatch(type)
    if (!latest) continue
    let pending = 0
    for (const it of store.collections.items) {
      if (it.type !== type || it.patch !== latest) continue
      if (!store.user.collections[collKey(type, it.id)]?.owned) pending++
    }
    result[type] = pending
  }
  return result
}

export function getCollectionCategories(type: CollectionType): CollectionCategory[] {
  return store.collections.categories
    .filter((c) => c.type === type)
    .sort((a, b) => a.order - b.order)
}

function buildCollectionRow(it: CollectionItem): CollectionItemRow {
  const own = store.user.collections[collKey(it.type, it.id)]
  const cat =
    it.categoryId != null
      ? store.collections.categories.find((c) => c.type === it.type && c.id === it.categoryId)
      : null
  return {
    ...it,
    categoryName: cat?.name ?? '',
    owned: own?.owned ?? false,
    ownedDate: own?.ownedDate ?? null,
    source: own?.source ?? null
  }
}

export function listCollection(filter: CollectionFilter): CollectionItemRow[] {
  const q = filter.search?.trim().toLowerCase()
  const rows: CollectionItemRow[] = []
  for (const it of store.collections.items) {
    if (it.type !== filter.type) continue
    if (filter.categoryId != null && it.categoryId !== filter.categoryId) continue
    if (filter.patch != null && it.patch !== filter.patch) continue
    const row = buildCollectionRow(it)
    if (filter.status === 'owned' && !row.owned) continue
    if (filter.status === 'missing' && row.owned) continue
    if (q && !row.name.toLowerCase().includes(q) && !row.description.toLowerCase().includes(q))
      continue
    rows.push(row)
  }
  // Tri par patch le plus récent au plus ancien, puis ordre interne / nom.
  rows.sort(
    (a, b) =>
      patchSortKey(b.patch) - patchSortKey(a.patch) ||
      a.order - b.order ||
      a.name.localeCompare(b.name, 'fr')
  )
  return rows
}

/** Progression (obtenu/total) de chaque collection, pour le tableau de bord. */
export function getAllCollectionsProgress(): { type: CollectionType; owned: number; total: number }[] {
  const acc = new Map<CollectionType, { owned: number; total: number }>()
  for (const t of ALL_COLLECTION_TYPES) acc.set(t, { owned: 0, total: 0 })
  for (const it of store.collections.items) {
    const a = acc.get(it.type)!
    a.total++
    if (store.user.collections[collKey(it.type, it.id)]?.owned) a.owned++
  }
  return ALL_COLLECTION_TYPES.map((type) => ({ type, ...acc.get(type)! }))
}

/** Patchs présents pour une collection donnée, du plus récent au plus ancien. */
export function getCollectionPatches(type: CollectionType): string[] {
  const set = new Set<string>()
  for (const it of store.collections.items) if (it.type === type && it.patch) set.add(it.patch)
  return [...set].sort((a, b) => patchSortKey(b) - patchSortKey(a))
}

export function getCollectionProgress(type: CollectionType): CollectionProgress {
  let total = 0
  let owned = 0
  for (const it of store.collections.items) {
    if (it.type !== type) continue
    total++
    if (store.user.collections[collKey(type, it.id)]?.owned) owned++
  }
  return { type, total, owned }
}

export function setCollectionOwned(type: CollectionType, id: number, owned: boolean): void {
  const key = collKey(type, id)
  if (owned) {
    const ex = store.user.collections[key]
    store.user.collections[key] = {
      owned: true,
      ownedDate: ex?.ownedDate ?? new Date().toISOString().slice(0, 10),
      source: 'manual',
      updatedAt: new Date().toISOString()
    }
  } else {
    delete store.user.collections[key]
  }
  store.saveUser()
}

/**
 * Applique une liste de noms scrappés du Lodestone à une collection.
 * On n'ajoute jamais de retrait (le Lodestone ne liste que le possédé).
 */
export function applyLodestoneCollection(
  type: CollectionType,
  names: string[]
): { matched: number; unmatched: number; newly: number } {
  // Index alias normalisé -> id, construit à la volée.
  const aliasToId = new Map<string, number>()
  for (const it of store.collections.items) {
    if (it.type !== type) continue
    for (const a of it.aliases) if (!aliasToId.has(a)) aliasToId.set(a, it.id)
  }
  const now = new Date().toISOString()
  let matched = 0
  let unmatched = 0
  let newly = 0
  for (const raw of names) {
    const id = aliasToId.get(normalizeName(raw))
    if (id == null) {
      unmatched++
      continue
    }
    matched++
    const key = collKey(type, id)
    const ex = store.user.collections[key]
    if (!ex?.owned) newly++
    store.user.collections[key] = {
      owned: true,
      ownedDate: ex?.ownedDate ?? now.slice(0, 10),
      source: 'lodestone',
      updatedAt: now
    }
  }
  store.saveUser()
  return { matched, unmatched, newly }
}

// ---------------------------------------------------------------- Tâches récurrentes

export function countPendingRecurring(
  now: Date = new Date()
): { daily: number; weekly: number; daily22: number } {
  pruneCompletedRecurring()
  let daily = 0
  let weekly = 0
  let daily22 = 0
  for (const t of store.user.recurringTasks) {
    if (!isDoneThisPeriod(t.type, t.lastCompletedAt, now)) {
      if (t.type === 'weekly') weekly++
      else if (t.type === 'daily22') daily22++
      else daily++
    }
  }
  return { daily, weekly, daily22 }
}
