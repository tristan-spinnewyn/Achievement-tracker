import { describe, it, expect, beforeAll } from 'vitest'
import type { Achievement } from '@shared/types'
import {
  calculateDifficulty,
  calculateAllDifficulties,
  getDifficultyStats,
  filterByDifficulty,
  sortByDifficulty
} from '../src/main/services/difficulty'
import { store } from '../src/main/data/store'

let nextId = 1
function ach(partial: Partial<Achievement> = {}): Achievement {
  return {
    id: nextId++,
    name: 'Haut fait',
    description: '',
    points: 10,
    categoryId: 0,
    kindId: 0,
    iconPath: null,
    obtainable: true,
    patch: '2.0',
    ...partial
  }
}

describe('points component', () => {
  it('is monotonically increasing', () => {
    const s5 = calculateDifficulty(ach({ points: 5 })).score
    const s20 = calculateDifficulty(ach({ points: 20 })).score
    const s100 = calculateDifficulty(ach({ points: 100 })).score
    expect(s5).toBeLessThan(s20)
    expect(s20).toBeLessThan(s100)
  })

  it('saturates (does not grow linearly)', () => {
    const base = calculateDifficulty(ach({ points: 0 })).score
    const s100 = calculateDifficulty(ach({ points: 100 })).score
    const s200 = calculateDifficulty(ach({ points: 200 })).score
    // The 100→200 gain is much smaller than the points cap (35).
    expect(s200 - s100).toBeLessThan(35)
    expect(s100).toBeGreaterThan(base)
  })
})

describe('content tiers', () => {
  const plain = calculateDifficulty(ach({ name: 'Tombeur de Titan' })).score
  const unreal = calculateDifficulty(ach({ name: 'Tombeur de Titan (irréel)' })).score
  const extreme = calculateDifficulty(ach({ name: 'Tombeur de Titan (extrême)' })).score
  const savage = calculateDifficulty(ach({ name: 'Tombeur de Titan (sadique)' })).score
  const ultimate = calculateDifficulty(ach({ name: 'La Légende d’Alexander (ultime)' })).score

  it('orders unreal < extreme < savage < ultimate', () => {
    expect(plain).toBeLessThan(unreal)
    expect(unreal).toBeLessThan(extreme)
    expect(extreme).toBeLessThan(savage)
    expect(savage).toBeLessThan(ultimate)
  })

  it('an Ultimate is classified as "extreme"', () => {
    const d = calculateDifficulty(ach({ name: 'La Légende d’Alexander (ultime)', points: 50, kindId: 1, categoryId: 4 }))
    expect(d.level).toBe('extreme')
  })

  it('also detects English (savage/ultimate)', () => {
    const fr = calculateDifficulty(ach({ name: 'Boss (sadique)' })).score
    const en = calculateDifficulty(ach({ name: 'Boss (savage)' })).score
    expect(en).toBe(fr)
  })
})

describe('grind', () => {
  it('a large volume increases the score', () => {
    const small = calculateDifficulty(ach({ description: 'Vaincre 100 ennemis.' })).score
    const big = calculateDifficulty(ach({ description: 'Vaincre 10000 ennemis.' })).score
    expect(big).toBeGreaterThan(small)
  })

  it('handles thousands with a space (10 000)', () => {
    const big = calculateDifficulty(ach({ description: 'Vaincre 10 000 ennemis.' })).score
    const small = calculateDifficulty(ach({ description: 'Vaincre 100 ennemis.' })).score
    expect(big).toBeGreaterThan(small)
  })

  it('no bonus without a grind verb', () => {
    const withVerb = calculateDifficulty(ach({ description: 'Vaincre 5000 ennemis.' })).score
    const noVerb = calculateDifficulty(ach({ description: 'Objet numéro 5000 du catalogue.' })).score
    expect(withVerb).toBeGreaterThan(noVerb)
  })
})

describe('contextual bonuses', () => {
  it('seasonal increases the score', () => {
    const normal = calculateDifficulty(ach()).score
    const seasonal = calculateDifficulty(ach({ isSeasonal: true })).score
    expect(seasonal).toBeGreaterThan(normal)
  })

  it('a recent patch is slightly harder (recency bonus)', () => {
    const old = calculateDifficulty(ach({ patch: '2.0' })).score
    const recent = calculateDifficulty(ach({ patch: '7.0' })).score
    expect(recent).toBeGreaterThan(old)
  })

  it('kind/category context takes the max, without double-counting', () => {
    // kindId 1 (30) and categoryId 4 (55) → context based on max(30,55), not the sum.
    const both = calculateDifficulty(ach({ kindId: 1, categoryId: 4 })).score
    const catOnly = calculateDifficulty(ach({ kindId: 0, categoryId: 4 })).score
    expect(both).toBe(catOnly)
  })
})

describe('classification', () => {
  it('a trivial achievement is easy', () => {
    const d = calculateDifficulty(ach({ name: 'Niveau 10', points: 5, kindId: 8, categoryId: 35, patch: '2.0' }))
    expect(['very_easy', 'easy']).toContain(d.level)
  })

  it('returns a colour, stars and a level name', () => {
    const d = calculateDifficulty(ach())
    expect(d.color).toMatch(/^#/)
    expect(d.stars.length).toBeGreaterThan(0)
    expect(d.levelName.length).toBeGreaterThan(0)
  })
})

describe('collection helpers (map)', () => {
  const list = [
    ach({ name: 'Facile', points: 5, patch: '2.0' }),
    ach({ name: 'Dur (ultime)', points: 50, kindId: 1, categoryId: 4, patch: '7.0' }),
    ach({ name: 'Moyen (extrême)', points: 10, kindId: 1, categoryId: 3, patch: '5.0' })
  ]

  it('calculateAllDifficulties indexes by id', () => {
    const map = calculateAllDifficulties(list)
    expect(map.size).toBe(list.length)
    for (const a of list) expect(map.has(a.id)).toBe(true)
  })

  it('sortByDifficulty sorts ascending/descending', () => {
    const map = calculateAllDifficulties(list)
    const asc = sortByDifficulty(map, 'asc')
    const desc = sortByDifficulty(map, 'desc')
    expect(asc[0]).toBe(list[0].id) // "Facile" first
    expect(desc[0]).toBe(asc[asc.length - 1])
  })

  it('filterByDifficulty filters by level', () => {
    const map = calculateAllDifficulties(list)
    const ultimateId = list[1].id
    const level = map.get(ultimateId)!.level
    expect(filterByDifficulty(map, level)).toContain(ultimateId)
    expect(filterByDifficulty(map, null).length).toBe(list.length)
  })
})

describe('getDifficultyStats (depends on the global store)', () => {
  const list = [
    ach({ name: 'A facile', points: 5, patch: '2.0' }),
    ach({ name: 'B ultime (ultime)', points: 50, kindId: 1, categoryId: 4, patch: '7.0' })
  ]

  beforeAll(() => {
    store.catalog.achievements = list
  })

  it('aggregates total, average and extremes', () => {
    const map = calculateAllDifficulties(list)
    const stats = getDifficultyStats(map)
    expect(stats.total).toBe(2)
    expect(stats.averageScore).toBeGreaterThan(0)
    expect(stats.hardest?.name).toContain('ultime')
    expect(stats.easiest?.name).toContain('facile')
  })
})
