import { describe, it, expect, beforeAll } from 'vitest'
import type { AchievementRow } from '@shared/types'
import { parseAdvancedQuery, evaluateAdvancedQuery, initSearchIndex } from '../src/main/utils/search'

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
  it('un seul terme sans opérateur', () => {
    const { tokens, operators } = parseAdvancedQuery('monture')
    expect(tokens).toEqual(['monture'])
    expect(operators).toEqual([])
  })

  it('extrait AND', () => {
    const { tokens, operators } = parseAdvancedQuery('monture and combat')
    expect(tokens).toEqual(['monture', 'combat'])
    expect(operators).toEqual(['AND'])
  })

  it('extrait OR et NOT', () => {
    expect(parseAdvancedQuery('a or b').operators).toEqual(['OR'])
    expect(parseAdvancedQuery('a not b').operators).toEqual(['NOT'])
  })

  it('chaîne plusieurs opérateurs', () => {
    const { tokens, operators } = parseAdvancedQuery('a and b or c')
    expect(tokens).toEqual(['a', 'b', 'c'])
    expect(operators).toEqual(['AND', 'OR'])
  })
})

describe('evaluateAdvancedQuery — repli sous-chaîne (index non initialisé)', () => {
  it('requête vide → tout correspond', () => {
    const fn = evaluateAdvancedQuery('')
    expect(fn(row({ name: 'peu importe' }))).toBe(true)
  })

  it('terme simple cherche dans nom/description/catégorie/type', () => {
    const fn = evaluateAdvancedQuery('dragon')
    expect(fn(row({ name: 'Chasseur de Dragon' }))).toBe(true)
    expect(fn(row({ description: 'un dragon rouge' }))).toBe(true)
    expect(fn(row({ name: 'Chat' }))).toBe(false)
  })
})

describe('evaluateAdvancedQuery — logique booléenne (index initialisé)', () => {
  // L’évaluation booléenne multi-termes n’est active que lorsque l’index existe.
  // Le store est vide ici : la branche booléenne utilise une comparaison sous-chaîne
  // sur la ligne, indépendante du contenu de l’index.
  beforeAll(() => {
    initSearchIndex()
  })

  it('requête vide → tout correspond', () => {
    expect(evaluateAdvancedQuery('')(row({ name: 'x' }))).toBe(true)
  })

  it('AND exige les deux termes', () => {
    const fn = evaluateAdvancedQuery('dragon and combat')
    expect(fn(row({ name: 'Dragon', categoryName: 'Combat' }))).toBe(true)
    expect(fn(row({ name: 'Dragon', categoryName: 'Exploration' }))).toBe(false)
  })

  it('OR accepte l’un ou l’autre', () => {
    const fn = evaluateAdvancedQuery('dragon or chocobo')
    expect(fn(row({ name: 'Chocobo' }))).toBe(true)
    expect(fn(row({ name: 'Dragon' }))).toBe(true)
    expect(fn(row({ name: 'Moogle' }))).toBe(false)
  })

  it('NOT exclut le second terme', () => {
    const fn = evaluateAdvancedQuery('dragon not combat')
    expect(fn(row({ name: 'Dragon', categoryName: 'Exploration' }))).toBe(true)
    expect(fn(row({ name: 'Dragon', categoryName: 'Combat' }))).toBe(false)
  })
})
