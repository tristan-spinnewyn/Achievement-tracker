/**
 * Generates resources/collections-snapshot.json through the shared builder module
 * (mounts, minions, orchestrion, emotes, fashion, hairstyles, barding, titles).
 *
 * Run: npm run build:collections
 */
import { writeFileSync, mkdirSync } from 'fs'
import { resolve, dirname } from 'path'
import type { CollectionsSnapshot, CollectionType } from '../src/shared/types'
import { buildCollections } from '../src/main/services/collectionsBuilder'

async function main(): Promise<void> {
  console.log('Building the collections catalog…')
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
  console.log(`✔ ${built.items.length} entries · ${withPatch} with a patch`)
  console.log(`✔ Snapshot written: ${out}`)
}

main().catch((err) => {
  console.error('\n✖ Failed:', err)
  process.exit(1)
})
