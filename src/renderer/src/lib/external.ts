import type { CollectionType } from '@shared/types'

const COLLECT_PATH: Partial<Record<CollectionType, string>> = {
  mount: 'mounts',
  minion: 'minions',
  orchestrion: 'orchestrions',
  emote: 'emotes',
  fashion: 'fashions',
  hairstyle: 'hairstyles',
  barding: 'bardings',
  title: 'titles',
  spell: 'spells',
  beast: 'beasts'
}

const wikiSearch = (name: string): string =>
  `https://ffxiv.gamerescape.com/w/index.php?search=${encodeURIComponent(name)}`

/** External link for a collection item (FFXIV Collect when available, otherwise a wiki search). */
export function collectionExternalUrl(type: CollectionType, id: number, name: string): string {
  const p = COLLECT_PATH[type]
  return p ? `https://ffxivcollect.com/${p}/${id}` : wikiSearch(name)
}

/** External link for an achievement. */
export function achievementExternalUrl(id: number): string {
  return `https://ffxivcollect.com/achievements/${id}`
}
