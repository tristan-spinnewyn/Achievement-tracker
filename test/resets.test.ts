import { describe, it, expect } from 'vitest'
import {
  lastDailyReset,
  nextDailyReset,
  lastWeeklyReset,
  nextWeeklyReset,
  lastDaily22Reset,
  nextDaily22Reset,
  periodStart,
  previousPeriodStart,
  nextReset,
  isDoneThisPeriod
} from '@shared/resets'

const DAY_MS = 86_400_000

describe('daily reset (15:00 UTC)', () => {
  it('returns the last 15:00 UTC that has passed', () => {
    const r = lastDailyReset(new Date('2026-06-19T18:00:00Z'))
    expect(r.toISOString()).toBe('2026-06-19T15:00:00.000Z')
  })

  it('goes back one day before 15:00 UTC', () => {
    const r = lastDailyReset(new Date('2026-06-19T10:00:00Z'))
    expect(r.toISOString()).toBe('2026-06-18T15:00:00.000Z')
  })

  it('the next reset is 24 h after the last one', () => {
    const now = new Date('2026-06-19T18:00:00Z')
    expect(nextDailyReset(now).getTime() - lastDailyReset(now).getTime()).toBe(DAY_MS)
  })
})

describe('weekly reset (Tuesday 08:00 UTC)', () => {
  it('always falls on a Tuesday', () => {
    // 2026-06-19 is a Friday
    const r = lastWeeklyReset(new Date('2026-06-19T18:00:00Z'))
    expect(r.getUTCDay()).toBe(2) // Tuesday
    expect(r.getUTCHours()).toBe(8)
    expect(r.toISOString()).toBe('2026-06-16T08:00:00.000Z')
  })

  it('the next reset is 7 days after the last one', () => {
    const now = new Date('2026-06-19T18:00:00Z')
    expect(nextWeeklyReset(now).getTime() - lastWeeklyReset(now).getTime()).toBe(7 * DAY_MS)
  })
})

describe('supply reset (20:00 UTC = 22:00 Paris summer / 21:00 winter)', () => {
  it('is fixed at 20:00 UTC', () => {
    const r = lastDaily22Reset(new Date('2026-06-19T21:00:00Z'))
    expect(r.toISOString()).toBe('2026-06-19T20:00:00.000Z')
  })

  it('shows as 22:00 Paris time in summer (CEST, UTC+2)', () => {
    const next = nextDaily22Reset(new Date('2026-06-19T18:00:00Z'))
    const paris = next.toLocaleString('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', hour12: false })
    expect(paris).toContain('22')
  })

  it('shows as 21:00 Paris time in winter (CET, UTC+1)', () => {
    const next = nextDaily22Reset(new Date('2026-01-15T18:00:00Z'))
    const paris = next.toLocaleString('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', hour12: false })
    expect(paris).toContain('21')
  })

  it('goes back one day before 20:00 UTC', () => {
    const r = lastDaily22Reset(new Date('2026-06-19T10:00:00Z'))
    expect(r.toISOString()).toBe('2026-06-18T20:00:00.000Z')
  })
})

describe('periodStart / nextReset routing', () => {
  const now = new Date('2026-06-19T18:00:00Z')
  it('periodStart routes by type', () => {
    expect(periodStart('daily', now).toISOString()).toBe(lastDailyReset(now).toISOString())
    expect(periodStart('weekly', now).toISOString()).toBe(lastWeeklyReset(now).toISOString())
    expect(periodStart('daily22', now).toISOString()).toBe(lastDaily22Reset(now).toISOString())
  })
  it('nextReset routes by type', () => {
    expect(nextReset('daily', now).toISOString()).toBe(nextDailyReset(now).toISOString())
    expect(nextReset('weekly', now).toISOString()).toBe(nextWeeklyReset(now).toISOString())
    expect(nextReset('daily22', now).toISOString()).toBe(nextDaily22Reset(now).toISOString())
  })
})

describe('previousPeriodStart (basis for streaks)', () => {
  const now = new Date('2026-06-19T18:00:00Z')

  it('daily: previous period = the day before at 15:00 UTC', () => {
    const prev = previousPeriodStart('daily', now)
    expect(prev.toISOString()).toBe('2026-06-18T15:00:00.000Z')
  })

  it('weekly: previous period = the Tuesday before', () => {
    const prev = previousPeriodStart('weekly', now)
    expect(prev.toISOString()).toBe('2026-06-09T08:00:00.000Z')
  })

  it('supply: at 18:00 UTC the current period started the day before at 20:00, so the previous one is two days before', () => {
    // now = 19/06 18:00 UTC < 20:00 → current period started 18/06 20:00 → previous one 17/06 20:00.
    const prev = previousPeriodStart('daily22', now)
    expect(prev.toISOString()).toBe('2026-06-17T20:00:00.000Z')
  })

  it('is exactly one period before periodStart', () => {
    const cur = periodStart('daily', now)
    const prev = previousPeriodStart('daily', now)
    expect(cur.getTime() - prev.getTime()).toBe(DAY_MS)
  })
})

describe('isDoneThisPeriod', () => {
  const now = new Date('2026-06-19T18:00:00Z') // after the 15:00 UTC daily reset

  it('false if never checked', () => {
    expect(isDoneThisPeriod('daily', null, now)).toBe(false)
  })

  it('true if checked after the period start', () => {
    expect(isDoneThisPeriod('daily', '2026-06-19T16:00:00Z', now)).toBe(true)
  })

  it('false if checked before the period start', () => {
    expect(isDoneThisPeriod('daily', '2026-06-19T14:00:00Z', now)).toBe(false)
  })

  it('supply: a check at 19:00 UTC no longer counts after 20:00 UTC', () => {
    const after = new Date('2026-06-19T21:00:00Z')
    expect(isDoneThisPeriod('daily22', '2026-06-19T19:00:00Z', after)).toBe(false)
    expect(isDoneThisPeriod('daily22', '2026-06-19T20:30:00Z', after)).toBe(true)
  })
})
