import { describe, it, expect, beforeAll } from 'vitest'
import type { AchievementRow } from '@shared/types'
import { parseAdvancedQuery, evaluateAdvancedQuery, initSearchIndex, updateSearchIndex, searchAchievements } from '../src/main/utils/search'
import { store } from '../src/main/data/store'

function row(partial: Partial<AchievementRow> = {}): AchievementRow {
  return {
    id: 1,
    name: '',
    description: '',
    points: 0,
    categoryId: 0,
    kindId: 0,
    iconPath: null,
    obtainable: true,
    patch: null,
    categoryName: '',
    kindName: '',
    completed: false,
    completedDate: null,
    source: null,
    priority: 0,
    inFocus: false,
    focusOrder: null,
    note: null,
    deadline: null,
    tags: [],
    ...partial
  }
}

describe('parseAdvancedQuery', () => {
  it('single term without operator', () => {
    const { tokens, operators } = parseAdvancedQuery('monture')
    expect(tokens).toEqual(['monture'])
    expect(operators).toEqual([])
  })

  it('extracts AND', () => {
    const { tokens, operators } = parseAdvancedQuery('monture and combat')
    expect(tokens).toEqual(['monture', 'combat'])
    expect(operators).toEqual(['AND'])
  })

  it('extracts OR and NOT', () => {
    expect(parseAdvancedQuery('a or b').operators).toEqual(['OR'])
    expect(parseAdvancedQuery('a not b').operators).toEqual(['NOT'])
  })

  it('chains several operators', () => {
    const { tokens, operators } = parseAdvancedQuery('a and b or c')
    expect(tokens).toEqual(['a', 'b', 'c'])
    expect(operators).toEqual(['AND', 'OR'])
  })
})

describe('evaluateAdvancedQuery — substring fallback (index not initialised)', () => {
  it('empty query → everything matches', () => {
    const fn = evaluateAdvancedQuery('')
    expect(fn(row({ name: 'peu importe' }))).toBe(true)
  })

  it('a simple term searches name/description/category/kind', () => {
    const fn = evaluateAdvancedQuery('dragon')
    expect(fn(row({ name: 'Chasseur de Dragon' }))).toBe(true)
    expect(fn(row({ description: 'un dragon rouge' }))).toBe(true)
    expect(fn(row({ name: 'Chat' }))).toBe(false)
  })
})

describe('evaluateAdvancedQuery — boolean logic (index initialised)', () => {
  // Multi-term boolean evaluation is only active once the index exists.
  // The store is empty here: the boolean branch uses a substring comparison
  // on the row, independent of the index content.
  beforeAll(() => {
    initSearchIndex()
  })

  it('empty query → everything matches', () => {
    expect(evaluateAdvancedQuery('')(row({ name: 'x' }))).toBe(true)
  })

  it('AND requires both terms', () => {
    const fn = evaluateAdvancedQuery('dragon and combat')
    expect(fn(row({ name: 'Dragon', categoryName: 'Combat' }))).toBe(true)
    expect(fn(row({ name: 'Dragon', categoryName: 'Exploration' }))).toBe(false)
  })

  it('OR accepts either one', () => {
    const fn = evaluateAdvancedQuery('dragon or chocobo')
    expect(fn(row({ name: 'Chocobo' }))).toBe(true)
    expect(fn(row({ name: 'Dragon' }))).toBe(true)
    expect(fn(row({ name: 'Moogle' }))).toBe(false)
  })

  it('NOT excludes the second term', () => {
    const fn = evaluateAdvancedQuery('dragon not combat')
    expect(fn(row({ name: 'Dragon', categoryName: 'Exploration' }))).toBe(true)
    expect(fn(row({ name: 'Dragon', categoryName: 'Combat' }))).toBe(false)
  })
})

describe('populated FlexSearch index', () => {
  beforeAll(() => {
    store.init()
    store.catalog = {
      generatedAt: null,
      gameVersion: null,
      kinds: [{ id: 1, name: 'Combat', order: 1 }],
      categories: [{ id: 1, kindId: 1, name: 'Donjons', order: 1 }],
      achievements: [
        { id: 1, name: 'Tueur de dragons', description: 'Vaincre', points: 10, categoryId: 1, kindId: 1, iconPath: null, obtainable: true, patch: '7.0' },
        { id: 2, name: 'Ami des chocobos', description: '', points: 5, categoryId: 9, kindId: 9, iconPath: null, obtainable: true, patch: '7.0' }
      ]
    }
    store.reindex()
    store.user.progress['1'] = { achievementId: 1, completed: true, completedDate: '2026-01-01', source: 'manual', updatedAt: '' }
    store.user.userMeta['1'] = { achievementId: 1, priority: 2, inFocus: true, focusOrder: 0, note: 'n', deadline: null }
    store.user.tagsByAchievement['1'] = ['t']
    updateSearchIndex()
  })

  it('a single term goes through the index (category field included)', () => {
    expect(searchAchievements('dragons').map((r) => r.id)).toEqual([1])
    expect(searchAchievements('donjons').map((r) => r.id)).toEqual([1])
  })

  it('denormalises progress and metadata into the rows', () => {
    const [r] = searchAchievements('dragons')
    expect(r).toMatchObject({ completed: true, completedDate: '2026-01-01', priority: 2, inFocus: true, note: 'n', tags: ['t'], categoryName: 'Donjons' })
    const [c] = searchAchievements('chocobos')
    expect(c).toMatchObject({ completed: false, categoryName: '', kindName: '', priority: 0, tags: [] })
  })

  it('multi-term query and empty query', () => {
    expect(searchAchievements('dragons or chocobos')).toHaveLength(2)
    expect(searchAchievements('')).toHaveLength(2)
  })
})
