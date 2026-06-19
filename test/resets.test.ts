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

describe('reset quotidien (15:00 UTC)', () => {
  it('renvoie le dernier 15:00 UTC passé', () => {
    const r = lastDailyReset(new Date('2026-06-19T18:00:00Z'))
    expect(r.toISOString()).toBe('2026-06-19T15:00:00.000Z')
  })

  it('recule d’un jour avant 15:00 UTC', () => {
    const r = lastDailyReset(new Date('2026-06-19T10:00:00Z'))
    expect(r.toISOString()).toBe('2026-06-18T15:00:00.000Z')
  })

  it('le prochain reset est 24 h après le dernier', () => {
    const now = new Date('2026-06-19T18:00:00Z')
    expect(nextDailyReset(now).getTime() - lastDailyReset(now).getTime()).toBe(DAY_MS)
  })
})

describe('reset hebdomadaire (mardi 08:00 UTC)', () => {
  it('tombe toujours un mardi', () => {
    // 2026-06-19 est un vendredi
    const r = lastWeeklyReset(new Date('2026-06-19T18:00:00Z'))
    expect(r.getUTCDay()).toBe(2) // mardi
    expect(r.getUTCHours()).toBe(8)
    expect(r.toISOString()).toBe('2026-06-16T08:00:00.000Z')
  })

  it('le prochain reset est 7 jours après le dernier', () => {
    const now = new Date('2026-06-19T18:00:00Z')
    expect(nextWeeklyReset(now).getTime() - lastWeeklyReset(now).getTime()).toBe(7 * DAY_MS)
  })
})

describe('reset ravitaillement (20:00 UTC = 22 h Paris été / 21 h hiver)', () => {
  it('est fixé à 20:00 UTC', () => {
    const r = lastDaily22Reset(new Date('2026-06-19T21:00:00Z'))
    expect(r.toISOString()).toBe('2026-06-19T20:00:00.000Z')
  })

  it('s’affiche 22:00 heure de Paris en été (CEST, UTC+2)', () => {
    const next = nextDaily22Reset(new Date('2026-06-19T18:00:00Z'))
    const paris = next.toLocaleString('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', hour12: false })
    expect(paris).toContain('22')
  })

  it('s’affiche 21:00 heure de Paris en hiver (CET, UTC+1)', () => {
    const next = nextDaily22Reset(new Date('2026-01-15T18:00:00Z'))
    const paris = next.toLocaleString('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', hour12: false })
    expect(paris).toContain('21')
  })

  it('recule d’un jour avant 20:00 UTC', () => {
    const r = lastDaily22Reset(new Date('2026-06-19T10:00:00Z'))
    expect(r.toISOString()).toBe('2026-06-18T20:00:00.000Z')
  })
})

describe('routage periodStart / nextReset', () => {
  const now = new Date('2026-06-19T18:00:00Z')
  it('periodStart route selon le type', () => {
    expect(periodStart('daily', now).toISOString()).toBe(lastDailyReset(now).toISOString())
    expect(periodStart('weekly', now).toISOString()).toBe(lastWeeklyReset(now).toISOString())
    expect(periodStart('daily22', now).toISOString()).toBe(lastDaily22Reset(now).toISOString())
  })
  it('nextReset route selon le type', () => {
    expect(nextReset('daily', now).toISOString()).toBe(nextDailyReset(now).toISOString())
    expect(nextReset('weekly', now).toISOString()).toBe(nextWeeklyReset(now).toISOString())
    expect(nextReset('daily22', now).toISOString()).toBe(nextDaily22Reset(now).toISOString())
  })
})

describe('previousPeriodStart (base des séries/streaks)', () => {
  const now = new Date('2026-06-19T18:00:00Z')

  it('quotidien : période précédente = la veille à 15:00 UTC', () => {
    const prev = previousPeriodStart('daily', now)
    expect(prev.toISOString()).toBe('2026-06-18T15:00:00.000Z')
  })

  it('hebdo : période précédente = le mardi d’avant', () => {
    const prev = previousPeriodStart('weekly', now)
    expect(prev.toISOString()).toBe('2026-06-09T08:00:00.000Z')
  })

  it('ravitaillement : à 18:00 UTC la période courante a commencé la veille 20:00, donc la précédente est l’avant-veille', () => {
    // now = 19/06 18:00 UTC < 20:00 → période courante débutée le 18/06 20:00 → précédente le 17/06 20:00.
    const prev = previousPeriodStart('daily22', now)
    expect(prev.toISOString()).toBe('2026-06-17T20:00:00.000Z')
  })

  it('est exactement une période avant periodStart', () => {
    const cur = periodStart('daily', now)
    const prev = previousPeriodStart('daily', now)
    expect(cur.getTime() - prev.getTime()).toBe(DAY_MS)
  })
})

describe('isDoneThisPeriod', () => {
  const now = new Date('2026-06-19T18:00:00Z') // après le reset quotidien 15:00 UTC

  it('false si jamais validé', () => {
    expect(isDoneThisPeriod('daily', null, now)).toBe(false)
  })

  it('true si validé après le début de période', () => {
    expect(isDoneThisPeriod('daily', '2026-06-19T16:00:00Z', now)).toBe(true)
  })

  it('false si validé avant le début de période', () => {
    expect(isDoneThisPeriod('daily', '2026-06-19T14:00:00Z', now)).toBe(false)
  })

  it('ravitaillement : la validation à 19:00 UTC ne compte plus après 20:00 UTC', () => {
    const after = new Date('2026-06-19T21:00:00Z')
    expect(isDoneThisPeriod('daily22', '2026-06-19T19:00:00Z', after)).toBe(false)
    expect(isDoneThisPeriod('daily22', '2026-06-19T20:30:00Z', after)).toBe(true)
  })
})
