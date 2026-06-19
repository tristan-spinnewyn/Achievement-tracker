/**
 * Génère resources/catalog-snapshot.json depuis XIVAPI v2 (données de jeu, FR).
 * Le catalogue est ensuite chargé localement au 1er lancement de l'app.
 *
 * Lancer avec: npm run build:catalog
 */
import { writeFileSync, mkdirSync } from 'fs'
import { resolve, dirname } from 'path'
import type {
  CatalogSnapshot,
  Achievement,
  AchievementCategory,
  AchievementKind
} from '../src/shared/types'

const BASE = 'https://v2.xivapi.com/api/sheet/Achievement'
const LANGUAGE = 'fr'
const PAGE_SIZE = 500
// La relation AchievementCategory s'étend automatiquement (Name/Order + AchievementKind imbriqué).
const FIELDS = 'Name,Description,Points,Icon,AchievementCategory'
const POLITE_DELAY_MS = 150

interface ApiRelation {
  value?: number
  row_id?: number
  fields?: Record<string, unknown> & { AchievementKind?: ApiRelation }
}
interface ApiRow {
  row_id: number
  fields: {
    Name?: string
    Description?: string
    Points?: number
    Icon?: { path?: string }
    AchievementCategory?: ApiRelation
  }
}
interface ApiResponse {
  version?: string
  rows?: ApiRow[]
}

async function fetchPage(after: number | null): Promise<ApiResponse> {
  const params = new URLSearchParams({
    language: LANGUAGE,
    limit: String(PAGE_SIZE),
    fields: FIELDS
  })
  if (after !== null) params.set('after', String(after))
  const url = `${BASE}?${params.toString()}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status} — ${url}`)
  return (await res.json()) as ApiResponse
}

function relId(rel: ApiRelation | undefined): number {
  return rel?.row_id ?? rel?.value ?? 0
}

async function main(): Promise<void> {
  const achievements: Achievement[] = []
  const categories = new Map<number, AchievementCategory>()
  const kinds = new Map<number, AchievementKind>()
  let after: number | null = null
  let gameVersion = ''
  let page = 0

  for (;;) {
    const data = await fetchPage(after)
    gameVersion = data.version ?? gameVersion
    const rows = data.rows ?? []
    if (rows.length === 0) break

    for (const row of rows) {
      const f = row.fields ?? {}
      const name = (f.Name ?? '').trim()
      if (!name) continue // lignes vides / hauts faits non publiés

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
    page += 1
    process.stdout.write(`\rPage ${page} — ${achievements.length} hauts faits…`)
    await new Promise((r) => setTimeout(r, POLITE_DELAY_MS))
    if (page > 50) break // garde-fou
  }

  // Patchs et informations saisonnières (FFXIV Collect, à jour avec le jeu).
  let withPatch = 0
  let withSeasonal = 0
  try {
    const res = await fetch('https://ffxivcollect.com/api/achievements?limit=10000')
    if (res.ok) {
      const data = (await res.json()) as {
        results?: Array<{
          id: number
          patch?: string
          isSeasonal?: boolean
          seasonalEvent?: string | null
          seasonalEndDate?: string | null
        }>
      }
      const patchById = new Map<number, string>()
      const seasonalById = new Map<number, { isSeasonal: boolean; seasonalEvent: string | null; seasonalEndDate: string | null }>()
      
      for (const r of data.results ?? []) {
        if (r.patch) patchById.set(r.id, r.patch)
        if (r.isSeasonal || r.seasonalEvent) {
          seasonalById.set(r.id, {
            isSeasonal: r.isSeasonal ?? true,
            seasonalEvent: r.seasonalEvent ?? null,
            seasonalEndDate: r.seasonalEndDate ?? null
          })
        }
      }
      
      for (const a of achievements) {
        a.patch = patchById.get(a.id) ?? null
        if (a.patch) withPatch++
        
        const seasonal = seasonalById.get(a.id)
        if (seasonal) {
          a.isSeasonal = seasonal.isSeasonal
          a.seasonalEvent = seasonal.seasonalEvent
          a.seasonalEndDate = seasonal.seasonalEndDate
          withSeasonal++
        }
      }
    }
  } catch (err) {
    console.warn('\n⚠ patchs/événements indisponibles :', err instanceof Error ? err.message : err)
  }
  console.log(`\n✔ ${withPatch} hauts faits avec patch`)
  console.log(`✔ ${withSeasonal} hauts faits saisonniers identifiés`)

  const snapshot: CatalogSnapshot = {
    generatedAt: new Date().toISOString(),
    gameVersion,
    kinds: [...kinds.values()].sort((a, b) => a.order - b.order),
    categories: [...categories.values()].sort((a, b) => a.order - b.order),
    achievements
  }

  const out = resolve(process.cwd(), 'resources', 'catalog-snapshot.json')
  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(out, JSON.stringify(snapshot), 'utf8')

  console.log(
    `\n✔ ${achievements.length} hauts faits · ${categories.size} catégories · ${kinds.size} types`
  )
  console.log(`✔ Snapshot écrit : ${out}`)
  console.log(`✔ Version de jeu : ${gameVersion}`)
}

main().catch((err) => {
  console.error('\n✖ Échec de génération du catalogue :', err)
  process.exit(1)
})
