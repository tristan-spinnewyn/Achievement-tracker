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
  /** Patch d'introduction, ex. « 7.51 » ; null si inconnu. */
  patch: string | null
  /** Est-ce un haut fait saisonnier/événementiel ? */
  isSeasonal?: boolean
  /** Nom de l'événement saisonnier, ex. « Moonfire Faire », « Little Ladies' Day », etc. */
  seasonalEvent?: string | null
  /** Date de fin de l'événement saisonnier (ISO date) si connu, null sinon. */
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
// Note : `patch` est hérité d'Achievement par AchievementRow.
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
  /** Filtre par patch d'introduction, ex. « 7.51 ». */
  patch?: string | null
  /** Filtrer uniquement les hauts faits saisonniers. */
  seasonalOnly?: boolean
  /** Filtrer par événement saisonnier spécifique. */
  seasonalEvent?: string | null
  /** Filtrer par niveau de difficulté */
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
  /** Synchroniser le Lodestone automatiquement au démarrage. */
  autoSync: boolean
  /** Poids pour le moteur de suggestion. */
  suggestionWeights: SuggestionWeights
  /** Sauvegarde automatique miroir dans Mes Documents à chaque modification. */
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

/** Action pour l'historique undo/redo. */
export type UndoableAction = {
  type: 'setCompletion' | 'setPriority' | 'setFocus' | 'setNote' | 'setTags' | 'setDeadline'
  achievementId: number
  timestamp: string
  /** Données avant la modification (pour undo). */
  previousData: Record<string, unknown>
  /** Données après la modification (pour redo). */
  newData: Record<string, unknown>
}

/**
 * Type de récurrence d'une tâche :
 *  - `daily`   : reset quotidien du JEU (15:00 UTC).
 *  - `weekly`  : reset hebdomadaire du jeu (mardi 08:00 UTC).
 *  - `daily22` : reset quotidien PERSO à 22:00 heure locale.
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
  /** ISO de la dernière validation ; comparée au début de période pour savoir si « fait ». */
  lastCompletedAt: string | null
  /** Nombre de périodes consécutives validées (série en cours). Absent = 0 (anciennes données). */
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

/** Collections suivies (montures, mascottes, orchestrion, emotes, mode, coiffures, barde, titres). */
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

/** Types synchronisables depuis le Lodestone. */
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
  /** Patch d'introduction, ex. « 7.51 » ; null si inconnu. */
  patch: string | null
  /** Moyen(s) d'obtention, ex. « Quête : … », « Boutique en ligne ». */
  sources: string[]
  /** Noms normalisés (FR/EN/DE/JA) pour matcher le Lodestone ; vide si non synchronisable. */
  aliases: string[]
}

export interface CollectionsSnapshot {
  generatedAt: string
  gameVersion: string
  categories: CollectionCategory[]
  items: CollectionItem[]
}

/** État de possession d'un élément, stocké côté utilisateur (clé `${type}:${id}`). */
export interface CollectionOwnership {
  owned: boolean
  ownedDate: string | null
  source: SyncSource
  updatedAt: string
}

/** Ligne dénormalisée consommée par l'UI. */
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
