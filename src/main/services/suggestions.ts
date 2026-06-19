import type { Suggestion, SuggestionWeights } from '@shared/types'
import { store } from '../data/store'
import { getAchievementRow } from '../data/repo'

const LEGACY_KIND_ID = 13
const PRIORITY_WORDS = ['', 'basse', 'moyenne', 'haute']

/**
 * Heuristique « à faire ensuite » sur les hauts faits NON obtenus.
 * Le Lodestone n'expose pas la progression partielle, donc le score combine :
 *   - la priorité manuelle,
 *   - la valeur en points,
 *   - la proximité de complétion de la catégorie (finir ce qui est presque fini).
 */
export function getSuggestions(
  weights?: SuggestionWeights,
  limit = 40
): Suggestion[] {
  // Utiliser les poids des paramètres utilisateur si non fournis
  const actualWeights = weights ?? store.user.settings.suggestionWeights
  const catTotal = new Map<number, number>()
  const catDone = new Map<number, number>()
  let maxPoints = 1

  for (const a of store.catalog.achievements) {
    catTotal.set(a.categoryId, (catTotal.get(a.categoryId) ?? 0) + 1)
    if (a.points > maxPoints) maxPoints = a.points
    if (store.user.progress[a.id]?.completed) {
      catDone.set(a.categoryId, (catDone.get(a.categoryId) ?? 0) + 1)
    }
  }

  const suggestions: Suggestion[] = []
  for (const a of store.catalog.achievements) {
    if (store.user.progress[a.id]?.completed) continue
    if (!a.obtainable) continue
    if (a.kindId === LEGACY_KIND_ID) continue

    const priority = store.user.userMeta[a.id]?.priority ?? 0
    const total = catTotal.get(a.categoryId) ?? 1
    const proximity = total ? (catDone.get(a.categoryId) ?? 0) / total : 0

    const score =
      (priority / 3) * actualWeights.priority +
      (a.points / maxPoints) * actualWeights.points +
      proximity * actualWeights.categoryProximity

    if (score <= 0) continue

    const reasons: string[] = []
    if (priority > 0) reasons.push(`Priorité ${PRIORITY_WORDS[priority]}`)
    if (proximity >= 0.7) reasons.push(`Catégorie à ${Math.round(proximity * 100)}%`)
    if (a.points >= 20) reasons.push(`${a.points} points`)

    const row = getAchievementRow(a.id)
    if (row) suggestions.push({ achievement: row, score, reasons })
  }

  suggestions.sort((x, y) => y.score - x.score)
  return suggestions.slice(0, limit)
}
