/**
 * Difficulty scoring algorithm for FFXIV achievements.
 *
 * Bounded additive model: independent components are summed, each one
 * capped, rather than multiplying the whole score by a patch factor
 * (the previous approach conflated "recent" with "difficult").
 *
 *   difficulty = points + content tier + grind + challenge
 *              + context (kind/category) + recency + seasonal
 *
 * The dominant signal in FFXIV is not the point count (an Ultimate ≈ 50 pts,
 * a Savage ≈ 10 pts) but the content TIER (Ultimate/Savage/Extreme) and the
 * GRIND ("defeat 10,000 enemies"), often spelled out in the achievement NAME.
 */

import { store } from '../data/store'
import type {
  Achievement,
  AchievementDifficulty,
  DifficultyLevel,
  DifficultyWeights
} from '@shared/types'

// ============================================================================
// Default context weights (customisable via settings)
// Note: these weights are no longer a raw score but a bounded contextual
// *nudge* (see CONTEXT_CAP). We take max(kind, category) to avoid
// double-counting kind + category.
// ============================================================================

/** Weight per kind (kindId) — the more demanding the kind, the higher the weight. */
export const DEFAULT_KIND_WEIGHTS: Record<number, number> = {
  0: 0,   // Unknown / unclassified
  1: 30,  // Battle (PvE)
  2: 25,  // JcJ (PvP)
  3: 10,  // Character (levels, jobs)
  4: 15,  // Items (item collection)
  5: 20,  // Crafting & gathering
  8: 5,   // Quests
  11: 20, // Exploration
  12: 25, // Grand Companies
  13: 40  // Legacy (old / rare content)
}

/** Weight per category — some categories are more demanding than others. */
export const DEFAULT_CATEGORY_WEIGHTS: Record<number, number> = {
  // ========== Battle (kindId: 1) ==========
  54: 40, // General battle
  5: 45,  // Hunts
  6: 40,  // Treasure hunts
  2: 35,  // Dungeons
  10: 38, // Frontline (PvP)
  9: 37,  // The Wolves' Den (FATEs)
  3: 50,  // Trials
  4: 55,  // Raids (normal)
  // ========== Character (kindId: 3) ==========
  12: 10, // General
  13: 15, // Disciples of War
  14: 15, // Disciples of Magic
  15: 20, // Disciples of the Hand
  16: 20, // Disciples of the Land
  // ========== Items (kindId: 4) ==========
  19: 15, // General (Items)
  20: 18, // Currencies
  21: 22, // Desynthesis
  22: 20, // Collectables
  23: 25, // Materia
  62: 60, // Relic weapons (ARR)
  63: 60, // Zodiac weapons
  64: 65, // Anima weapons
  65: 65, // Eureka weapons
  68: 65, // Resistance weapons
  70: 28, // Skysteel tools
  75: 70, // Manderville weapons
  78: 30, // Splendorous tools
  81: 70, // Phantom weapons
  82: 35, // Cosmic tools
  // ========== Crafting & gathering (kindId: 5) ==========
  69: 25, // All classes
  24: 30, // Carpenter
  25: 30, // Blacksmith
  26: 30, // Armorer
  27: 30, // Goldsmith
  28: 30, // Leatherworker
  29: 30, // Weaver
  30: 30, // Alchemist
  31: 30, // Culinarian
  32: 35, // Miner
  33: 35, // Botanist
  34: 35, // Fisher
  // ========== Quests (kindId: 8) ==========
  35: 10, // General (Quests)
  36: 12, // Levequests
  37: 15, // Allied society quests
  38: 18, // Seasonal events
  // ========== Exploration (kindId: 11) ==========
  39: 25, // Sightseeing log
  40: 22, // Noscea
  41: 22, // Black Shroud
  42: 22, // Thanalan
  43: 22, // Coerthas
  45: 22, // Abalathia
  46: 22, // Dravania
  47: 22, // Gyr Abania
  48: 22, // Othard
  71: 30, // Exploration missions
  72: 25, // Northern seas
  73: 25, // Ilsabard
  74: 15, // Other
  76: 18, // Job / role quests
  77: 18, // Maelstrom quests
  79: 20, // Yok Tural
  80: 20, // Xak Tural
  // ========== Grand Companies (kindId: 12) ==========
  50: 20, // General
  51: 25, // Maelstrom
  52: 25, // Order of the Twin Adder
  53: 25  // Immortal Flames
}

/**
 * Recency factor per patch — only used for a small additive bonus
 * (latest expansion content is slightly harder: under-geared,
 * new mechanics). ~0.5 (oldest) .. 1.2 (most recent).
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
// Component caps (the sum lines up with the classification thresholds)
// ============================================================================

const POINTS_CAP = 35
const TIER_CAP = 80
const GRIND_CAP = 25
const CHALLENGE_CAP = 20
const CONTEXT_CAP = 20
const RECENCY_CAP = 8
const SEASONAL_BONUS = 8

// ============================================================================
// Classification constants
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
// Text analysis helpers (name + description, FR and EN)
// ============================================================================

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v))

/**
 * Content tier — the strongest difficulty signal. We take the highest
 * matching tier (not a sum).
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

/** Merges thousands groups (10 000) then returns the largest integer. */
function largestNumber(text: string): number {
  const normalized = text.replace(/(\d)[\s,](?=\d{3}\b)/g, '$1')
  let max = 0
  for (const m of normalized.matchAll(/\d+/g)) {
    const n = Number(m[0])
    if (n > max) max = n
  }
  return max
}

/** Grind — large repetitive volumes (defeat N enemies, reach rank N…). */
function grindScore(text: string): number {
  if (!GRIND_VERBS.test(text)) return 0
  const n = largestNumber(text)
  if (n < 50) return 0
  return clamp(8 * (Math.log10(n) - 1.3), 0, GRIND_CAP)
}

/** Challenge constraints that stack on top of a tier (no-hit, solo, speedrun…). */
function challengeScore(text: string): number {
  let s = 0
  if (/sans subir|sans être|sans qu['e]|sans aucun|sans prendre|deathless|without taking|no[- ]?hit/.test(text))
    s += 18
  if (/\bsolo\b|en solitaire/.test(text)) s += 12
  if (/en moins de|in under|in less than/.test(text)) s += 10
  return Math.min(CHALLENGE_CAP, s)
}

/** Recency factor that stays robust when the patch is missing from the table (6.x gap). */
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

/** Additive recency bonus (0..RECENCY_CAP), from oldest (0) to most recent. */
function recencyBonus(patch: string | null, patchWeights: Record<string, number>): number {
  const f = patchFactor(patch, patchWeights)
  return clamp(((f - 0.8) / 0.4) * RECENCY_CAP, 0, RECENCY_CAP)
}

// ============================================================================
// Main functions
// ============================================================================

/**
 * Computes the difficulty of a single achievement.
 */
export function calculateDifficulty(
  achievement: Achievement,
  weights: DifficultyWeights = DEFAULT_WEIGHTS
): AchievementDifficulty {
  const points = achievement.points || 0
  const text = `${achievement.name || ''} ${achievement.description || ''}`.toLowerCase()

  // 1. Points — Square's built-in signal, saturating curve (no runaway).
  const pointsScore = POINTS_CAP * (1 - Math.exp(-points / 40))

  // 2. Content tier (Ultimate/Savage/Extreme…) — bounded by TIER_CAP by design.
  const tier = Math.min(TIER_CAP, tierScore(text))

  // 3. Grind (large repetitive volumes).
  const grind = grindScore(text)

  // 4. Challenge constraints (no-hit, solo, speedrun).
  const challenge = challengeScore(text)

  // 5. Kind/category context — bounded max() to avoid double-counting.
  const kindWeight = weights.kindWeights[achievement.kindId] ?? 0
  const categoryWeight = weights.categoryWeights[achievement.categoryId] ?? 0
  const context = Math.min(CONTEXT_CAP, Math.max(kindWeight, categoryWeight) * 0.3)

  // 6. Recency — small additive bonus (not a global multiplier).
  const recency = recencyBonus(achievement.patch, weights.patchWeights)

  // 7. Seasonal / event — missable content, requires being present during a window.
  const seasonal = achievement.isSeasonal ? SEASONAL_BONUS : 0

  const score = pointsScore + tier + grind + challenge + context + recency + seasonal

  return classifyDifficulty(score)
}

/**
 * Classifies the score into a difficulty level.
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
  // Fallback for extreme scores
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
 * Computes the difficulty of ALL achievements in the catalog.
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
 * Updates the custom weights.
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
 * Difficulty statistics for the dashboard.
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
 * Filters achievements by difficulty level.
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
 * Sorts achievements by difficulty (easiest to hardest by default).
 */
export function sortByDifficulty(
  difficulties: Map<number, AchievementDifficulty>,
  direction: 'asc' | 'desc' = 'asc'
): number[] {
  return Array.from(difficulties.entries())
    .sort((a, b) => (direction === 'asc' ? a[1].score - b[1].score : b[1].score - a[1].score))
    .map(([id]) => id)
}
