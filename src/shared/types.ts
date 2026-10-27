// Shared domain types used by both the main process and the renderer.

export type Region = 'na' | 'eu' | 'fr' | 'de' | 'ja'
export type Language = 'fr' | 'en' | 'de' | 'ja'
export type SyncSource = 'lodestone' | 'manual'

/** 0 = none, 1 = low, 2 = medium, 3 = high */
export type Priority = 0 | 1 | 2 | 3

export interface AchievementKind {
  id: number
  name: string
  order: number
}

export interface AchievementCategory {
  id: number
  kindId: number
  name: string
  order: number
}

export interface Achievement {
  id: number
  name: string
  description: string
  points: number
  categoryId: number
  kindId: number
  iconPath: string | null
  obtainable: boolean
  /** Patch that introduced it, e.g. "7.51"; null if unknown. */
  patch: string | null
  /** Is this a seasonal / event achievement? */
  isSeasonal?: boolean
  /** Name of the seasonal event, e.g. "Moonfire Faire", "Little Ladies' Day", etc. */
  seasonalEvent?: string | null
  /** End date of the seasonal event (ISO date) if known, null otherwise. */
  seasonalEndDate?: string | null
}

export interface Progress {
  achievementId: number
  completed: boolean
  completedDate: string | null // ISO date
  source: SyncSource
  updatedAt: string
}

export interface UserMeta {
  achievementId: number
  priority: Priority
  inFocus: boolean
  focusOrder: number | null
  note: string | null
  deadline: string | null
}

/** Denormalized row consumed by the UI (achievement + progress + user meta). */
export interface AchievementRow extends Achievement {
  categoryName: string
  kindName: string
  completed: boolean
  completedDate: string | null
  source: SyncSource | null
  priority: Priority
  inFocus: boolean
  focusOrder: number | null
  note: string | null
  deadline: string | null
  tags: string[]
}

export type AchievementStatus = 'all' | 'completed' | 'todo' | 'focus'
// Note: `patch` is inherited from Achievement by AchievementRow.
export type SortField =
  | 'name'
  | 'points'
  | 'category'
  | 'completedDate'
  | 'priority'
  | 'focusOrder'
  | 'patch'
  | 'difficulty'
export type SortDir = 'asc' | 'desc'

export interface AchievementFilter {
  search?: string
  kindId?: number | null
  categoryId?: number | null
  status?: AchievementStatus
  priority?: Priority | null
  minPoints?: number | null
  maxPoints?: number | null
  obtainableOnly?: boolean
  hasNote?: boolean
  tags?: string[]
  /** Filter by the patch that introduced it, e.g. "7.51". */
  patch?: string | null
  /** Only seasonal achievements. */
  seasonalOnly?: boolean
  /** Filter by a specific seasonal event. */
  seasonalEvent?: string | null
  /** Filter by difficulty level */
  difficultyLevel?: DifficultyLevel | null
  sortBy?: SortField
  sortDir?: SortDir
  limit?: number
  offset?: number
}

export interface CategoryProgress {
  categoryId: number
  categoryName: string
  kindId: number
  kindName: string
  total: number
  completed: number
  points: number
  earnedPoints: number
}

export interface KindProgress {
  kindId: number
  kindName: string
  total: number
  completed: number
  points: number
  earnedPoints: number
}

export interface DashboardData {
  totalAchievements: number
  completedAchievements: number
  totalPoints: number
  earnedPoints: number
  focusCount: number
  byKind: KindProgress[]
  byCategory: CategoryProgress[]
  recentCompletions: { id: number; name: string; completedDate: string | null; points: number }[]
}

export interface Settings {
  lodestoneCharacterId: string | null
  region: Region
  language: Language
  lastSyncAt: string | null
  theme: 'dark' | 'light'
  /** Sync the Lodestone automatically at startup. */
  autoSync: boolean
  /** Weights for the suggestion engine. */
  suggestionWeights: SuggestionWeights
  /** Automatic mirror backup in My Documents on every change. */
  autoBackupDocuments?: boolean
}

export interface AutoBackupInfo {
  enabled: boolean
  path: string
  folder: string
  exists: boolean
  lastSavedAt: string | null
  sizeBytes: number | null
}

export interface SyncResult {
  ok: boolean
  newlyCompleted: number
  totalCompleted: number
  message: string
  at: string
}

export interface SyncLogEntry {
  at: string
  ok: boolean
  newlyCompleted: number
  totalCompleted: number
  message: string
}

/** Action for the undo/redo history. */
export type UndoableAction = {
  type: 'setCompletion' | 'setPriority' | 'setFocus' | 'setNote' | 'setTags' | 'setDeadline'
  achievementId: number
  timestamp: string
  /** Data before the change (for undo). */
  previousData: Record<string, unknown>
  /** Data after the change (for redo). */
  newData: Record<string, unknown>
}

/**
 * Recurrence type of a task:
 *  - `daily`   : GAME daily reset (15:00 UTC).
 *  - `weekly`  : game weekly reset (Tuesday 08:00 UTC).
 *  - `daily22` : PERSONAL daily reset at 22:00 local time.
 */
export type RecurringType = 'daily' | 'weekly' | 'daily22'

// ================================================================ Difficulty
export type DifficultyLevel = 'very_easy' | 'easy' | 'medium' | 'hard' | 'very_hard' | 'extreme'

export interface AchievementDifficulty {
  score: number
  level: DifficultyLevel
  levelName: string
  color: string
  stars: string
}

export interface DifficultyWeights {
  kindWeights: Record<number, number>
  categoryWeights: Record<number, number>
  patchWeights: Record<string, number>
}

export interface RecurringTask {
  id: string
  name: string
  type: RecurringType
  achievementId: number | null
  iconPath: string | null
  /** ISO of the last check; compared with the period start to know whether it is "done". */
  lastCompletedAt: string | null
  /** Number of consecutive checked periods (current streak). Missing = 0 (old data). */
  streak?: number
  createdAt: string
}

export interface SuggestionWeights {
  priority: number
  points: number
  categoryProximity: number
}

export interface Suggestion {
  achievement: AchievementRow
  score: number
  reasons: string[]
}

/** Shape of the bundled catalog snapshot (resources/catalog-snapshot.json). */
export interface CatalogSnapshot {
  generatedAt: string
  gameVersion: string
  kinds: AchievementKind[]
  categories: AchievementCategory[]
  achievements: Achievement[]
}

export interface CatalogStatus {
  seeded: boolean
  achievementCount: number
  gameVersion: string | null
  generatedAt: string | null
}

// ---------------------------------------------------------------- Collections

/** Tracked collections (mounts, minions, orchestrion, emotes, fashion, hairstyles, barding, titles). */
export type CollectionType =
  | 'mount'
  | 'minion'
  | 'orchestrion'
  | 'emote'
  | 'fashion'
  | 'hairstyle'
  | 'barding'
  | 'title'
  | 'faceaccessory'
  | 'spell'
  | 'tripletriad'
  | 'beast'

/** Types syncable from the Lodestone. */
export const SYNCABLE_COLLECTIONS: CollectionType[] = ['mount', 'minion', 'emote', 'faceaccessory']

export interface CollectionCategory {
  type: CollectionType
  id: number
  name: string
  order: number
}

export interface CollectionItem {
  type: CollectionType
  id: number
  name: string
  description: string
  iconPath: string | null
  categoryId: number | null
  order: number
  /** Patch that introduced it, e.g. "7.51"; null if unknown. */
  patch: string | null
  /** Acquisition method(s), e.g. "Quête : …", "Boutique en ligne". */
  sources: string[]
  /** Normalised names (FR/EN/DE/JA) to match the Lodestone; empty if not syncable. */
  aliases: string[]
}

export interface CollectionsSnapshot {
  generatedAt: string
  gameVersion: string
  categories: CollectionCategory[]
  items: CollectionItem[]
}

/** Ownership state of an item, stored on the user side (key `${type}:${id}`). */
export interface CollectionOwnership {
  owned: boolean
  ownedDate: string | null
  source: SyncSource
  updatedAt: string
}

/** Denormalized row consumed by the UI. */
export interface CollectionItemRow extends CollectionItem {
  categoryName: string
  owned: boolean
  ownedDate: string | null
  source: SyncSource | null
}

export type CollectionStatus = 'all' | 'owned' | 'missing'

export interface CollectionFilter {
  type: CollectionType
  search?: string
  status?: CollectionStatus
  categoryId?: number | null
  patch?: string | null
}

export interface CollectionProgress {
  type: CollectionType
  total: number
  owned: number
}

export interface CollectionSyncResult {
  ok: boolean
  type: CollectionType
  matched: number
  unmatched: number
  newly: number
  message: string
  at: string
}

export interface UpdateProgress {
  percent: number
  bytesPerSecond: number
  transferred: number
  total: number
}

export type UpdateStatus =
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'available'; version: string; releaseDate?: string; releaseNotes?: string | null }
  | { state: 'not-available'; version: string }
  | { state: 'downloading'; version: string; progress: UpdateProgress }
  | { state: 'downloaded'; version: string }
  | { state: 'error'; message: string }

