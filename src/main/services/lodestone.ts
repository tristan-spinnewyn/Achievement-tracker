import type { Region, SyncResult } from '@shared/types'
import * as repo from '../data/repo'
import { fetchTextWithRetry } from '../utils/fetch'

// Le Lodestone est identique quel que soit le sous-domaine régional ; on mappe juste pour cohérence.
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

/** Accepte un ID numérique ou une URL Lodestone complète, renvoie l'ID. */
export function extractCharacterId(input: string): string | null {
  const s = input.trim()
  const urlMatch = s.match(/character\/(\d+)/)
  if (urlMatch) return urlMatch[1]
  if (/^\d+$/.test(s)) return s
  return null
}

/**
 * Analyse une page de hauts faits du Lodestone.
 * Sélecteurs centralisés ici — à ajuster si le HTML du Lodestone change.
 *   - chaque entrée commence par `<li class="entry">`
 *   - l'ID est dans `.../achievement/detail/{ID}/`
 *   - la date d'obtention est le timestamp Unix dans `ldst_strftime(<ts>, ...)`
 *   - le nombre de pages est dans « Page X of Y »
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

async function fetchPage(host: string, charId: string, page: number): Promise<string> {
  const url = `https://${host}.finalfantasyxiv.com/lodestone/character/${charId}/achievement/?page=${page}`
  try {
    const text = await fetchTextWithRetry(url, {
      headers: { 'User-Agent': UA }
    })
    // Vérifier manuellement le 404 car fetchTextWithRetry ne lève pas sur 404
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
  const host = HOSTS[region] ?? 'na'
  const first = await fetchPage(host, charId, 1)
  const { items, totalPages } = parsePage(first)
  const all = [...items]
  const pages = Math.min(totalPages, MAX_PAGES)
  for (let p = 2; p <= pages; p++) {
    await delay(POLITE_DELAY_MS)
    const html = await fetchPage(host, charId, p)
    all.push(...parsePage(html).items)
  }
  return { items: all, pages }
}

/** Synchro à la demande : scrape, applique au store, journalise, met à jour lastSyncAt. */
export async function syncLodestone(force: boolean = false): Promise<SyncResult> {
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

  // Vérifier si une sync est nécessaire (sauf si forcée)
  if (!force && !repo.isSyncNeeded()) {
    const message = 'Déjà à jour — aucun changement détecté depuis la dernière synchronisation.'
    repo.addSyncLog({ at, ok: true, newlyCompleted: 0, totalCompleted: repo.countCompleted(), message })
    return { ok: true, newlyCompleted: 0, totalCompleted: repo.countCompleted(), message, at }
  }

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
    repo.updateSyncHash()
    const message = `${items.length} hauts faits lus (${pages} page(s)) · ${newly} nouveau(x).`
    repo.addSyncLog({ at, ok: true, newlyCompleted: newly, totalCompleted: total, message })
    return { ok: true, newlyCompleted: newly, totalCompleted: total, message, at }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    repo.addSyncLog({ at, ok: false, newlyCompleted: 0, totalCompleted: repo.countCompleted(), message })
    return { ok: false, newlyCompleted: 0, totalCompleted: repo.countCompleted(), message, at }
  }
}
