/**
 * Construction du catalogue des collections (XIVAPI v2 + FFXIV Collect).
 * Module pur (aucune dépendance Electron, uniquement `fetch`) afin d'être utilisé
 * à la fois par le script `scripts/build-collections.ts` et par la mise à jour à chaud
 * du process principal — une seule source de vérité.
 */
import type {
  CollectionCategory,
  CollectionItem,
  CollectionType,
  Language
} from '../../shared/types'

const V2 = 'https://v2.xivapi.com/api/sheet'
const COLLECT = 'https://ffxivcollect.com/api'
const PAGE = 500
const ALIAS_LANGS: Language[] = ['en', 'de', 'ja']

/** Normalise un nom pour le matching Lodestone (doit rester identique à repo.normalizeName). */
export function normalizeName(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

const cap = (s: string): string => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s)

function iconPathFromUrl(url?: string | null): string | null {
  if (!url) return null
  const m = url.match(/[?&]path=([^&]+)/)
  return m ? decodeURIComponent(m[1]) : null
}

const pad6 = (n: number): string => String(n).padStart(6, '0')

/** Chemin d'icône de l'art d'une carte de Triple Triade (icône 88000 + row_id). */
function ttIconPath(rowId: number): string {
  const icon = 88000 + rowId
  const folder = Math.floor(icon / 1000) * 1000
  return `ui/icon/${pad6(folder)}/${pad6(icon)}.tex`
}

// --------------------------------------------------------------- FFXIV Collect

interface CollectRow {
  id: number
  name?: string
  description?: string
  patch?: string
  icon?: string
  image?: string
  sources?: { type?: string; text?: string }[]
}

async function fetchCollect(ep: string): Promise<Map<number, CollectRow>> {
  const map = new Map<number, CollectRow>()
  try {
    const res = await fetch(`${COLLECT}/${ep}?limit=5000`)
    if (!res.ok) return map
    const data = (await res.json()) as { results?: CollectRow[] }
    for (const r of data.results ?? []) map.set(r.id, r)
  } catch {
    // FFXIV Collect indisponible : on continue sans patch ni source
  }
  return map
}

function sourcesOf(r?: CollectRow): string[] {
  if (!r?.sources) return []
  return r.sources.map((s) => [s.type, s.text].filter(Boolean).join(' : ')).filter(Boolean)
}

// --------------------------------------------------------------- XIVAPI v2

interface SheetRow {
  row_id: number
  fields?: Record<string, any>
}

async function fetchSheet(
  sheet: string,
  fields: string,
  language: Language
): Promise<{ rows: SheetRow[]; version: string }> {
  const rows: SheetRow[] = []
  let after: number | null = null
  let version = ''
  for (;;) {
    const p = new URLSearchParams({ language, limit: String(PAGE), fields })
    if (after !== null) p.set('after', String(after))
    const res = await fetch(`${V2}/${sheet}?${p.toString()}`)
    if (!res.ok) throw new Error(`XIVAPI HTTP ${res.status} (${sheet})`)
    const data = (await res.json()) as { version?: string; rows?: SheetRow[] }
    version = data.version ?? version
    const batch = data.rows ?? []
    if (batch.length === 0) break
    rows.push(...batch)
    after = batch[batch.length - 1].row_id
    if (rows.length > 30000) break
  }
  return { rows, version }
}

// --------------------------------------------------------------- Builders

/**
 * Collection dont l'ensemble est défini par une feuille XIVAPI, avec alias multi-langues
 * (synchronisable Lodestone). Patch / obtention via FFXIV Collect si `collectEp` est fourni.
 */
async function buildXivapiCollection(
  type: CollectionType,
  sheet: string,
  nameField: string,
  opts: { collectEp?: string; hasOrder?: boolean; aliasFields?: string[] } = {}
): Promise<{ items: CollectionItem[]; version: string }> {
  // Champs servant d'alias de matching (nom affiché + variantes, ex. la forme « Singular »).
  const nameFields = [nameField, ...(opts.aliasFields ?? [])]
  const addAlias = (it: CollectionItem | undefined, raw: string): void => {
    if (!it || !raw) return
    const norm = normalizeName(raw)
    if (norm && !it.aliases.includes(norm)) it.aliases.push(norm)
  }

  const fields = [...nameFields, 'Icon', ...(opts.hasOrder ? ['Order'] : [])].join(',')
  const { rows, version } = await fetchSheet(sheet, fields, 'fr')
  const byId = new Map<number, CollectionItem>()
  for (const r of rows) {
    const raw = String(r.fields?.[nameField] ?? '').trim()
    if (!raw) continue
    const name = nameField === 'Singular' ? cap(raw) : raw
    const it: CollectionItem = {
      type,
      id: r.row_id,
      name,
      description: '',
      iconPath: r.fields?.Icon?.path ?? null,
      categoryId: null,
      order: opts.hasOrder ? Number(r.fields?.Order ?? r.row_id) : r.row_id,
      patch: null,
      sources: [],
      aliases: []
    }
    for (const f of nameFields) addAlias(it, String(r.fields?.[f] ?? '').trim())
    byId.set(r.row_id, it)
  }
  for (const lang of ALIAS_LANGS) {
    const { rows: lrows } = await fetchSheet(sheet, nameFields.join(','), lang)
    for (const r of lrows) {
      const it = byId.get(r.row_id)
      for (const f of nameFields) addAlias(it, String(r.fields?.[f] ?? '').trim())
    }
  }
  if (opts.collectEp) {
    const collect = await fetchCollect(opts.collectEp)
    for (const it of byId.values()) {
      const c = collect.get(it.id)
      it.patch = c?.patch ?? null
      it.sources = sourcesOf(c)
    }
  }
  return { items: [...byId.values()], version }
}

async function buildOrchestrion(): Promise<{ items: CollectionItem[]; categories: CollectionCategory[] }> {
  const { rows: ui } = await fetchSheet('OrchestrionUiparam', 'Order,OrchestrionCategory', 'fr')
  const meta = new Map<number, { categoryId: number; categoryIcon: string | null; order: number }>()
  const cats = new Map<number, CollectionCategory>()
  for (const r of ui) {
    const c = r.fields?.OrchestrionCategory
    const categoryId = c?.row_id ?? c?.value ?? 0
    const categoryName = String(c?.fields?.Name ?? '').trim()
    meta.set(r.row_id, {
      categoryId,
      categoryIcon: c?.fields?.Icon?.path ?? null,
      order: Number(r.fields?.Order ?? 0)
    })
    if (categoryName && !cats.has(categoryId)) {
      cats.set(categoryId, {
        type: 'orchestrion',
        id: categoryId,
        name: categoryName,
        order: Number(c?.fields?.Order ?? 0)
      })
    }
  }
  const { rows } = await fetchSheet('Orchestrion', 'Name,Description', 'fr')
  const collect = await fetchCollect('orchestrions')
  const items: CollectionItem[] = []
  for (const r of rows) {
    const name = String(r.fields?.Name ?? '').trim()
    if (!name) continue
    const m = meta.get(r.row_id)
    const c = collect.get(r.row_id)
    items.push({
      type: 'orchestrion',
      id: r.row_id,
      name,
      description: String(r.fields?.Description ?? '').trim(),
      iconPath: m?.categoryIcon ?? null,
      categoryId: m?.categoryId ?? null,
      order: m?.order ?? r.row_id,
      patch: c?.patch ?? null,
      sources: sourcesOf(c),
      aliases: []
    })
  }
  return { items, categories: [...cats.values()].sort((a, b) => a.order - b.order) }
}

interface CollectConfig {
  type: CollectionType
  collect: string
  /** Feuille XIVAPI pour les noms FR (sinon noms FFXIV Collect en anglais). */
  xivapiSheet?: string
  nameField?: string
  /** Construire des alias multi-langues (collection synchronisable). */
  aliasLangs?: boolean
  noIcon?: boolean
}

/** Collections dont l'ensemble est défini par FFXIV Collect (emotes, mode, coiffures…). */
async function buildCollectCollection(
  cfg: CollectConfig,
  frOverride?: Map<number, { name: string; iconPath: string | null }>
): Promise<CollectionItem[]> {
  const collect = await fetchCollect(cfg.collect)

  const frName = new Map<number, string>()
  const frIcon = new Map<number, string | null>()
  const aliasById = new Map<number, string[]>()

  if (cfg.xivapiSheet && cfg.nameField) {
    const { rows } = await fetchSheet(cfg.xivapiSheet, `${cfg.nameField},Icon`, 'fr')
    for (const r of rows) {
      const raw = String(r.fields?.[cfg.nameField] ?? '').trim()
      if (!raw) continue
      const name = cfg.nameField === 'Singular' ? cap(raw) : raw
      frName.set(r.row_id, name)
      frIcon.set(r.row_id, r.fields?.Icon?.path ?? null)
      if (cfg.aliasLangs) aliasById.set(r.row_id, [normalizeName(name)])
    }
    if (cfg.aliasLangs) {
      for (const lang of ALIAS_LANGS) {
        const { rows: lr } = await fetchSheet(cfg.xivapiSheet, cfg.nameField, lang)
        for (const r of lr) {
          const n = String(r.fields?.[cfg.nameField] ?? '').trim()
          const a = aliasById.get(r.row_id)
          if (n && a) {
            const norm = normalizeName(n)
            if (!a.includes(norm)) a.push(norm)
          }
        }
      }
    }
  }

  const items: CollectionItem[] = []
  for (const c of collect.values()) {
    const over = frOverride?.get(c.id)
    const name = over?.name ?? frName.get(c.id) ?? c.name ?? ''
    if (!name) continue
    const iconPath = over
      ? over.iconPath
      : cfg.noIcon
        ? null
        : frIcon.get(c.id) ?? iconPathFromUrl(c.icon)
    items.push({
      type: cfg.type,
      id: c.id,
      name,
      description: '',
      iconPath,
      categoryId: null,
      order: c.id,
      patch: c.patch ?? null,
      sources: sourcesOf(c),
      aliases: aliasById.get(c.id) ?? []
    })
  }
  return items
}

/** Noms FR + icônes des sorts de magie bleue (XIVAPI AozAction → Action). */
async function fetchAozNames(): Promise<Map<number, { name: string; iconPath: string | null }>> {
  const map = new Map<number, { name: string; iconPath: string | null }>()
  const { rows } = await fetchSheet('AozAction', 'Action.Name,Action.Icon', 'fr')
  for (const r of rows) {
    const a = r.fields?.Action?.fields
    const name = String(a?.Name ?? '').trim()
    if (name) map.set(r.row_id, { name, iconPath: a?.Icon?.path ?? null })
  }
  return map
}

/** Cartes de Triple Triade (XIVAPI : nom FR, description, art de carte, obtention). */
async function buildTripleTriad(): Promise<CollectionItem[]> {
  const { rows } = await fetchSheet('TripleTriadCard', 'Name,Description', 'fr')
  const { rows: res } = await fetchSheet(
    'TripleTriadCardResident',
    'SortKey,AcquisitionType.Text.Text',
    'fr'
  )
  const meta = new Map<number, { order: number; acq: string }>()
  for (const r of res) {
    const acq = String(r.fields?.AcquisitionType?.fields?.Text?.fields?.Text ?? '')
      .replace(/\s+/g, ' ')
      .replace(/:\s*$/, '')
      .trim()
    meta.set(r.row_id, { order: Number(r.fields?.SortKey ?? r.row_id), acq })
  }
  const items: CollectionItem[] = []
  for (const r of rows) {
    const name = String(r.fields?.Name ?? '').trim()
    if (!name || name === '0') continue
    const m = meta.get(r.row_id)
    items.push({
      type: 'tripletriad',
      id: r.row_id,
      name: cap(name),
      description: String(r.fields?.Description ?? '').trim(),
      iconPath: ttIconPath(r.row_id),
      categoryId: null,
      order: m?.order ?? r.row_id,
      patch: null,
      sources: m?.acq ? [m.acq] : [],
      aliases: []
    })
  }
  return items
}

const COLLECT_CONFIGS: CollectConfig[] = [
  { type: 'emote', collect: 'emotes', xivapiSheet: 'Emote', nameField: 'Name', aliasLangs: true },
  { type: 'fashion', collect: 'fashions', xivapiSheet: 'Ornament', nameField: 'Singular' },
  { type: 'hairstyle', collect: 'hairstyles' },
  { type: 'barding', collect: 'bardings' },
  { type: 'title', collect: 'titles', xivapiSheet: 'Title', nameField: 'Masculine', noIcon: true }
]

export interface BuiltCollections {
  gameVersion: string
  categories: CollectionCategory[]
  items: CollectionItem[]
}

/** Construit l'intégralité du catalogue des collections. */
export async function buildCollections(): Promise<BuiltCollections> {
  const mounts = await buildXivapiCollection('mount', 'Mount', 'Singular', {
    collectEp: 'mounts',
    hasOrder: true
  })
  const minions = await buildXivapiCollection('minion', 'Companion', 'Singular', {
    collectEp: 'minions',
    hasOrder: true
  })
  const faceAcc = await buildXivapiCollection('faceaccessory', 'Glasses', 'Name', {
    aliasFields: ['Singular']
  })
  const orch = await buildOrchestrion()
  const extra: CollectionItem[] = []
  for (const cfg of COLLECT_CONFIGS) extra.push(...(await buildCollectCollection(cfg)))

  // Magie bleue : ensemble FFXIV Collect + noms FR / icônes via AozAction.
  const aoz = await fetchAozNames()
  const spells = await buildCollectCollection({ type: 'spell', collect: 'spells' }, aoz)

  // Triple Triade : XIVAPI uniquement (pas dans FFXIV Collect).
  const tripleTriad = await buildTripleTriad()

  // Bestiaire de dresseur : XIVAPI XBMPet + FFXIV Collect.
  const beasts = await buildBeasts()

  return {
    gameVersion: mounts.version || minions.version || '',
    categories: [...orch.categories, ...beasts.categories],
    items: [
      ...mounts.items,
      ...minions.items,
      ...faceAcc.items,
      ...orch.items,
      ...extra,
      ...spells,
      ...tripleTriad,
      ...beasts.items
    ]
  }
}

const BEAST_CATEGORIES: CollectionCategory[] = [
  { type: 'beast', id: 1, name: 'Thériens', order: 1 },
  { type: 'beast', id: 2, name: 'Insectoïdes', order: 2 },
  { type: 'beast', id: 3, name: 'Ptériens', order: 3 },
  { type: 'beast', id: 4, name: 'Floréens', order: 4 },
  { type: 'beast', id: 5, name: 'Hydrides', order: 5 },
  { type: 'beast', id: 6, name: 'Cuirassiens', order: 6 },
  { type: 'beast', id: 7, name: 'Animides', order: 7 },
  { type: 'beast', id: 8, name: 'Nécroïdes', order: 8 }
]

/** Bestiaire du dresseur : 50 bêtes capturables (XIVAPI XBMPet + FFXIV Collect). */
async function buildBeasts(): Promise<{ items: CollectionItem[]; categories: CollectionCategory[] }> {
  const collect = await fetchCollect('beasts')
  const xivapi = new Map<
    number,
    { name: string; description: string; categoryId: number; iconPath: string | null }
  >()
  try {
    const { rows } = await fetchSheet('XBMPet', 'Pet.Name,Unknown0,Unknown3,Unknown7', 'fr')
    for (const r of rows) {
      if (r.row_id === 0) continue
      const rawName = String(r.fields?.Pet?.fields?.Name ?? '').trim()
      const desc = String(r.fields?.Unknown0 ?? '').trim()
      const catId = Number(r.fields?.Unknown7 ?? 0)
      const iconId = Number(r.fields?.Unknown3 ?? 0)
      const folder = Math.floor(iconId / 1000) * 1000
      const iconPath = iconId ? `ui/icon/${pad6(folder)}/${pad6(iconId)}_hr1.tex` : null
      if (rawName) {
        xivapi.set(r.row_id, {
          name: cap(rawName),
          description: desc,
          categoryId: catId,
          iconPath
        })
      }
    }
  } catch {
    // Si XIVAPI indisponible, on s'appuiera sur FFXIV Collect
  }

  const items: CollectionItem[] = []
  const allIds = new Set<number>([...xivapi.keys(), ...collect.keys()])
  const sortedIds = [...allIds].sort((a, b) => a - b)

  for (const id of sortedIds) {
    const x = xivapi.get(id)
    const c = collect.get(id)
    const name = x?.name ?? c?.name ?? `Bête #${id}`
    const description = x?.description ?? c?.description ?? ''
    const iconPath = x?.iconPath ?? iconPathFromUrl(c?.image) ?? iconPathFromUrl(c?.icon)
    const categoryId = x?.categoryId && x.categoryId > 0 ? x.categoryId : null

    items.push({
      type: 'beast',
      id,
      name,
      description,
      iconPath,
      categoryId,
      order: id,
      patch: c?.patch ?? '7.56',
      sources: sourcesOf(c),
      aliases: []
    })
  }

  return { items, categories: BEAST_CATEGORIES }
}
