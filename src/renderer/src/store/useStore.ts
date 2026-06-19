import { create } from 'zustand'
import type {
  AchievementCategory,
  AchievementDifficulty,
  AchievementFilter,
  AchievementKind,
  AchievementRow,
  CatalogStatus,
  CollectionType,
  DifficultyLevel,
  Priority,
  RecurringTask,
  RecurringType
} from '@shared/types'

export type View =
  | 'dashboard'
  | 'achievements'
  | 'newpatch'
  | 'focus'
  | 'recurring'
  | 'mounts'
  | 'minions'
  | 'orchestrion'
  | 'emotes'
  | 'fashion'
  | 'hairstyles'
  | 'bardings'
  | 'titles'
  | 'faceaccessories'
  | 'bluemagic'
  | 'tripletriad'
  | 'suggestions'
  | 'settings'

export const DEFAULT_FILTER: AchievementFilter = {
  search: '',
  kindId: null,
  categoryId: null,
  status: 'all',
  priority: null,
  minPoints: null,
  maxPoints: null,
  obtainableOnly: false,
  hasNote: false,
  tags: [],
  sortBy: 'patch',
  sortDir: 'desc'
}

interface State {
  view: View
  setView: (v: View) => void

  catalogStatus: CatalogStatus | null
  kinds: AchievementKind[]
  categories: AchievementCategory[]
  tags: string[]

  filter: AchievementFilter
  rows: AchievementRow[]
  loading: boolean
  error: string | null

  selectedId: number | null
  select: (id: number | null) => void

  recurring: RecurringTask[]
  newPatchPending: number
  collectionPending: Record<CollectionType, number>

  // Difficultés
  difficulties: Map<number, AchievementDifficulty>
  difficultyStats: {
    total: number
    byLevel: Record<DifficultyLevel, number>
    averageScore: number
    hardest: { id: number; name: string; score: number } | null
    easiest: { id: number; name: string; score: number } | null
  } | null

  init: () => Promise<void>
  loadRows: () => Promise<void>
  refreshStatus: () => Promise<void>
  refreshNewPatch: () => Promise<void>
  refreshCollectionPending: () => Promise<void>
  refreshTags: () => Promise<void>
  setFilter: (patch: Partial<AchievementFilter>) => void
  resetFilter: () => void
  loadDifficulties: () => Promise<void>

  toggleCompletion: (row: AchievementRow) => Promise<void>
  setPriority: (id: number, priority: Priority) => Promise<void>
  setFocus: (id: number, inFocus: boolean) => Promise<void>
  setNote: (id: number, note: string | null) => Promise<void>
  setTags: (id: number, tags: string[]) => Promise<void>
  setDeadline: (id: number, deadline: string | null) => Promise<void>

  loadRecurring: () => Promise<void>
  addRecurring: (input: {
    name: string
    type: RecurringType
    achievementId?: number | null
    iconPath?: string | null
  }) => Promise<void>
  deleteRecurring: (id: string) => Promise<void>
  setRecurringDone: (id: string, done: boolean) => Promise<void>
}

const VIEW_KEY = 'ffxiv.lastView'

function initialView(): View {
  try {
    const v = localStorage.getItem(VIEW_KEY) as View | null
    if (v) return v
  } catch {
    // localStorage indisponible
  }
  return 'achievements'
}

export const useStore = create<State>()((set, get) => ({
  view: initialView(),
  setView: (v) => {
    try {
      localStorage.setItem(VIEW_KEY, v)
    } catch {
      // ignore
    }
    set({ view: v })
  },

  catalogStatus: null,
  kinds: [],
  categories: [],
  tags: [],

  filter: { ...DEFAULT_FILTER },
  rows: [],
  loading: false,
  error: null,

  // Difficultés
  difficulties: new Map(),
  difficultyStats: null,

  selectedId: null,
  select: (id) => set({ selectedId: id }),

  recurring: [],
  newPatchPending: 0,
  collectionPending: {
    mount: 0,
    minion: 0,
    orchestrion: 0,
    emote: 0,
    fashion: 0,
    hairstyle: 0,
    barding: 0,
    title: 0,
    faceaccessory: 0,
    spell: 0,
    tripletriad: 0
  },

  init: async () => {
    try {
      const [catalogStatus, kinds, categories, tags, recurring, latestPatch, collectionPending, difficulties] =
        await Promise.all([
          window.api.catalog.status(),
          window.api.meta.kinds(),
          window.api.meta.categories(),
          window.api.meta.tags(),
          window.api.recurring.list(),
          window.api.achievements.latestPatch(),
          window.api.collections.pending(),
          window.api.difficulty.all()
        ])
      const difficultyStats = await window.api.difficulty.stats()
      const difficultiesMap = new Map<number, AchievementDifficulty>(difficulties.map(d => [d.id, d]))
      
      set({
        catalogStatus,
        kinds,
        categories,
        tags,
        recurring,
        newPatchPending: latestPatch.pending,
        collectionPending,
        difficulties: difficultiesMap,
        difficultyStats,
        error: null
      })
      await get().loadRows()
    } catch (e) {
      set({ error: String(e) })
    }
  },

  loadRows: async () => {
    set({ loading: true })
    try {
      const rows = await window.api.achievements.list(get().filter)
      set({ rows, loading: false })
    } catch (e) {
      set({ error: String(e), loading: false })
    }
  },

  loadDifficulties: async () => {
    try {
      const difficulties = await window.api.difficulty.all()
      const difficultyStats = await window.api.difficulty.stats()
      const difficultiesMap = new Map<number, AchievementDifficulty>(difficulties.map(d => [d.id, d]))
      set({ difficulties: difficultiesMap, difficultyStats })
    } catch (e) {
      set({ error: String(e) })
    }
  },

  refreshStatus: async () => {
    set({ catalogStatus: await window.api.catalog.status() })
  },

  refreshNewPatch: async () => {
    set({ newPatchPending: (await window.api.achievements.latestPatch()).pending })
  },

  refreshCollectionPending: async () => {
    set({ collectionPending: await window.api.collections.pending() })
  },

  refreshTags: async () => {
    set({ tags: await window.api.meta.tags() })
  },

  setFilter: (patch) => {
    set({ filter: { ...get().filter, ...patch } })
    get().loadRows()
  },

  resetFilter: () => {
    set({ filter: { ...DEFAULT_FILTER } })
    get().loadRows()
  },

  toggleCompletion: async (row) => {
    await window.api.achievements.setCompletion(row.id, !row.completed)
    await get().loadRows()
    await get().refreshStatus()
    await get().refreshNewPatch()
    await get().loadRecurring()
  },

  setPriority: async (id, priority) => {
    await window.api.achievements.setPriority(id, priority)
    await get().loadRows()
  },

  setFocus: async (id, inFocus) => {
    await window.api.achievements.setFocus(id, inFocus)
    await get().loadRows()
  },

  setNote: async (id, note) => {
    await window.api.achievements.setNote(id, note)
    await get().loadRows()
  },

  setTags: async (id, tags) => {
    await window.api.achievements.setTags(id, tags)
    await get().loadRows()
    await get().refreshTags()
  },

  setDeadline: async (id, deadline) => {
    await window.api.achievements.setDeadline(id, deadline)
    await get().loadRows()
  },

  loadRecurring: async () => {
    set({ recurring: await window.api.recurring.list() })
  },

  addRecurring: async (input) => {
    await window.api.recurring.add(input)
    await get().loadRecurring()
  },

  deleteRecurring: async (id) => {
    await window.api.recurring.delete(id)
    await get().loadRecurring()
  },

  setRecurringDone: async (id, done) => {
    await window.api.recurring.setDone(id, done)
    await get().loadRecurring()
  }
}))
