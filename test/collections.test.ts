import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'
import type { CollectionsSnapshot, CatalogSnapshot } from '@shared/types'
import { collectionExternalUrl } from '../src/renderer/src/lib/external'

describe('External links (collectionExternalUrl)', () => {
  it('builds the direct FFXIV Collect link for beasts', () => {
    const url = collectionExternalUrl('beast', 1, 'Cu sith')
    expect(url).toBe('https://ffxivcollect.com/beasts/1')
  })

  it('builds the right links for the other collection types', () => {
    expect(collectionExternalUrl('mount', 10, 'Chocobo')).toBe('https://ffxivcollect.com/mounts/10')
    expect(collectionExternalUrl('spell', 1, 'Canon à eau')).toBe('https://ffxivcollect.com/spells/1')
    expect(collectionExternalUrl('tripletriad', 5, 'Dodo')).toBe('https://ffxiv.gamerescape.com/w/index.php?search=Dodo')
  })
})

describe('Collections snapshot (Trainer\'s bestiary)', () => {
  const snapshotPath = resolve(__dirname, '../resources/collections-snapshot.json')

  it('the snapshot file exists and is valid JSON', () => {
    expect(existsSync(snapshotPath)).toBe(true)
    const raw = readFileSync(snapshotPath, 'utf8')
    const snap = JSON.parse(raw) as CollectionsSnapshot
    expect(snap.items).toBeDefined()
    expect(snap.categories).toBeDefined()
  })

  it('contains exactly 50 capturable beasts', () => {
    const snap = JSON.parse(readFileSync(snapshotPath, 'utf8')) as CollectionsSnapshot
    const beasts = snap.items.filter((it) => it.type === 'beast')
    expect(beasts.length).toBe(50)

    // Check IDs 1 to 50
    const ids = beasts.map((b) => b.id).sort((a, b) => a - b)
    expect(ids[0]).toBe(1)
    expect(ids[ids.length - 1]).toBe(50)
  })

  it('every beast has a name, an icon and patch 7.56', () => {
    const snap = JSON.parse(readFileSync(snapshotPath, 'utf8')) as CollectionsSnapshot
    const beasts = snap.items.filter((it) => it.type === 'beast')

    for (const b of beasts) {
      expect(b.name.trim().length).toBeGreaterThan(0)
      expect(b.patch).toBe('7.56')
      expect(b.iconPath).toMatch(/^ui\/icon\/242000\/2420\d{2}_hr1\.tex$/)
      expect(b.sources.length).toBeGreaterThan(0)
      expect(b.categoryId).toBeGreaterThanOrEqual(1)
      expect(b.categoryId).toBeLessThanOrEqual(8)
    }
  })

  it('defines the 8 official beast families', () => {
    const snap = JSON.parse(readFileSync(snapshotPath, 'utf8')) as CollectionsSnapshot
    const beastCats = snap.categories.filter((c) => c.type === 'beast').sort((a, b) => a.order - b.order)

    expect(beastCats.length).toBe(8)
    expect(beastCats.map((c) => c.name)).toEqual([
      'Thériens',
      'Insectoïdes',
      'Ptériens',
      'Floréens',
      'Hydrides',
      'Cuirassiens',
      'Animides',
      'Nécroïdes'
    ])
  })

  it('contains the capture-specific information (Cu sith, Écureuil)', () => {
    const snap = JSON.parse(readFileSync(snapshotPath, 'utf8')) as CollectionsSnapshot
    const beasts = snap.items.filter((it) => it.type === 'beast')

    const cuSith = beasts.find((b) => b.id === 1)
    expect(cuSith).toBeDefined()
    expect(cuSith?.name).toBe('Cu sith')
    expect(cuSith?.sources.some((s) => s.includes('Strangers in the Wood'))).toBe(true)

    const ecureuil = beasts.find((b) => b.id === 2)
    expect(ecureuil).toBeDefined()
    expect(ecureuil?.name).toBe('Écureuil')
    expect(ecureuil?.sources.some((s) => s.includes('Central Shroud (23, 16)'))).toBe(true)
  })
})

describe('Catalog snapshot (trainer achievements)', () => {
  const catalogPath = resolve(__dirname, '../resources/catalog-snapshot.json')

  it('contains the bestiary capture achievements (Adepte des bêtes I to V)', () => {
    const snap = JSON.parse(readFileSync(catalogPath, 'utf8')) as CatalogSnapshot
    const achs = snap.achievements

    const adepte1 = achs.find((a) => a.id === 4028)
    expect(adepte1).toBeDefined()
    expect(adepte1?.name).toContain('Adepte des bêtes I')
    expect(adepte1?.patch).toBe('7.56')

    const adepte5 = achs.find((a) => a.id === 4032)
    expect(adepte5).toBeDefined()
    expect(adepte5?.name).toContain('Adepte des bêtes V')
    expect(adepte5?.description).toContain('50')
    expect(adepte5?.patch).toBe('7.56')
  })
})