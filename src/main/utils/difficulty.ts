/**
 * Algorithme de calcul de difficulté pour les hauts faits FFXIV.
 *
 * Modèle additif borné : on additionne des composantes indépendantes, chacune
 * plafonnée, plutôt que de multiplier tout le score par un facteur de patch
 * (l'ancienne approche confondait « récent » et « difficile »).
 *
 *   difficulté = points + palier de contenu + grind + défi
 *              + contexte (type/catégorie) + récence + saisonnier
 *
 * Le signal dominant en FFXIV n'est pas le nombre de points (un Ultime ≈ 50 pts,
 * un Sadique ≈ 10 pts) mais le PALIER de contenu (Ultime/Sadique/Extrême) et le
 * GRIND (« vaincre 10 000 ennemis »), souvent inscrits dans le NOM du haut fait.
 */

import { store } from '../data/store'
import type {
  Achievement,
  AchievementDifficulty,
  DifficultyLevel,
  DifficultyWeights
} from '@shared/types'

// ============================================================================
// Poids contextuels par défaut (personnalisables via les paramètres)
// Note : ces poids ne servent plus de score brut mais d'un *nudge* contextuel
// borné (cf. CONTEXT_CAP). On prend le max(kind, catégorie) pour éviter le
// double comptage type+catégorie.
// ============================================================================

/** Poids par type (kindId) — plus le type est exigeant, plus le poids est élevé. */
export const DEFAULT_KIND_WEIGHTS: Record<number, number> = {
  0: 0,   // Inconnu/Non classé
  1: 30,  // Combats (PvE)
  2: 25,  // JcJ (PvP)
  3: 10,  // Personnage (niveaux, jobs)
  4: 15,  // Objets (collection d'objets)
  5: 20,  // Synthèse et récolte (crafting/gathering)
  8: 5,   // Quêtes
  11: 20, // Exploration
  12: 25, // Grandes compagnies
  13: 40  // Legacy (contenu ancien/rare)
}

/** Poids par catégorie — certaines catégories sont plus exigeantes que d'autres. */
export const DEFAULT_CATEGORY_WEIGHTS: Record<number, number> = {
  // ========== Combats (kindId: 1) ==========
  54: 40, // Combats généraux
  5: 45,  // Contrats de chasse
  6: 40,  // Chasse aux trésors
  2: 35,  // Donjons
  10: 38, // Front (PvP)
  9: 37,  // L'Antre des loups (FATEs)
  3: 50,  // Défi
  4: 55,  // Raids (standard)
  // ========== Personnage (kindId: 3) ==========
  12: 10, // Général
  13: 15, // Disciples de la guerre
  14: 15, // Disciples de la magie
  15: 20, // Disciples de la main
  16: 20, // Disciples de la terre
  // ========== Objets (kindId: 4) ==========
  19: 15, // Général (Objets)
  20: 18, // Devises
  21: 22, // Recyclage
  22: 20, // Objets collectionnables
  23: 25, // Matérias
  62: 60, // Armes antiques (relique)
  63: 60, // Armes du zodiaque
  64: 65, // Armes anima
  65: 65, // Armes Eurêka
  68: 65, // Armes de la résistance
  70: 28, // Outils de Cielacier
  75: 70, // Armes des Manderville
  78: 30, // Outils des merveilles
  81: 70, // Armes fantômes
  82: 35, // Outils cosmiques
  // ========== Synthèse et récolte (kindId: 5) ==========
  69: 25, // Toutes classes
  24: 30, // Menuisier
  25: 30, // Forgeron
  26: 30, // Armurier
  27: 30, // Orfèvre
  28: 30, // Tanneur
  29: 30, // Couturier
  30: 30, // Alchimiste
  31: 30, // Cuisinier
  32: 35, // Mineur
  33: 35, // Botaniste
  34: 35, // Pêcheur
  // ========== Quêtes (kindId: 8) ==========
  35: 10, // Général (Quêtes)
  36: 12, // Mandats
  37: 15, // Quêtes des peuples alliés
  38: 18, // Événements saisonniers
  // ========== Exploration (kindId: 11) ==========
  39: 25, // Carnet d'exploration
  40: 22, // Noscea
  41: 22, // Forêt de Sombrelinceul
  42: 22, // Thanalan
  43: 22, // Coerthas
  45: 22, // Abalathia
  46: 22, // Dravania
  47: 22, // Gyr Abania
  48: 22, // Othard
  71: 30, // Missions d'exploration
  72: 25, // Mers du Nord
  73: 25, // Ilsabard
  74: 15, // Autres
  76: 18, // Quêtes de job/rôle
  77: 18, // Quêtes de maelstrom
  79: 20, // Yok Tural
  80: 20, // Xak Tural
  // ========== Grandes compagnies (kindId: 12) ==========
  50: 20, // Général
  51: 25, // Maelstrom
  52: 25, // Ordre des Deux Vipères
  53: 25  // Immortels
}

/**
 * Facteur de récence par patch — utilisé uniquement pour un petit bonus additif
 * (le contenu de la dernière extension est légèrement plus dur : sous-stuffé,
 * mécaniques inédites). ~0.5 (le plus ancien) .. 1.2 (le plus récent).
 */
export const DEFAULT_PATCH_WEIGHTS: Record<string, number> = {
  // Dawntrail (7.x)
  '7.0': 1.20, '7.01': 1.20, '7.05': 1.20, '7.1': 1.20, '7.11': 1.20, '7.15': 1.20,
  '7.2': 1.20, '7.21': 1.20, '7.25': 1.20, '7.3': 1.20, '7.31': 1.20, '7.35': 1.20,
  '7.4': 1.20, '7.41': 1.20, '7.45': 1.20, '7.5': 1.20, '7.51': 1.20, '7.55': 1.20,
  // Endwalker (6.x)
  '6.0': 1.10, '6.01': 1.10, '6.05': 1.10, '6.1': 1.10, '6.11': 1.10, '6.15': 1.10,
  '6.2': 1.10, '6.21': 1.10, '6.25': 1.10, '6.3': 1.10, '6.31': 1.10, '6.35': 1.10,
  '6.4': 1.10, '6.45': 1.10, '6.5': 1.10, '6.51': 1.10, '6.55': 1.10, '6.57': 1.10, '6.58': 1.10,
  // Shadowbringers (5.x)
  '5.0': 1.00, '5.01': 1.00, '5.05': 1.00, '5.1': 1.00, '5.11': 1.00, '5.15': 1.00,
  '5.2': 1.00, '5.21': 1.00, '5.25': 1.00, '5.3': 1.00, '5.31': 1.00, '5.35': 1.00,
  '5.4': 1.00, '5.41': 1.00, '5.45': 1.00, '5.5': 1.00, '5.51': 1.00, '5.55': 1.00,
  // Stormblood (4.x)
  '4.0': 0.90, '4.01': 0.90, '4.05': 0.90, '4.1': 0.90, '4.11': 0.90, '4.15': 0.90,
  '4.2': 0.90, '4.21': 0.90, '4.25': 0.90, '4.3': 0.90, '4.31': 0.90, '4.35': 0.90,
  '4.4': 0.90, '4.41': 0.90, '4.45': 0.90,
  // Heavensward (3.x)
  '3.0': 0.80, '3.01': 0.80, '3.05': 0.80, '3.1': 0.80, '3.11': 0.80, '3.15': 0.80,
  '3.2': 0.80, '3.21': 0.80, '3.25': 0.80, '3.3': 0.80, '3.31': 0.80, '3.35': 0.80,
  '3.4': 0.80, '3.41': 0.80, '3.45': 0.80,
  // A Realm Reborn (2.x)
  '2.0': 0.50, '2.1': 0.50, '2.2': 0.50, '2.21': 0.50, '2.25': 0.50,
  '2.3': 0.50, '2.31': 0.50, '2.35': 0.50, '2.4': 0.50, '2.41': 0.50, '2.45': 0.50,
  '2.5': 0.50, '2.51': 0.50, '2.55': 0.50
}

// ============================================================================
// Plafonds des composantes (la somme s'aligne sur les seuils de classification)
// ============================================================================

const POINTS_CAP = 35
const TIER_CAP = 80
const GRIND_CAP = 25
const CHALLENGE_CAP = 20
const CONTEXT_CAP = 20
const RECENCY_CAP = 8
const SEASONAL_BONUS = 8

// ============================================================================
// Constantes de classification
// ============================================================================

const DIFFICULTY_THRESHOLDS: Record<
  DifficultyLevel,
  { min: number; max: number; color: string; stars: string; name: string }
> = {
  very_easy: { min: 0, max: 20, color: '#22c55e', stars: '⭐', name: 'Très facile' },
  easy: { min: 21, max: 40, color: '#84cc16', stars: '⭐⭐', name: 'Facile' },
  medium: { min: 41, max: 60, color: '#eab308', stars: '⭐⭐⭐', name: 'Moyenne' },
  hard: { min: 61, max: 80, color: '#f97316', stars: '⭐⭐⭐⭐', name: 'Difficile' },
  very_hard: { min: 81, max: 100, color: '#ef4444', stars: '⭐⭐⭐⭐⭐', name: 'Très difficile' },
  extreme: { min: 101, max: Infinity, color: '#1f2937', stars: '⭐⭐⭐⭐⭐⭐', name: 'Extrême' }
}

const DEFAULT_WEIGHTS: DifficultyWeights = {
  kindWeights: DEFAULT_KIND_WEIGHTS,
  categoryWeights: DEFAULT_CATEGORY_WEIGHTS,
  patchWeights: DEFAULT_PATCH_WEIGHTS
}

// ============================================================================
// Helpers d'analyse textuelle (nom + description, FR et EN)
// ============================================================================

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v))

/**
 * Palier de contenu — le signal de difficulté le plus fort. On prend le palier
 * le plus élevé qui matche (pas une somme).
 */
function tierScore(text: string): number {
  const savage = /sadique|savage|élitiste/.test(text)
  const criterion = /critères?|criterion|mésaventure/.test(text)
  if (/ultime|ultimate/.test(text)) return 80
  if (criterion && savage) return 64
  if (savage) return 58
  if (criterion) return 42
  if (/extrême|extreme|\(ex\)/.test(text)) return 40
  if (/irréel|unreal/.test(text)) return 36
  return 0
}

const GRIND_VERBS =
  /vaincre|battre|tuer|abattre|récolt|pêch|synthétis|fabriqu|obtenir|gagner|remport|termin|complét|atteindre|accumul|defeat|complet|gather|catch|craft|reach\b|earn|win\b|obtain|collect/

/** Fusionne les groupes de milliers (10 000) puis renvoie le plus grand entier. */
function largestNumber(text: string): number {
  const normalized = text.replace(/(\d)[\s,](?=\d{3}\b)/g, '$1')
  let max = 0
  for (const m of normalized.matchAll(/\d+/g)) {
    const n = Number(m[0])
    if (n > max) max = n
  }
  return max
}

/** Grind — gros volumes répétitifs (vaincre N ennemis, atteindre le rang N…). */
function grindScore(text: string): number {
  if (!GRIND_VERBS.test(text)) return 0
  const n = largestNumber(text)
  if (n < 50) return 0
  return clamp(8 * (Math.log10(n) - 1.3), 0, GRIND_CAP)
}

/** Contraintes de défi qui se cumulent par-dessus un palier (no-hit, solo, speedrun…). */
function challengeScore(text: string): number {
  let s = 0
  if (/sans subir|sans être|sans qu['e]|sans aucun|sans prendre|deathless|without taking|no[- ]?hit/.test(text))
    s += 18
  if (/\bsolo\b|en solitaire/.test(text)) s += 12
  if (/en moins de|in under|in less than/.test(text)) s += 10
  return Math.min(CHALLENGE_CAP, s)
}

/** Facteur de récence robuste même si le patch est absent de la table (gap 6.x). */
function patchFactor(patch: string | null, patchWeights: Record<string, number>): number {
  if (patch && patch in patchWeights) return patchWeights[patch]
  const major = Number((patch ?? '').split('.')[0]) || 0
  if (major >= 7) return 1.2
  if (major === 6) return 1.1
  if (major === 5) return 1.0
  if (major === 4) return 0.9
  if (major === 3) return 0.8
  return 0.5
}

/** Bonus de récence additif (0..RECENCY_CAP), du plus ancien (0) au plus récent. */
function recencyBonus(patch: string | null, patchWeights: Record<string, number>): number {
  const f = patchFactor(patch, patchWeights)
  return clamp(((f - 0.8) / 0.4) * RECENCY_CAP, 0, RECENCY_CAP)
}

// ============================================================================
// Fonctions principales
// ============================================================================

/**
 * Calcule la difficulté d'un haut fait unique.
 */
export function calculateDifficulty(
  achievement: Achievement,
  weights: DifficultyWeights = DEFAULT_WEIGHTS
): AchievementDifficulty {
  const points = achievement.points || 0
  const text = `${achievement.name || ''} ${achievement.description || ''}`.toLowerCase()

  // 1. Points — signal intégré de Square, courbe saturante (pas de runaway).
  const pointsScore = POINTS_CAP * (1 - Math.exp(-points / 40))

  // 2. Palier de contenu (Ultime/Sadique/Extrême…) — borné à TIER_CAP par construction.
  const tier = Math.min(TIER_CAP, tierScore(text))

  // 3. Grind (gros volumes répétitifs).
  const grind = grindScore(text)

  // 4. Contraintes de défi (no-hit, solo, speedrun).
  const challenge = challengeScore(text)

  // 5. Contexte type/catégorie — max() borné pour éviter le double comptage.
  const kindWeight = weights.kindWeights[achievement.kindId] ?? 0
  const categoryWeight = weights.categoryWeights[achievement.categoryId] ?? 0
  const context = Math.min(CONTEXT_CAP, Math.max(kindWeight, categoryWeight) * 0.3)

  // 6. Récence — petit bonus additif (et non un multiplicateur global).
  const recency = recencyBonus(achievement.patch, weights.patchWeights)

  // 7. Saisonnier/événementiel — contenu manquable, présence requise dans une fenêtre.
  const seasonal = achievement.isSeasonal ? SEASONAL_BONUS : 0

  const score = pointsScore + tier + grind + challenge + context + recency + seasonal

  return classifyDifficulty(score)
}

/**
 * Classifie le score en niveau de difficulté.
 */
function classifyDifficulty(score: number): AchievementDifficulty {
  for (const [level, threshold] of Object.entries(DIFFICULTY_THRESHOLDS)) {
    if (score >= threshold.min && score <= threshold.max) {
      return {
        score: Math.round(score * 10) / 10,
        level: level as DifficultyLevel,
        levelName: threshold.name,
        color: threshold.color,
        stars: threshold.stars
      }
    }
  }
  // Fallback pour les scores extrêmes
  const t = DIFFICULTY_THRESHOLDS.extreme
  return {
    score: Math.round(score * 10) / 10,
    level: 'extreme',
    levelName: t.name,
    color: t.color,
    stars: t.stars
  }
}

/**
 * Calcule la difficulté pour TOUS les hauts faits du catalogue.
 */
export function calculateAllDifficulties(
  achievements: Achievement[] = store.catalog.achievements,
  weights: DifficultyWeights = DEFAULT_WEIGHTS
): Map<number, AchievementDifficulty> {
  const difficulties = new Map<number, AchievementDifficulty>()
  for (const achievement of achievements) {
    difficulties.set(achievement.id, calculateDifficulty(achievement, weights))
  }
  return difficulties
}

/**
 * Met à jour les poids personnalisés.
 */
export function updateDifficultyWeights(
  customWeights: Partial<DifficultyWeights>
): DifficultyWeights {
  return {
    kindWeights: { ...DEFAULT_KIND_WEIGHTS, ...customWeights.kindWeights },
    categoryWeights: { ...DEFAULT_CATEGORY_WEIGHTS, ...customWeights.categoryWeights },
    patchWeights: { ...DEFAULT_PATCH_WEIGHTS, ...customWeights.patchWeights }
  }
}

/**
 * Statistiques de difficulté pour le dashboard.
 */
export function getDifficultyStats(difficulties: Map<number, AchievementDifficulty>): {
  total: number
  byLevel: Record<DifficultyLevel, number>
  averageScore: number
  hardest: { id: number; name: string; score: number } | null
  easiest: { id: number; name: string; score: number } | null
} {
  const byLevel: Record<DifficultyLevel, number> = {
    very_easy: 0,
    easy: 0,
    medium: 0,
    hard: 0,
    very_hard: 0,
    extreme: 0
  }

  let totalScore = 0
  let hardest: { id: number; name: string; score: number } | null = null
  let easiest: { id: number; name: string; score: number } | null = null

  for (const [id, difficulty] of difficulties) {
    const achievement = store.catalog.achievements.find((a) => a.id === id)
    if (!achievement) continue

    byLevel[difficulty.level]++
    totalScore += difficulty.score

    if (!hardest || difficulty.score > hardest.score) {
      hardest = { id, name: achievement.name, score: difficulty.score }
    }
    if (!easiest || difficulty.score < easiest.score) {
      easiest = { id, name: achievement.name, score: difficulty.score }
    }
  }

  const total = difficulties.size
  const averageScore = total > 0 ? totalScore / total : 0

  return {
    total,
    byLevel,
    averageScore: Math.round(averageScore * 10) / 10,
    hardest,
    easiest
  }
}

/**
 * Filtre les hauts faits par niveau de difficulté.
 */
export function filterByDifficulty(
  difficulties: Map<number, AchievementDifficulty>,
  level: DifficultyLevel | null = null
): number[] {
  if (!level) return Array.from(difficulties.keys())
  const filtered: number[] = []
  for (const [id, difficulty] of difficulties) {
    if (difficulty.level === level) filtered.push(id)
  }
  return filtered
}

/**
 * Trie les hauts faits par difficulté (du plus facile au plus difficile par défaut).
 */
export function sortByDifficulty(
  difficulties: Map<number, AchievementDifficulty>,
  direction: 'asc' | 'desc' = 'asc'
): number[] {
  return Array.from(difficulties.entries())
    .sort((a, b) => (direction === 'asc' ? a[1].score - b[1].score : b[1].score - a[1].score))
    .map(([id]) => id)
}
