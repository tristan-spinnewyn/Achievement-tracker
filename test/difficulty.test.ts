import { describe, it, expect, beforeAll } from 'vitest'
import type { Achievement } from '@shared/types'
import {
  calculateDifficulty,
  calculateAllDifficulties,
  getDifficultyStats,
  filterByDifficulty,
  sortByDifficulty
} from '../src/main/utils/difficulty'
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

describe('composante points', () => {
  it('est monotone croissante', () => {
    const s5 = calculateDifficulty(ach({ points: 5 })).score
    const s20 = calculateDifficulty(ach({ points: 20 })).score
    const s100 = calculateDifficulty(ach({ points: 100 })).score
    expect(s5).toBeLessThan(s20)
    expect(s20).toBeLessThan(s100)
  })

  it('sature (ne croît pas linéairement)', () => {
    const base = calculateDifficulty(ach({ points: 0 })).score
    const s100 = calculateDifficulty(ach({ points: 100 })).score
    const s200 = calculateDifficulty(ach({ points: 200 })).score
    // Le gain 100→200 est bien plus petit que le plafond des points (35).
    expect(s200 - s100).toBeLessThan(35)
    expect(s100).toBeGreaterThan(base)
  })
})

describe('paliers de contenu', () => {
  const plain = calculateDifficulty(ach({ name: 'Tombeur de Titan' })).score
  const unreal = calculateDifficulty(ach({ name: 'Tombeur de Titan (irréel)' })).score
  const extreme = calculateDifficulty(ach({ name: 'Tombeur de Titan (extrême)' })).score
  const savage = calculateDifficulty(ach({ name: 'Tombeur de Titan (sadique)' })).score
  const ultimate = calculateDifficulty(ach({ name: 'La Légende d’Alexander (ultime)' })).score

  it('ordonne irréel < extrême < sadique < ultime', () => {
    expect(plain).toBeLessThan(unreal)
    expect(unreal).toBeLessThan(extreme)
    expect(extreme).toBeLessThan(savage)
    expect(savage).toBeLessThan(ultimate)
  })

  it('un Ultime est classé « extrême »', () => {
    const d = calculateDifficulty(ach({ name: 'La Légende d’Alexander (ultime)', points: 50, kindId: 1, categoryId: 4 }))
    expect(d.level).toBe('extreme')
  })

  it('détecte aussi l’anglais (savage/ultimate)', () => {
    const fr = calculateDifficulty(ach({ name: 'Boss (sadique)' })).score
    const en = calculateDifficulty(ach({ name: 'Boss (savage)' })).score
    expect(en).toBe(fr)
  })
})

describe('grind', () => {
  it('un gros volume augmente le score', () => {
    const small = calculateDifficulty(ach({ description: 'Vaincre 100 ennemis.' })).score
    const big = calculateDifficulty(ach({ description: 'Vaincre 10000 ennemis.' })).score
    expect(big).toBeGreaterThan(small)
  })

  it('gère les milliers avec espace (10 000)', () => {
    const big = calculateDifficulty(ach({ description: 'Vaincre 10 000 ennemis.' })).score
    const small = calculateDifficulty(ach({ description: 'Vaincre 100 ennemis.' })).score
    expect(big).toBeGreaterThan(small)
  })

  it('aucun bonus sans verbe de grind', () => {
    const withVerb = calculateDifficulty(ach({ description: 'Vaincre 5000 ennemis.' })).score
    const noVerb = calculateDifficulty(ach({ description: 'Objet numéro 5000 du catalogue.' })).score
    expect(withVerb).toBeGreaterThan(noVerb)
  })
})

describe('bonus contextuels', () => {
  it('le saisonnier augmente le score', () => {
    const normal = calculateDifficulty(ach()).score
    const seasonal = calculateDifficulty(ach({ isSeasonal: true })).score
    expect(seasonal).toBeGreaterThan(normal)
  })

  it('un patch récent est légèrement plus dur (bonus de récence)', () => {
    const old = calculateDifficulty(ach({ patch: '2.0' })).score
    const recent = calculateDifficulty(ach({ patch: '7.0' })).score
    expect(recent).toBeGreaterThan(old)
  })

  it('le contexte type/catégorie prend le max, sans double comptage', () => {
    // kindId 1 (30) et categoryId 4 (55) → contexte basé sur max(30,55), pas la somme.
    const both = calculateDifficulty(ach({ kindId: 1, categoryId: 4 })).score
    const catOnly = calculateDifficulty(ach({ kindId: 0, categoryId: 4 })).score
    expect(both).toBe(catOnly)
  })
})

describe('classification', () => {
  it('un haut fait trivial est facile', () => {
    const d = calculateDifficulty(ach({ name: 'Niveau 10', points: 5, kindId: 8, categoryId: 35, patch: '2.0' }))
    expect(['very_easy', 'easy']).toContain(d.level)
  })

  it('renvoie une couleur, des étoiles et un nom de niveau', () => {
    const d = calculateDifficulty(ach())
    expect(d.color).toMatch(/^#/)
    expect(d.stars.length).toBeGreaterThan(0)
    expect(d.levelName.length).toBeGreaterThan(0)
  })
})

describe('helpers de collection (map)', () => {
  const list = [
    ach({ name: 'Facile', points: 5, patch: '2.0' }),
    ach({ name: 'Dur (ultime)', points: 50, kindId: 1, categoryId: 4, patch: '7.0' }),
    ach({ name: 'Moyen (extrême)', points: 10, kindId: 1, categoryId: 3, patch: '5.0' })
  ]

  it('calculateAllDifficulties indexe par id', () => {
    const map = calculateAllDifficulties(list)
    expect(map.size).toBe(list.length)
    for (const a of list) expect(map.has(a.id)).toBe(true)
  })

  it('sortByDifficulty trie ascendant/descendant', () => {
    const map = calculateAllDifficulties(list)
    const asc = sortByDifficulty(map, 'asc')
    const desc = sortByDifficulty(map, 'desc')
    expect(asc[0]).toBe(list[0].id) // « Facile » en premier
    expect(desc[0]).toBe(asc[asc.length - 1])
  })

  it('filterByDifficulty filtre par niveau', () => {
    const map = calculateAllDifficulties(list)
    const ultimateId = list[1].id
    const level = map.get(ultimateId)!.level
    expect(filterByDifficulty(map, level)).toContain(ultimateId)
    expect(filterByDifficulty(map, null).length).toBe(list.length)
  })
})

describe('getDifficultyStats (dépend du store global)', () => {
  const list = [
    ach({ name: 'A facile', points: 5, patch: '2.0' }),
    ach({ name: 'B ultime (ultime)', points: 50, kindId: 1, categoryId: 4, patch: '7.0' })
  ]

  beforeAll(() => {
    store.catalog.achievements = list
  })

  it('agrège total, moyenne et extrêmes', () => {
    const map = calculateAllDifficulties(list)
    const stats = getDifficultyStats(map)
    expect(stats.total).toBe(2)
    expect(stats.averageScore).toBeGreaterThan(0)
    expect(stats.hardest?.name).toContain('ultime')
    expect(stats.easiest?.name).toContain('facile')
  })
})
