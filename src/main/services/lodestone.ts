import type { Region, SyncResult } from '@shared/types'
import * as repo from '../data/repo'
import { fetchTextWithRetry } from '../utils/fetch'

// The Lodestone is identical whatever the regional subdomain; we only map it for consistency.
const HOSTS: Record<Region, string> = { na: 'na', eu: 'eu', fr: 'fr', de: 'de', ja: 'jp' }
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'
const POLITE_DELAY_MS = 350
const MAX_PAGES = 120

export interface ScrapedAchievement {
  id: number
  date: string | null
}

const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

/** Accepts a numeric ID or a full Lodestone URL, returns the ID. */
export function extractCharacterId(input: string): string | null {
  const s = input.trim()
  const urlMatch = s.match(/character\/(\d+)/)
  if (urlMatch) return urlMatch[1]
  if (/^\d+$/.test(s)) return s
  return null
}

/**
 * Parses a Lodestone achievements page.
 * Selectors are centralised here — adjust them if the Lodestone HTML changes.
 *   - each entry starts with `<li class="entry">`
 *   - the ID is in `.../achievement/detail/{ID}/`
 *   - the completion date is the Unix timestamp in `ldst_strftime(<ts>, ...)`
 *   - the page count is in "Page X of Y"
 */
function parsePage(html: string): { items: ScrapedAchievement[]; totalPages: number } {
  const items: ScrapedAchievement[] = []
  const chunks = html.split('<li class="entry">')
  for (const chunk of chunks.slice(1)) {
    const idm = chunk.match(/achievement\/detail\/(\d+)/)
    if (!idm) continue
    const id = Number(idm[1])
    const tsm = chunk.match(/ldst_strftime\((\d+),/)
    const date = tsm ? new Date(Number(tsm[1]) * 1000).toISOString().slice(0, 10) : null
    items.push({ id, date })
  }
  const pm = html.match(/Page\s+\d+\s+of\s+(\d+)/i)
  const totalPages = pm ? Number(pm[1]) : 1
  return { items, totalPages }
}

/** Base URL of a character's Lodestone pages for a region. */
export function lodestoneCharacterUrl(region: Region, charId: string): string {
  return `https://${HOSTS[region] ?? 'na'}.finalfantasyxiv.com/lodestone/character/${charId}`
}

/**
 * Fetches a Lodestone page as text with a browser user agent, turning
 * "not found" pages and network failures into user-facing errors.
 */
export async function fetchLodestoneText(
  url: string,
  opts: { headers?: Record<string, string>; retries?: number; timeout?: number } = {}
): Promise<string> {
  try {
    const text = await fetchTextWithRetry(
      url,
      { headers: { 'User-Agent': UA, ...opts.headers } },
      opts.retries,
      undefined,
      opts.timeout
    )
    // Check for 404 manually since fetchTextWithRetry does not throw on 404
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

export async function scrapeAchievements(
  charId: string,
  region: Region
): Promise<{ items: ScrapedAchievement[]; pages: number }> {
  const base = lodestoneCharacterUrl(region, charId)
  const fetchPage = (page: number): Promise<string> => fetchLodestoneText(`${base}/achievement/?page=${page}`)
  const first = await fetchPage(1)
  const { items, totalPages } = parsePage(first)
  const all = [...items]
  const pages = Math.min(totalPages, MAX_PAGES)
  for (let p = 2; p <= pages; p++) {
    await delay(POLITE_DELAY_MS)
    const html = await fetchPage(p)
    all.push(...parsePage(html).items)
  }
  return { items: all, pages }
}

/** On-demand sync: scrape, apply to the store, log, update lastSyncAt. */
export async function syncLodestone(): Promise<SyncResult> {
  const at = new Date().toISOString()
  const settings = repo.getSettings()
  const charId = settings.lodestoneCharacterId
    ? extractCharacterId(settings.lodestoneCharacterId)
    : null

  if (!charId) {
    const message = 'Aucun ID de personnage Lodestone configuré (voir Paramètres).'
    repo.addSyncLog({ at, ok: false, newlyCompleted: 0, totalCompleted: repo.countCompleted(), message })
    return { ok: false, newlyCompleted: 0, totalCompleted: repo.countCompleted(), message, at }
  }

  // Always query the Lodestone: there is no way to know whether there are new
  // achievements without reading it. `newly` tells what actually changed.
  try {
    const { items, pages } = await scrapeAchievements(charId, settings.region)
    if (items.length === 0) {
      const message =
        'Aucun haut fait public trouvé. As-tu rendu tes hauts faits publics sur le Lodestone ?'
      repo.addSyncLog({ at, ok: false, newlyCompleted: 0, totalCompleted: repo.countCompleted(), message })
      return { ok: false, newlyCompleted: 0, totalCompleted: repo.countCompleted(), message, at }
    }
    const { newly, total } = repo.applyLodestoneCompletions(items)
    repo.updateSettings({ lastSyncAt: at })
    const message = `${items.length} hauts faits lus (${pages} page(s)) · ${newly} nouveau(x).`
    repo.addSyncLog({ at, ok: true, newlyCompleted: newly, totalCompleted: total, message })
    return { ok: true, newlyCompleted: newly, totalCompleted: total, message, at }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    repo.addSyncLog({ at, ok: false, newlyCompleted: 0, totalCompleted: repo.countCompleted(), message })
    return { ok: false, newlyCompleted: 0, totalCompleted: repo.countCompleted(), message, at }
  }
}
