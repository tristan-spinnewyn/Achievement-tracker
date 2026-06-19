/**
 * Validation autonome du scrape Lodestone + correspondance avec le catalogue.
 * Réplique la logique de src/main/services/lodestone.ts (pas d'import Electron).
 * Lancer : npx tsx scripts/test-scrape.ts [characterId]
 */
import { readFileSync } from 'fs'
import { resolve } from 'path'

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'

async function fetchPage(id: string, page: number): Promise<string> {
  const url = `https://na.finalfantasyxiv.com/lodestone/character/${id}/achievement/?page=${page}`
  const res = await fetch(url, { headers: { 'User-Agent': UA } })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.text()
}

function parse(html: string): { items: { id: number; date: string | null }[]; totalPages: number } {
  const items: { id: number; date: string | null }[] = []
  for (const chunk of html.split('<li class="entry">').slice(1)) {
    const idm = chunk.match(/achievement\/detail\/(\d+)/)
    if (!idm) continue
    const tsm = chunk.match(/ldst_strftime\((\d+),/)
    items.push({
      id: Number(idm[1]),
      date: tsm ? new Date(Number(tsm[1]) * 1000).toISOString().slice(0, 10) : null
    })
  }
  const pm = html.match(/Page\s+\d+\s+of\s+(\d+)/i)
  return { items, totalPages: pm ? Number(pm[1]) : 1 }
}

const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

async function main(): Promise<void> {
  const id = process.argv[2] ?? '6125331'
  const first = await fetchPage(id, 1)
  const { items, totalPages } = parse(first)
  const all = [...items]
  for (let p = 2; p <= totalPages; p++) {
    await delay(300)
    all.push(...parse(await fetchPage(id, p)).items)
    process.stdout.write(`\rScrape page ${p}/${totalPages}…`)
  }

  const snapshot = JSON.parse(
    readFileSync(resolve(process.cwd(), 'resources', 'catalog-snapshot.json'), 'utf8')
  ) as { achievements: { id: number }[] }
  const catalogIds = new Set(snapshot.achievements.map((a) => a.id))

  const matched = all.filter((it) => catalogIds.has(it.id)).length
  const unmatched = all.filter((it) => !catalogIds.has(it.id))

  console.log(`\n— Personnage ${id} —`)
  console.log(`Pages          : ${totalPages}`)
  console.log(`Hauts faits lus : ${all.length}`)
  console.log(`Présents dans le catalogue : ${matched}/${all.length}`)
  console.log(`Non trouvés     : ${unmatched.length}`, unmatched.slice(0, 5).map((u) => u.id))
  console.log('Exemple :', all.slice(0, 3))
}

main().catch((e) => {
  console.error('\nÉchec :', e)
  process.exit(1)
})
