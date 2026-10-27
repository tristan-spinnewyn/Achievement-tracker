import type {
  CollectionCategory,
  CollectionFilter,
  CollectionItem,
  CollectionItemRow,
  CollectionProgress,
  CollectionType
} from '@shared/types'
import { normalizeName, patchSortKey } from '@shared/names'
import { store, collKey } from '../store'

// ---------------------------------------------------------------- Collections

const ALL_COLLECTION_TYPES: CollectionType[] = [
  'mount',
  'minion',
  'orchestrion',
  'emote',
  'fashion',
  'hairstyle',
  'barding',
  'title',
  'faceaccessory',
  'spell',
  'tripletriad',
  'beast'
]

function emptyTypeRecord(): Record<CollectionType, number> {
  return Object.fromEntries(ALL_COLLECTION_TYPES.map((t) => [t, 0])) as Record<CollectionType, number>
}

export function getCollectionStatus(): {
  seeded: boolean
  counts: Record<CollectionType, number>
  generatedAt: string | null
  gameVersion: string | null
} {
  const counts = emptyTypeRecord()
  for (const it of store.collections.items) counts[it.type]++
  return {
    seeded: store.collections.items.length > 0,
    counts,
    generatedAt: store.collections.generatedAt,
    gameVersion: store.collections.gameVersion
  }
}

/** Most recent patch present for a given collection. */
function getCollectionLatestPatch(type: CollectionType): string | null {
  let best: string | null = null
  let bestKey = -1
  for (const it of store.collections.items) {
    if (it.type !== type || !it.patch) continue
    const k = patchSortKey(it.patch)
    if (k > bestKey) {
      bestKey = k
      best = it.patch
    }
  }
  return best
}

/** Number of items from the latest patch not yet obtained, per type (sidebar badges). */
export function getCollectionPendingByType(): Record<CollectionType, number> {
  const result = emptyTypeRecord()
  for (const type of ALL_COLLECTION_TYPES) {
    const latest = getCollectionLatestPatch(type)
    if (!latest) continue
    let pending = 0
    for (const it of store.collections.items) {
      if (it.type !== type || it.patch !== latest) continue
      if (!store.user.collections[collKey(type, it.id)]?.owned) pending++
    }
    result[type] = pending
  }
  return result
}

export function getCollectionCategories(type: CollectionType): CollectionCategory[] {
  return store.collections.categories
    .filter((c) => c.type === type)
    .sort((a, b) => a.order - b.order)
}

function buildCollectionRow(it: CollectionItem): CollectionItemRow {
  const own = store.user.collections[collKey(it.type, it.id)]
  const cat =
    it.categoryId != null
      ? store.collections.categories.find((c) => c.type === it.type && c.id === it.categoryId)
      : null
  return {
    ...it,
    categoryName: cat?.name ?? '',
    owned: own?.owned ?? false,
    ownedDate: own?.ownedDate ?? null,
    source: own?.source ?? null
  }
}

export function listCollection(filter: CollectionFilter): CollectionItemRow[] {
  const q = filter.search?.trim().toLowerCase()
  const rows: CollectionItemRow[] = []
  for (const it of store.collections.items) {
    if (it.type !== filter.type) continue
    if (filter.categoryId != null && it.categoryId !== filter.categoryId) continue
    if (filter.patch != null && it.patch !== filter.patch) continue
    const row = buildCollectionRow(it)
    if (filter.status === 'owned' && !row.owned) continue
    if (filter.status === 'missing' && row.owned) continue
    if (q && !row.name.toLowerCase().includes(q) && !row.description.toLowerCase().includes(q))
      continue
    rows.push(row)
  }
  // Sort by patch from most recent to oldest, then internal order / name.
  rows.sort(
    (a, b) =>
      patchSortKey(b.patch) - patchSortKey(a.patch) ||
      a.order - b.order ||
      a.name.localeCompare(b.name, 'fr')
  )
  return rows
}

/** Progress (owned/total) of each collection, for the dashboard. */
export function getAllCollectionsProgress(): { type: CollectionType; owned: number; total: number }[] {
  const acc = new Map<CollectionType, { owned: number; total: number }>()
  for (const t of ALL_COLLECTION_TYPES) acc.set(t, { owned: 0, total: 0 })
  for (const it of store.collections.items) {
    const a = acc.get(it.type)!
    a.total++
    if (store.user.collections[collKey(it.type, it.id)]?.owned) a.owned++
  }
  return ALL_COLLECTION_TYPES.map((type) => ({ type, ...acc.get(type)! }))
}

/** Patches present for a given collection, from most recent to oldest. */
export function getCollectionPatches(type: CollectionType): string[] {
  const set = new Set<string>()
  for (const it of store.collections.items) if (it.type === type && it.patch) set.add(it.patch)
  return [...set].sort((a, b) => patchSortKey(b) - patchSortKey(a))
}

export function getCollectionProgress(type: CollectionType): CollectionProgress {
  let total = 0
  let owned = 0
  for (const it of store.collections.items) {
    if (it.type !== type) continue
    total++
    if (store.user.collections[collKey(type, it.id)]?.owned) owned++
  }
  return { type, total, owned }
}

export function setCollectionOwned(type: CollectionType, id: number, owned: boolean): void {
  const key = collKey(type, id)
  if (owned) {
    const ex = store.user.collections[key]
    store.user.collections[key] = {
      owned: true,
      ownedDate: ex?.ownedDate ?? new Date().toISOString().slice(0, 10),
      source: 'manual',
      updatedAt: new Date().toISOString()
    }
  } else {
    delete store.user.collections[key]
  }
  store.saveUser()
}

/**
 * Applies a list of names scraped from the Lodestone to a collection.
 * Never removes anything (the Lodestone only lists what is owned).
 */
export function applyLodestoneCollection(
  type: CollectionType,
  names: string[]
): { matched: number; unmatched: number; newly: number } {
  // Normalised alias -> id index, built on the fly.
  const aliasToId = new Map<string, number>()
  for (const it of store.collections.items) {
    if (it.type !== type) continue
    for (const a of it.aliases) if (!aliasToId.has(a)) aliasToId.set(a, it.id)
  }
  const now = new Date().toISOString()
  let matched = 0
  let unmatched = 0
  let newly = 0
  for (const raw of names) {
    const id = aliasToId.get(normalizeName(raw))
    if (id == null) {
      unmatched++
      continue
    }
    matched++
    const key = collKey(type, id)
    const ex = store.user.collections[key]
    if (!ex?.owned) newly++
    store.user.collections[key] = {
      owned: true,
      ownedDate: ex?.ownedDate ?? now.slice(0, 10),
      source: 'lodestone',
      updatedAt: now
    }
  }
  store.saveUser()
  return { matched, unmatched, newly }
}
