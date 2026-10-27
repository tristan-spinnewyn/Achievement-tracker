import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const ok = <T>(v: T) => vi.fn(async (..._args: unknown[]) => v)

function makeApi() {
  return {
    catalog: { status: ok({ seeded: true, achievementCount: 2, gameVersion: '7.3', generatedAt: null }) },
    meta: { kinds: ok([{ id: 1 }]), categories: ok([{ id: 2 }]), tags: ok(['a']) },
    recurring: {
      list: ok([{ id: 'r1' }]),
      add: ok({ id: 'r2' }),
      delete: ok(true),
      setDone: ok(true)
    },
    achievements: {
      latestPatch: ok({ patch: '7.3', pending: 4, total: 10 }),
      list: ok([{ id: 1, completed: false }]),
      setCompletion: ok(true),
      setPriority: ok(true),
      setFocus: ok(true),
      setNote: ok(true),
      setTags: ok(true),
      setDeadline: ok(true)
    },
    collections: { pending: ok({ mount: 1 }) },
    difficulty: {
      all: ok([{ id: 1, score: 10, level: 'easy' }]),
      stats: ok({ total: 1, byLevel: {}, averageScore: 10, hardest: null, easiest: null })
    }
  }
}

type StoreModule = typeof import('../src/renderer/src/store/useStore')
let api: ReturnType<typeof makeApi>
let storage: Map<string, string>

async function load(): Promise<StoreModule> {
  vi.resetModules()
  return import('../src/renderer/src/store/useStore')
}

beforeEach(() => {
  api = makeApi()
  storage = new Map()
  vi.stubGlobal('window', { api })
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => void storage.set(k, v)
  })
})

afterEach(() => vi.unstubAllGlobals())

describe('useStore : vue courante', () => {
  it('restaure la dernière vue et la persiste', async () => {
    storage.set('ffxiv.lastView', 'focus')
    const { useStore } = await load()
    expect(useStore.getState().view).toBe('focus')
    useStore.getState().setView('settings')
    expect(useStore.getState().view).toBe('settings')
    expect(storage.get('ffxiv.lastView')).toBe('settings')
  })

  it('retombe sur « achievements » et tolère un localStorage indisponible', async () => {
    const { useStore: s1 } = await load()
    expect(s1.getState().view).toBe('achievements')

    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('denied')
      },
      setItem: () => {
        throw new Error('denied')
      }
    })
    const { useStore } = await load()
    expect(useStore.getState().view).toBe('achievements')
    useStore.getState().setView('dashboard')
    expect(useStore.getState().view).toBe('dashboard')
  })
})

describe('useStore : chargement', () => {
  it('init charge toutes les données puis les lignes', async () => {
    const { useStore } = await load()
    await useStore.getState().init()
    const s = useStore.getState()
    expect(s.catalogStatus?.achievementCount).toBe(2)
    expect(s.kinds).toEqual([{ id: 1 }])
    expect(s.categories).toEqual([{ id: 2 }])
    expect(s.tags).toEqual(['a'])
    expect(s.recurring).toEqual([{ id: 'r1' }])
    expect(s.newPatchPending).toBe(4)
    expect(s.collectionPending).toEqual({ mount: 1 })
    expect(s.difficulties.get(1)?.level).toBe('easy')
    expect(s.difficultyStats?.total).toBe(1)
    expect(s.rows).toEqual([{ id: 1, completed: false }])
    expect(s.error).toBeNull()
  })

  it('init capture une erreur', async () => {
    api.catalog.status.mockRejectedValueOnce(new Error('ipc down'))
    const { useStore } = await load()
    await useStore.getState().init()
    expect(useStore.getState().error).toContain('ipc down')
  })

  it('loadRows gère l’état de chargement et les erreurs', async () => {
    const { useStore } = await load()
    api.achievements.list.mockRejectedValueOnce(new Error('ko'))
    await useStore.getState().loadRows()
    expect(useStore.getState()).toMatchObject({ loading: false, error: 'Error: ko' })
  })

  it('loadDifficulties remplit la map ou signale l’erreur', async () => {
    const { useStore } = await load()
    await useStore.getState().loadDifficulties()
    expect(useStore.getState().difficulties.size).toBe(1)
    api.difficulty.all.mockRejectedValueOnce(new Error('ko'))
    await useStore.getState().loadDifficulties()
    expect(useStore.getState().error).toBe('Error: ko')
  })

  it('les rafraîchissements ciblés mettent à jour leur tranche', async () => {
    const { useStore } = await load()
    const s = useStore.getState()
    await s.refreshStatus()
    await s.refreshNewPatch()
    await s.refreshCollectionPending()
    await s.refreshTags()
    expect(useStore.getState()).toMatchObject({ newPatchPending: 4, tags: ['a'], collectionPending: { mount: 1 } })
    expect(useStore.getState().catalogStatus?.seeded).toBe(true)
  })
})

describe('useStore : filtres et sélection', () => {
  it('setFilter fusionne et recharge ; resetFilter restaure le défaut', async () => {
    const { useStore, DEFAULT_FILTER } = await load()
    useStore.getState().setFilter({ search: 'chocobo' })
    expect(useStore.getState().filter).toEqual({ ...DEFAULT_FILTER, search: 'chocobo' })
    expect(api.achievements.list).toHaveBeenLastCalledWith({ ...DEFAULT_FILTER, search: 'chocobo' })
    useStore.getState().resetFilter()
    expect(useStore.getState().filter).toEqual(DEFAULT_FILTER)
  })

  it('select met à jour la sélection', async () => {
    const { useStore } = await load()
    useStore.getState().select(42)
    expect(useStore.getState().selectedId).toBe(42)
  })
})

describe('useStore : actions', () => {
  it('toggleCompletion inverse puis rafraîchit lignes, statut, patch et récurrences', async () => {
    const { useStore } = await load()
    await useStore.getState().toggleCompletion({ id: 7, completed: false } as never)
    expect(api.achievements.setCompletion).toHaveBeenCalledWith(7, true)
    expect(api.achievements.list).toHaveBeenCalled()
    expect(api.catalog.status).toHaveBeenCalled()
    expect(api.achievements.latestPatch).toHaveBeenCalled()
    expect(api.recurring.list).toHaveBeenCalled()
  })

  it.each([
    ['setPriority', [1, 3], 'setPriority'],
    ['setFocus', [1, true], 'setFocus'],
    ['setNote', [1, 'note'], 'setNote'],
    ['setDeadline', [1, '2026-12-01'], 'setDeadline'],
    ['setTags', [1, ['x']], 'setTags']
  ] as const)('%s appelle l’IPC puis recharge les lignes', async (action, args, ipc) => {
    const { useStore } = await load()
    await (useStore.getState()[action] as (...a: unknown[]) => Promise<void>)(...args)
    expect(api.achievements[ipc]).toHaveBeenCalledWith(...args)
    expect(api.achievements.list).toHaveBeenCalled()
  })

  it('setTags rafraîchit aussi la liste des tags', async () => {
    const { useStore } = await load()
    await useStore.getState().setTags(1, ['b'])
    expect(api.meta.tags).toHaveBeenCalled()
  })

  it('les actions récurrentes rechargent la liste', async () => {
    const { useStore } = await load()
    const s = useStore.getState()
    await s.addRecurring({ name: 'Roulette', type: 'daily' })
    await s.deleteRecurring('r1')
    await s.setRecurringDone('r1', true)
    expect(api.recurring.add).toHaveBeenCalledWith({ name: 'Roulette', type: 'daily' })
    expect(api.recurring.delete).toHaveBeenCalledWith('r1')
    expect(api.recurring.setDone).toHaveBeenCalledWith('r1', true)
    expect(api.recurring.list).toHaveBeenCalledTimes(3)
    await s.loadRecurring()
    expect(useStore.getState().recurring).toEqual([{ id: 'r1' }])
  })
})
