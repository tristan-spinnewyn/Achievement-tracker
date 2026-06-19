import type { RecurringType } from './types'

/**
 * Resets FFXIV — fixes en UTC, donc robustes au changement d'heure (été/hiver) :
 *   - Quotidien : 15:00 UTC  (= 17 h heure de Paris en été, 16 h en hiver)
 *   - Hebdomadaire : mardi 08:00 UTC  (= mardi 10 h en été, 9 h en hiver)
 *   - Ravitaillement (missions de grande compagnie) : 20:00 UTC
 *       (= 22 h heure de Paris en été, 21 h en hiver) — `daily22`.
 */
const DAY_MS = 86_400_000
const DAILY_RESET_UTC_HOUR = 15
const WEEKLY_RESET_UTC_HOUR = 8
const WEEKLY_RESET_UTC_DAY = 2 // mardi (dim = 0)
const SUPPLY_RESET_UTC_HOUR = 20 // missions de ravitaillement GC

export function lastDailyReset(now: Date = new Date()): Date {
  const r = new Date(now)
  r.setUTCHours(DAILY_RESET_UTC_HOUR, 0, 0, 0)
  if (r.getTime() > now.getTime()) r.setUTCDate(r.getUTCDate() - 1)
  return r
}

export function nextDailyReset(now: Date = new Date()): Date {
  return new Date(lastDailyReset(now).getTime() + DAY_MS)
}

export function lastWeeklyReset(now: Date = new Date()): Date {
  const r = new Date(now)
  r.setUTCHours(WEEKLY_RESET_UTC_HOUR, 0, 0, 0)
  const daysSince = (r.getUTCDay() - WEEKLY_RESET_UTC_DAY + 7) % 7
  r.setUTCDate(r.getUTCDate() - daysSince)
  if (r.getTime() > now.getTime()) r.setUTCDate(r.getUTCDate() - 7)
  return r
}

export function nextWeeklyReset(now: Date = new Date()): Date {
  return new Date(lastWeeklyReset(now).getTime() + 7 * DAY_MS)
}

/** Reset des missions de ravitaillement GC : 20:00 UTC fixe (= 22 h Paris été / 21 h hiver). */
export function lastDaily22Reset(now: Date = new Date()): Date {
  const r = new Date(now)
  r.setUTCHours(SUPPLY_RESET_UTC_HOUR, 0, 0, 0)
  if (r.getTime() > now.getTime()) r.setUTCDate(r.getUTCDate() - 1)
  return r
}

export function nextDaily22Reset(now: Date = new Date()): Date {
  return new Date(lastDaily22Reset(now).getTime() + DAY_MS)
}

export function periodStart(type: RecurringType, now: Date = new Date()): Date {
  if (type === 'weekly') return lastWeeklyReset(now)
  if (type === 'daily22') return lastDaily22Reset(now)
  return lastDailyReset(now)
}

export function nextReset(type: RecurringType, now: Date = new Date()): Date {
  if (type === 'weekly') return nextWeeklyReset(now)
  if (type === 'daily22') return nextDaily22Reset(now)
  return nextDailyReset(now)
}

/** Début de la période PRÉCÉDENTE (utile pour le calcul des séries/streaks). */
export function previousPeriodStart(type: RecurringType, now: Date = new Date()): Date {
  const cur = periodStart(type, now)
  return periodStart(type, new Date(cur.getTime() - 1))
}

/** Une tâche est « faite » si sa dernière validation est postérieure au début de la période courante. */
export function isDoneThisPeriod(
  type: RecurringType,
  lastCompletedAt: string | null,
  now: Date = new Date()
): boolean {
  if (!lastCompletedAt) return false
  return new Date(lastCompletedAt).getTime() >= periodStart(type, now).getTime()
}
