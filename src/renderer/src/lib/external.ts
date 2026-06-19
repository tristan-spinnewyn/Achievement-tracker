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
  spell: 'spells'
}

const wikiSearch = (name: string): string =>
  `https://ffxiv.gamerescape.com/w/index.php?search=${encodeURIComponent(name)}`

/** Lien externe pour un élément de collection (FFXIV Collect si dispo, sinon recherche wiki). */
export function collectionExternalUrl(type: CollectionType, id: number, name: string): string {
  const p = COLLECT_PATH[type]
  return p ? `https://ffxivcollect.com/${p}/${id}` : wikiSearch(name)
}

/** Lien externe pour un haut fait. */
export function achievementExternalUrl(id: number): string {
  return `https://ffxivcollect.com/achievements/${id}`
}
