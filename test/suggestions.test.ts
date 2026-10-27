import { describe, it, expect, beforeEach } from 'vitest'
import type { Achievement, Progress } from '@shared/types'
import { store } from '../src/main/data/store'
import { getSuggestions } from '../src/main/services/suggestions'

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

const done = (id: number): Progress => ({
  achievementId: id,
  completed: true,
  completedDate: null,
  source: 'manual',
  updatedAt: ''
})

beforeEach(() => {
  store.init()
  store.replaceUser({ settings: { ...store.user.settings, autoBackupDocuments: false } })
  store.catalog = {
    generatedAt: null,
    gameVersion: null,
    kinds: [{ id: 1, name: 'Combat', order: 1 }],
    categories: [
      { id: 1, kindId: 1, name: 'Donjons', order: 1 },
      { id: 2, kindId: 1, name: 'Raids', order: 2 }
    ],
    achievements: [
      ach(1, { points: 5 }),
      ach(2, { points: 5 }),
      ach(3, { points: 5 }),
      ach(4, { points: 5 }),
      ach(5, { points: 40, categoryId: 2 }),
      ach(6, { obtainable: false, categoryId: 3 }),
      ach(7, { kindId: 13, categoryId: 3 }) // héritage
    ]
  }
  store.reindex()
})

describe('getSuggestions', () => {
  it('exclut les hauts faits obtenus, non obtenables et hérités', () => {
    store.user.progress['1'] = done(1)
    const ids = getSuggestions({ priority: 1, points: 1, categoryProximity: 1 }).map((s) => s.achievement.id)
    expect(ids).not.toContain(1)
    expect(ids).not.toContain(6)
    expect(ids).not.toContain(7)
    expect(ids).toContain(5)
  })

  it('classe par score décroissant et explique les raisons', () => {
    for (const id of ['1', '2', '3']) store.user.progress[id] = done(Number(id))
    store.user.userMeta['4'] = { achievementId: 4, priority: 3, inFocus: false, focusOrder: null, note: null, deadline: null }

    const res = getSuggestions({ priority: 3, points: 1, categoryProximity: 2 })
    expect(res[0].achievement.id).toBe(4)
    expect(res[0].reasons).toEqual(['Priorité haute', 'Catégorie à 75%'])
    const big = res.find((s) => s.achievement.id === 5)!
    expect(big.reasons).toContain('40 points')
    for (let i = 1; i < res.length; i++) expect(res[i - 1].score).toBeGreaterThanOrEqual(res[i].score)
  })

  it('ignore les scores nuls et respecte la limite', () => {
    expect(getSuggestions({ priority: 0, points: 0, categoryProximity: 0 })).toEqual([])
    expect(getSuggestions({ priority: 0, points: 1, categoryProximity: 0 }, 2)).toHaveLength(2)
  })

  it('utilise les poids des paramètres utilisateur par défaut', () => {
    store.user.settings.suggestionWeights = { priority: 0, points: 0, categoryProximity: 0 }
    expect(getSuggestions()).toEqual([])
    store.user.settings.suggestionWeights = { priority: 0, points: 1, categoryProximity: 0 }
    expect(getSuggestions().length).toBeGreaterThan(0)
  })
})
