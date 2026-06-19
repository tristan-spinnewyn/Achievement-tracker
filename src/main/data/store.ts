import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'fs'
import { join } from 'path'
import type {
  Achievement,
  AchievementCategory,
  AchievementDifficulty,
  AchievementKind,
  CollectionCategory,
  CollectionItem,
  CollectionOwnership,
  Progress,
  RecurringTask,
  Settings,
  SuggestionWeights,
  SyncLogEntry,
  UndoableAction,
  UserMeta
} from '@shared/types'

export interface CatalogData {
  generatedAt: string | null
  gameVersion: string | null
  kinds: AchievementKind[]
  categories: AchievementCategory[]
  achievements: Achievement[]
}

export interface CollectionsData {
  generatedAt: string | null
  gameVersion: string | null
  categories: CollectionCategory[]
  items: CollectionItem[]
}

export interface UserData {
  settings: Settings
  progress: Record<string, Progress>
  userMeta: Record<string, UserMeta>
  tagsByAchievement: Record<string, string[]>
  recurringTasks: RecurringTask[]
  syncLog: SyncLogEntry[]
  /** Possession des collections, clé `${type}:${id}`. */
  collections: Record<string, CollectionOwnership>
  /** Cache Lodestone : `${type}:${hash}` -> nom de l'objet (le hash est global et stable). */
  collectionHashCache: Record<string, string>
  /** Historique des actions pour undo/redo. */
  undoStack: UndoableAction[]
  /** Pile des actions annulées (pour redo). */
  redoStack: UndoableAction[]
}

const DEFAULT_SETTINGS: Settings = {
  lodestoneCharacterId: null,
  region: 'eu',
  language: 'fr',
  lastSyncAt: null,
  theme: 'dark',
  autoSync: false,
  suggestionWeights: { priority: 3, points: 1, categoryProximity: 2 },
  syncHash: null
}

function emptyCatalog(): CatalogData {
  return { generatedAt: null, gameVersion: null, kinds: [], categories: [], achievements: [] }
}

function emptyUser(): UserData {
  return {
    settings: { ...DEFAULT_SETTINGS },
    progress: {},
    userMeta: {},
    tagsByAchievement: {},
    recurringTasks: [],
    syncLog: [],
    collections: {},
    collectionHashCache: {},
    undoStack: [],
    redoStack: []
  }
}

function emptyCollections(): CollectionsData {
  return { generatedAt: null, gameVersion: null, categories: [], items: [] }
}

function readJson<T>(path: string, fallback: T): T {
  try {
    if (!existsSync(path)) return fallback
    return JSON.parse(readFileSync(path, 'utf8')) as T
  } catch (err) {
    console.error(`[store] lecture impossible (${path}) :`, err)
    return fallback
  }
}

/** Écriture atomique : fichier temporaire + renommage, pour éviter une sauvegarde corrompue. */
function atomicWrite(path: string, data: string): void {
  const tmp = `${path}.tmp`
  writeFileSync(tmp, data, 'utf8')
  renameSync(tmp, path)
}

/** Clé de stockage d'un élément de collection. */
export function collKey(type: string, id: number): string {
  return `${type}:${id}`
}

class Store {
  private catalogPath = ''
  private userPath = ''
  private collectionsPath = ''

  catalog: CatalogData = emptyCatalog()
  collections: CollectionsData = emptyCollections()
  user: UserData = emptyUser()

  kindById = new Map<number, AchievementKind>()
  categoryById = new Map<number, AchievementCategory>()
  achievementById = new Map<number, Achievement>()
  collectionItemByKey = new Map<string, CollectionItem>()
  
  // Difficultés calculées pour chaque haut fait
  difficulties: Map<number, AchievementDifficulty> = new Map()

  init(): void {
    const dir = app.getPath('userData')
    mkdirSync(dir, { recursive: true })
    this.catalogPath = join(dir, 'catalog.json')
    this.userPath = join(dir, 'userdata.json')
    this.collectionsPath = join(dir, 'collections.json')

    this.catalog = readJson(this.catalogPath, emptyCatalog())
    this.collections = readJson(this.collectionsPath, emptyCollections())
    const loaded = readJson<Partial<UserData>>(this.userPath, {})
    this.user = {
      ...emptyUser(),
      ...loaded,
      settings: { ...DEFAULT_SETTINGS, ...(loaded.settings ?? {}) }
    }
    this.reindex()
  }

  reindex(): void {
    this.kindById = new Map(this.catalog.kinds.map((k) => [k.id, k]))
    this.categoryById = new Map(this.catalog.categories.map((c) => [c.id, c]))
    this.achievementById = new Map(this.catalog.achievements.map((a) => [a.id, a]))
    this.collectionItemByKey = new Map(
      this.collections.items.map((i) => [collKey(i.type, i.id), i])
    )
  }

  setCatalog(catalog: CatalogData): void {
    this.catalog = catalog
    this.saveCatalog()
    this.reindex()
  }

  setCollections(collections: CollectionsData): void {
    this.collections = collections
    this.saveCollections()
    this.reindex()
  }

  saveCatalog(): void {
    atomicWrite(this.catalogPath, JSON.stringify(this.catalog))
  }

  saveCollections(): void {
    atomicWrite(this.collectionsPath, JSON.stringify(this.collections))
  }

  saveUser(): void {
    atomicWrite(this.userPath, JSON.stringify(this.user))
  }

  /** Remplace les données utilisateur (import de sauvegarde), en comblant les champs manquants. */
  replaceUser(data: Partial<UserData>): void {
    this.user = {
      ...emptyUser(),
      ...data,
      settings: { ...DEFAULT_SETTINGS, ...(data.settings ?? {}) }
    }
    this.saveUser()
  }

  /**
   * Définit les difficultés calculées pour tous les hauts faits
   */
  setDifficulties(difficulties: Map<number, AchievementDifficulty>): void {
    this.difficulties = difficulties
  }

  /**
   * Récupère la difficulté d'un haut fait spécifique
   */
  getDifficulty(achievementId: number): AchievementDifficulty | undefined {
    return this.difficulties.get(achievementId)
  }
}

export const store = new Store()
