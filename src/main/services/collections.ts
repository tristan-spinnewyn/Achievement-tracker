import { app } from 'electron'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import type { CollectionSyncResult, CollectionType, CollectionsSnapshot, Region } from '@shared/types'
import { store } from '../data/store'
import * as repo from '../data/repo'
import { buildCollections } from './collectionsCatalog'
import { fetchTextWithRetry } from '../utils/fetch'

// --------------------------------------------------------------- Seed snapshot

function snapshotPath(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'resources', 'collections-snapshot.json')
    : join(app.getAppPath(), 'resources', 'collections-snapshot.json')
}

export function loadCollectionsSnapshot(): boolean {
  const path = snapshotPath()
  if (!existsSync(path)) {
    console.error('[collections] snapshot introuvable :', path)
    return false
  }
  try {
    const snap = JSON.parse(readFileSync(path, 'utf8')) as CollectionsSnapshot
    store.setCollections({
      generatedAt: snap.generatedAt,
      gameVersion: snap.gameVersion,
      categories: snap.categories,
      items: snap.items
    })
    return true
  } catch (err) {
    console.error('[collections] failed to read snapshot:', err)
    return false
  }
}

/**
 * Aligns the local catalog with the bundled snapshot.
 * Re-seeds if the cache is empty OR the snapshot changed (new patch / new version),
 * without touching the user's ownership data (stored in userdata.json).
 */
export function seedCollectionsIfEmpty(): void {
  const path = snapshotPath()
  if (!existsSync(path)) {
    if (store.collections.items.length === 0) console.error('[collections] snapshot introuvable :', path)
    return
  }
  try {
    const snap = JSON.parse(readFileSync(path, 'utf8')) as CollectionsSnapshot
    const stored = store.collections.generatedAt
    const fresh = store.collections.items.length === 0 || !stored || (snap.generatedAt ?? '') > stored
    if (!fresh) return // cache already up to date (or a more recent runtime update)
    store.setCollections({
      generatedAt: snap.generatedAt,
      gameVersion: snap.gameVersion,
      categories: snap.categories,
      items: snap.items
    })
    console.log(`[collections] catalog updated (${snap.items.length} entries)`)
  } catch (err) {
    console.error('[collections] failed to read snapshot:', err)
  }
}

// --------------------------------------------------------------- Hot update

/** Rebuilds the whole collections catalog on the fly (without touching ownership). */
export async function refreshCollectionsFromApi(): Promise<ReturnType<typeof repo.getCollectionStatus>> {
  const built = await buildCollections()
  store.setCollections({
    generatedAt: new Date().toISOString(),
    gameVersion: built.gameVersion || store.catalog.gameVersion,
    categories: built.categories,
    items: built.items
  })
  return repo.getCollectionStatus()
}

// --------------------------------------------------------------- Lodestone scraping

const HOSTS: Record<Region, string> = { na: 'na', eu: 'eu', fr: 'fr', de: 'de', ja: 'jp' }
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'
const CONCURRENCY = 8
const FETCH_TIMEOUT_MS = 20000
const MAX_ITEMS = 1500

// Only collections listed on the Lodestone can be synced.
const LODESTONE_PATH: Partial<Record<CollectionType, string>> = {
  mount: 'mount',
  minion: 'minion',
  emote: 'emote',
  faceaccessory: 'faceaccessory'
}

function decodeEntities(s: string): string {
  return s.replace(/&#(\d+);|&#x([0-9a-f]+);|&(quot|apos|amp|lt|gt);/gi, (m, dec, hex, named) => {
    if (dec) return String.fromCharCode(Number(dec))
    if (hex) return String.fromCharCode(parseInt(hex, 16))
    switch ((named || '').toLowerCase()) {
      case 'quot': return '"'
      case 'apos': return "'"
      case 'amp': return '&'
      case 'lt': return '<'
      case 'gt': return '>'
      default: return m
    }
  })
}

async function fetchText(url: string): Promise<string> {
  try {
    const text = await fetchTextWithRetry(url, {
      headers: { 'User-Agent': UA, 'X-Requested-With': 'XMLHttpRequest' }
    }, 3, 1000, FETCH_TIMEOUT_MS)
    // Check for 404 manually
    if (text.includes('Character Not Found') || text.includes('Page Not Found')) {
      throw new Error('Personnage introuvable (404). Vérifie l’ID Lodestone.')
    }
    return text
  } catch (error) {
    if (error instanceof Error && error.message.includes('HTTP 404')) {
      throw new Error('Personnage introuvable (404). Vérifie l’ID Lodestone.')
    }
    throw new Error(`Lodestone a répondu avec une erreur : ${error instanceof Error ? error.message : String(error)}`)
  }
}

/** Runs `fn` over `items` with bounded concurrency. */
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let i = 0
  async function worker(): Promise<void> {
    while (i < items.length) {
      const idx = i++
      results[idx] = await fn(items[idx])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

export interface ScrapeOutcome {
  names: string[]
  fetched: number // tooltips actually downloaded (new)
  cached: number // resolved from the cache (already known)
}

/**
 * Fetches the owned names of a collection.
 * The tooltip hash is global and stable: once resolved it is cached and
 * never downloaded again (near-instant re-syncs).
 */
async function scrapeCollectionNames(
  type: CollectionType,
  charId: string,
  region: Region
): Promise<ScrapeOutcome> {
  const path = LODESTONE_PATH[type]
  if (!path) return { names: [], fetched: 0, cached: 0 }
  const host = HOSTS[region] ?? 'na'
  const base = `https://${host}.finalfantasyxiv.com/lodestone/character/${charId}`
  const html = await fetchText(`${base}/${path}/`)

  const re = new RegExp(`${path}/tooltip/([0-9a-f]+)`, 'g')
  const hashes = [...new Set([...html.matchAll(re)].map((m) => m[1]))].slice(0, MAX_ITEMS)

  const cache = store.user.collectionHashCache
  const names: string[] = []
  const unknown: string[] = []
  for (const h of hashes) {
    const cached = cache[`${type}:${h}`]
    if (cached != null) names.push(cached)
    else unknown.push(h)
  }

  let fetched = 0
  if (unknown.length > 0) {
    const resolved = await mapLimit(unknown, CONCURRENCY, async (h) => {
      try {
        const frag = await fetchText(`${base}/${path}/tooltip/${h}`)
        // The label differs per collection: `..._header__label` (mounts/minions)
        // or `..._header__name` (emotes).
        const m = frag.match(/__header__(?:label|name)">([^<]+)</)
        return m ? decodeEntities(m[1].trim()) : null
      } catch {
        return null
      }
    })
    unknown.forEach((h, idx) => {
      const name = resolved[idx]
      if (name) {
        cache[`${type}:${h}`] = name
        names.push(name)
        fetched++
      }
    })
    store.saveUser() // persist the cache
  }

  return { names, fetched, cached: names.length - fetched }
}

/** On-demand sync of a collection (mount or minion). */
export async function syncCollection(type: CollectionType): Promise<CollectionSyncResult> {
  const at = new Date().toISOString()
  const fail = (message: string): CollectionSyncResult => {
    repo.addSyncLog({ at, ok: false, newlyCompleted: 0, totalCompleted: 0, message: `[${type}] ${message}` })
    return { ok: false, type, matched: 0, unmatched: 0, newly: 0, message, at }
  }

  if (!LODESTONE_PATH[type]) return fail("Cette collection n'est pas synchronisable depuis le Lodestone.")

  const settings = repo.getSettings()
  const charId = settings.lodestoneCharacterId
    ? settings.lodestoneCharacterId.match(/\d+/)?.[0] ?? null
    : null
  if (!charId) return fail('Aucun ID de personnage Lodestone configuré (voir Paramètres).')

  try {
    const { names, fetched, cached } = await scrapeCollectionNames(type, charId, settings.region)
    if (names.length === 0) {
      return fail(
        'Liste vide. Rends tes montures/mascottes publiques sur le Lodestone (réglage distinct des hauts faits).'
      )
    }
    const { matched, unmatched, newly } = repo.applyLodestoneCollection(type, names)
    const cacheNote = cached > 0 ? ` · ${cached} en cache` : ''
    const message = `${matched} reconnu(s) · ${newly} nouveau(x)${unmatched ? ` · ${unmatched} non reconnu(s)` : ''} (${fetched} téléchargé(s)${cacheNote}).`
    repo.addSyncLog({ at, ok: true, newlyCompleted: newly, totalCompleted: matched, message: `[${type}] ${message}` })
    return { ok: true, type, matched, unmatched, newly, message, at }
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err))
  }
}
