import { vi } from 'vitest'
import type {
  AchievementRow,
  CollectionItemRow,
  CollectionType,
  DashboardData,
  Settings
} from '@shared/types'

/** Wraps a value in a mocked async function (the shape of every `window.api` call). */
export const ok = <T>(v: T) => vi.fn(async (..._args: unknown[]) => v)

const emptyCounts = (): Record<CollectionType, number> => ({
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
  tripletriad: 0,
  beast: 0
})

export function makeSettings(over: Partial<Settings> = {}): Settings {
  return {
    lodestoneCharacterId: null,
    region: 'eu',
    language: 'fr',
    lastSyncAt: null,
    theme: 'dark',
    autoSync: false,
    suggestionWeights: { priority: 1, points: 1, categoryProximity: 1 },
    autoBackupDocuments: true,
    ...over
  }
}

export function makeRow(over: Partial<AchievementRow> = {}): AchievementRow {
  return {
    id: 1,
    name: 'Premier pas',
    description: 'Faire quelque chose',
    points: 10,
    categoryId: 2,
    kindId: 1,
    iconPath: null,
    obtainable: true,
    patch: '7.0',
    categoryName: 'Donjons',
    kindName: 'Combats',
    completed: false,
    completedDate: null,
    source: null,
    priority: 0,
    inFocus: false,
    focusOrder: null,
    note: null,
    deadline: null,
    tags: [],
    ...over
  }
}

export function makeCollectionRow(over: Partial<CollectionItemRow> = {}): CollectionItemRow {
  return {
    type: 'mount',
    id: 1,
    name: 'Chocobo',
    description: 'Quête principale',
    iconPath: null,
    categoryId: null,
    order: 1,
    patch: '2.0',
    sources: [],
    aliases: [],
    categoryName: '',
    owned: false,
    ownedDate: null,
    source: null,
    ...over
  }
}

export function makeDashboard(over: Partial<DashboardData> = {}): DashboardData {
  return {
    totalAchievements: 10,
    completedAchievements: 4,
    totalPoints: 100,
    earnedPoints: 40,
    focusCount: 1,
    byKind: [{ kindId: 1, kindName: 'Combats', total: 10, completed: 4, points: 100, earnedPoints: 40 }],
    byCategory: [
      {
        categoryId: 2,
        categoryName: 'Donjons',
        kindId: 1,
        kindName: 'Combats',
        total: 10,
        completed: 4,
        points: 100,
        earnedPoints: 40
      }
    ],
    recentCompletions: [{ id: 1, name: 'Premier pas', completedDate: '2026-10-01', points: 10 }],
    ...over
  }
}

/** A complete `window.api` mock with neutral defaults; tests override what they need. */
export function makeApi() {
  return {
    catalog: {
      status: ok({ seeded: true, achievementCount: 2, gameVersion: '7.3', generatedAt: null }),
      refresh: ok({ seeded: true, achievementCount: 2, gameVersion: '7.3', generatedAt: null })
    },
    achievements: {
      list: ok<AchievementRow[]>([]),
      get: ok<AchievementRow | null>(null),
      focusList: ok<AchievementRow[]>([]),
      latestPatch: ok({ patch: null as string | null, pending: 0, total: 0 }),
      setCompletion: ok(true),
      setPriority: ok(true),
      setFocus: ok(true),
      reorderFocus: ok(true),
      setNote: ok(true),
      setDeadline: ok(true),
      setTags: ok(true)
    },
    meta: {
      kinds: ok([]),
      categories: ok([]),
      tags: ok<string[]>([]),
      patches: ok<string[]>([]),
      seasonalEvents: ok<string[]>([])
    },
    dashboard: ok(makeDashboard()),
    data: {
      export: ok<{ ok: boolean; canceled?: boolean; path?: string; error?: string }>({ ok: true, path: 'C:/b.json' }),
      import: ok<{ ok: boolean; canceled?: boolean; path?: string; error?: string }>({ ok: true }),
      autoBackupInfo: ok({
        enabled: true,
        path: 'C:/Docs/backup.json',
        folder: 'C:/Docs',
        exists: true,
        lastSavedAt: '2026-10-01T10:00:00.000Z',
        sizeBytes: 2048
      }),
      openDocumentsFolder: ok('C:/Docs')
    },
    history: {
      undo: ok(true),
      redo: ok(true),
      canUndo: ok(false),
      canRedo: ok(false)
    },
    settings: {
      get: ok(makeSettings()),
      update: vi.fn(async (patch: Partial<Settings>) => makeSettings(patch))
    },
    lodestone: {
      sync: ok({ ok: true, newlyCompleted: 1, totalCompleted: 5, message: 'Synchro OK', at: '' }),
      syncLog: ok<{ at: string; ok: boolean; newlyCompleted: number; totalCompleted: number; message: string }[]>([])
    },
    suggestions: ok([]),
    collections: {
      status: ok({ seeded: true, counts: emptyCounts(), generatedAt: null as string | null, gameVersion: null }),
      pending: ok(emptyCounts()),
      allProgress: ok<{ type: CollectionType; owned: number; total: number }[]>([]),
      patches: ok<string[]>([]),
      refresh: ok({ seeded: true, counts: emptyCounts() }),
      list: ok<CollectionItemRow[]>([]),
      categories: ok([]),
      progress: ok({ type: 'mount' as CollectionType, total: 0, owned: 0 }),
      setOwned: ok(true),
      sync: ok({ ok: true, type: 'mount' as CollectionType, matched: 1, unmatched: 0, newly: 1, message: 'Collection OK', at: '' })
    },
    recurring: {
      list: ok([]),
      add: ok({}),
      delete: ok(true),
      setDone: ok(true),
      pending: ok({ daily: 0, weekly: 0, daily22: 0 })
    },
    icons: {
      getUrl: ok<string | null>(null),
      prefetch: ok(undefined)
    },
    difficulty: {
      get: ok(undefined),
      all: ok([]),
      stats: ok({
        total: 0,
        byLevel: { very_easy: 0, easy: 0, medium: 0, hard: 0, very_hard: 0, extreme: 0 },
        averageScore: 0,
        hardest: null,
        easiest: null
      }),
      filter: ok<number[]>([]),
      sort: ok<number[]>([]),
      weights: ok({ kind: {} as Record<number, number>, category: {}, patch: {} }),
      recalculate: ok({ success: true, count: 0 })
    },
    onNavigate: vi.fn(() => () => {}),
    updater: {
      check: ok({ state: 'not-available', version: '1.0.1' }),
      download: ok(undefined),
      install: ok(undefined),
      status: ok({ state: 'idle' }),
      appVersion: ok('1.0.1'),
      onStatusChange: vi.fn(() => () => {})
    }
  }
}

export type MockApi = ReturnType<typeof makeApi>

/** Installs a fresh mock on `window.api` and returns it. */
export function installApi(): MockApi {
  const api = makeApi()
  ;(window as unknown as { api: MockApi }).api = api
  return api
}

/** The mock currently installed on `window.api`. */
export const api = (): MockApi => (window as unknown as { api: MockApi }).api
