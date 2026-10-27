/**
 * Name / patch helpers shared by the main process and the build scripts.
 * Pure module (no alias imports) so `tsx scripts/*.ts` can load it as-is.
 */

/** Normalises a name for Lodestone matching (accents, apostrophes, whitespace). */
export function normalizeName(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Patch sort key ("7.51" -> 751, "7.5" -> 750, "2.0" -> 200).
 * A single digit after the dot = tenths (×10). null/unknown -> -1 (sorted last).
 */
export function patchSortKey(patch: string | null): number {
  if (!patch) return -1
  const [maj, min = '0'] = patch.split('.')
  const m = min.match(/^(\d+)([a-z]?)$/i)
  const digits = m ? m[1] : '0'
  const letter = m && m[2] ? m[2].toLowerCase().charCodeAt(0) - 96 : 0
  const base = digits.length === 1 ? Number(digits) * 10 : Number(digits)
  return Number(maj) * 100 + (Number.isFinite(base) ? base : 0) + letter * 0.1
}
