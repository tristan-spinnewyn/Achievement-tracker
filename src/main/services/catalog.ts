import { app } from 'electron'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import type {
  Achievement,
  AchievementCategory,
  AchievementKind,
  CatalogSnapshot,
  CatalogStatus,
  Language
} from '@shared/types'
import { store, type CatalogData } from '../data/store'
import { getCatalogStatus } from '../data/repo'

function snapshotPath(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'resources', 'catalog-snapshot.json')
    : join(app.getAppPath(), 'resources', 'catalog-snapshot.json')
}

function snapshotToCatalog(s: CatalogSnapshot): CatalogData {
  return {
    generatedAt: s.generatedAt,
    gameVersion: s.gameVersion,
    kinds: s.kinds,
    categories: s.categories,
    achievements: s.achievements
  }
}

export function loadSnapshotIntoStore(): boolean {
  const path = snapshotPath()
  if (!existsSync(path)) {
    console.error('[catalog] snapshot introuvable :', path)
    return false
  }
  try {
    const snap = JSON.parse(readFileSync(path, 'utf8')) as CatalogSnapshot
    store.setCatalog(snapshotToCatalog(snap))
    return true
  } catch (err) {
    console.error('[catalog] échec de lecture du snapshot :', err)
    return false
  }
}

/**
 * Aligne le catalogue local sur le snapshot embarqué : seed si vide, ou si le snapshot
 * est plus récent que les données stockées (nouveau build), sans écraser une mise à jour
 * faite à chaud par l'utilisateur (XIVAPI), plus récente que le snapshot.
 */
export function seedCatalogIfEmpty(): void {
  const path = snapshotPath()
  if (!existsSync(path)) {
    if (store.catalog.achievements.length === 0) console.error('[catalog] snapshot introuvable :', path)
    return
  }
  try {
    const snap = JSON.parse(readFileSync(path, 'utf8')) as CatalogSnapshot
    const stored = store.catalog.generatedAt
    const fresh = store.catalog.achievements.length === 0 || !stored || (snap.generatedAt ?? '') > stored
    if (!fresh) return
    store.setCatalog(snapshotToCatalog(snap))
    console.log(`[catalog] catalogue mis à jour (${store.catalog.achievements.length} hauts faits)`)
  } catch (err) {
    console.error('[catalog] échec de lecture du snapshot :', err)
  }
}

// --- Mise à jour à la volée depuis XIVAPI v2 (même pagination que scripts/build-catalog.ts) ---

const BASE = 'https://v2.xivapi.com/api/sheet/Achievement'
const FIELDS = 'Name,Description,Points,Icon,AchievementCategory'

interface ApiRelation {
  value?: number
  row_id?: number
  fields?: Record<string, unknown> & { AchievementKind?: ApiRelation; Name?: unknown; Order?: unknown }
}
interface ApiRow {
  row_id: number
  fields?: {
    Name?: string
    Description?: string
    Points?: number
    Icon?: { path?: string }
    AchievementCategory?: ApiRelation
  }
}

function relId(rel: ApiRelation | undefined): number {
  return rel?.row_id ?? rel?.value ?? 0
}

export async function refreshCatalogFromXivapi(language: Language = 'fr'): Promise<CatalogStatus> {
  const achievements: Achievement[] = []
  const categories = new Map<number, AchievementCategory>()
  const kinds = new Map<number, AchievementKind>()
  let after: number | null = null
  let gameVersion = ''
  let page = 0

  for (;;) {
    const params = new URLSearchParams({ language, limit: '500', fields: FIELDS })
    if (after !== null) params.set('after', String(after))
    const res = await fetch(`${BASE}?${params.toString()}`)
    if (!res.ok) throw new Error(`XIVAPI HTTP ${res.status}`)
    const data = (await res.json()) as { version?: string; rows?: ApiRow[] }
    gameVersion = data.version ?? gameVersion
    const rows = data.rows ?? []
    if (rows.length === 0) break

    for (const row of rows) {
      const f = row.fields ?? {}
      const name = String(f.Name ?? '').trim()
      if (!name) continue
      const cat = f.AchievementCategory
      const categoryId = relId(cat)
      const kindRel = cat?.fields?.AchievementKind
      const kindId = relId(kindRel)
      if (cat && !categories.has(categoryId)) {
        categories.set(categoryId, {
          id: categoryId,
          kindId,
          name: String(cat.fields?.Name ?? ''),
          order: Number(cat.fields?.Order ?? 0)
        })
      }
      if (kindRel && !kinds.has(kindId)) {
        kinds.set(kindId, {
          id: kindId,
          name: String(kindRel.fields?.Name ?? ''),
          order: Number(kindRel.fields?.Order ?? 0)
        })
      }
      achievements.push({
        id: row.row_id,
        name,
        description: f.Description ?? '',
        points: f.Points ?? 0,
        categoryId,
        kindId,
        iconPath: f.Icon?.path ?? null,
        obtainable: true,
        patch: null
      })
    }

    after = rows[rows.length - 1].row_id
    if (++page > 50) break
  }

  await mergeAchievementPatches(achievements)

  store.setCatalog({
    generatedAt: new Date().toISOString(),
    gameVersion,
    kinds: [...kinds.values()].sort((a, b) => a.order - b.order),
    categories: [...categories.values()].sort((a, b) => a.order - b.order),
    achievements
  })

  return getCatalogStatus()
}

/** Renseigne le patch d'introduction des hauts faits depuis FFXIV Collect (best-effort). */
async function mergeAchievementPatches(achievements: Achievement[]): Promise<void> {
  try {
    const res = await fetch('https://ffxivcollect.com/api/achievements?limit=10000')
    if (!res.ok) return
    const data = (await res.json()) as { results?: { id: number; patch?: string }[] }
    const patchById = new Map<number, string>()
    for (const r of data.results ?? []) if (r.patch) patchById.set(r.id, r.patch)
    for (const a of achievements) a.patch = patchById.get(a.id) ?? null
  } catch {
    // patchs facultatifs : on continue sans
  }
}
