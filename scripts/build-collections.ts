/**
 * Génère resources/collections-snapshot.json via le module de construction partagé
 * (montures, mascottes, orchestrion, emotes, mode, coiffures, barde, titres).
 *
 * Lancer : npm run build:collections
 */
import { writeFileSync, mkdirSync } from 'fs'
import { resolve, dirname } from 'path'
import type { CollectionsSnapshot, CollectionType } from '../src/shared/types'
import { buildCollections } from '../src/main/services/collectionsCatalog'

async function main(): Promise<void> {
  console.log('Construction du catalogue des collections…')
  const built = await buildCollections()

  const counts: Record<string, number> = {}
  let withPatch = 0
  for (const it of built.items) {
    counts[it.type] = (counts[it.type] ?? 0) + 1
    if (it.patch) withPatch++
  }

  const snapshot: CollectionsSnapshot = {
    generatedAt: new Date().toISOString(),
    gameVersion: built.gameVersion,
    categories: built.categories,
    items: built.items
  }

  const out = resolve(process.cwd(), 'resources', 'collections-snapshot.json')
  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(out, JSON.stringify(snapshot), 'utf8')

  console.log(
    (Object.keys(counts) as CollectionType[]).map((t) => `${t}: ${counts[t]}`).join(' · ')
  )
  console.log(`✔ ${built.items.length} entrées · ${withPatch} avec patch`)
  console.log(`✔ Snapshot écrit : ${out}`)
}

main().catch((err) => {
  console.error('\n✖ Échec :', err)
  process.exit(1)
})
