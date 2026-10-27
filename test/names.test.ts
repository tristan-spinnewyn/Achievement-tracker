import { describe, expect, it } from 'vitest'
import { normalizeName, patchSortKey } from '../src/shared/names'
import * as repo from '../src/main/data/repo'
import * as collectionsCatalog from '../src/main/services/collectionsCatalog'

describe('normalizeName', () => {
  it('strips accents, unifies apostrophes and collapses whitespace', () => {
    expect(normalizeName('  Élan   d’Été ')).toBe("elan d'ete")
  })

  it('is the single implementation used by repo and the collections builder', () => {
    expect(repo.normalizeName).toBe(normalizeName)
    expect(collectionsCatalog.normalizeName).toBe(normalizeName)
  })
})

describe('patchSortKey', () => {
  it('orders patches numerically, null last', () => {
    expect(patchSortKey(null)).toBe(-1)
    expect(patchSortKey('7.5')).toBe(750)
    expect(patchSortKey('7.51')).toBe(751)
    expect(patchSortKey('2.0')).toBe(200)
    expect(patchSortKey('6.5a')).toBeGreaterThan(patchSortKey('6.5'))
  })

  it('treats a malformed minor as zero', () => {
    expect(patchSortKey('7.x')).toBe(700)
  })
})
