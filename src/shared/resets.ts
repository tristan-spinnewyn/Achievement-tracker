import type { RecurringType } from './types'

/**
 * FFXIV resets — fixed in UTC, so robust to daylight saving changes:
 *   - Daily: 15:00 UTC  (= 17:00 Paris time in summer, 16:00 in winter)
 *   - Weekly: Tuesday 08:00 UTC  (= Tuesday 10:00 in summer, 09:00 in winter)
 *   - Supply (Grand Company missions): 20:00 UTC
 *       (= 22:00 Paris time in summer, 21:00 in winter) — `daily22`.
 */
const DAY_MS = 86_400_000
const DAILY_RESET_UTC_HOUR = 15
const WEEKLY_RESET_UTC_HOUR = 8
const WEEKLY_RESET_UTC_DAY = 2 // Tuesday (Sun = 0)
const SUPPLY_RESET_UTC_HOUR = 20 // GC supply missions

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

/** GC supply mission reset: fixed 20:00 UTC (= 22:00 Paris summer / 21:00 winter). */
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

/** Start of the PREVIOUS period (useful to compute streaks). */
export function previousPeriodStart(type: RecurringType, now: Date = new Date()): Date {
  const cur = periodStart(type, now)
  return periodStart(type, new Date(cur.getTime() - 1))
}

/** A task is "done" if its last check is after the start of the current period. */
export function isDoneThisPeriod(
  type: RecurringType,
  lastCompletedAt: string | null,
  now: Date = new Date()
): boolean {
  if (!lastCompletedAt) return false
  return new Date(lastCompletedAt).getTime() >= periodStart(type, now).getTime()
}
