import { describe, it, expect } from 'vitest'
import { formatCountdown } from '../src/renderer/src/lib/time'
import { nextPriority, PRIORITY_LABELS } from '../src/renderer/src/lib/priority'
import { achievementExternalUrl, collectionExternalUrl } from '../src/renderer/src/lib/external'

describe('formatCountdown', () => {
  it('formate en HH:MM:SS sous 24 h et en jours au-delà', () => {
    expect(formatCountdown(0)).toBe('00:00:00')
    expect(formatCountdown(-5000)).toBe('00:00:00')
    expect(formatCountdown((3600 + 2 * 60 + 3) * 1000)).toBe('01:02:03')
    expect(formatCountdown((2 * 86400 + 5 * 3600 + 7 * 60) * 1000)).toBe('2j 5h 7m')
  })
})

describe('priorités', () => {
  it('cycle de 0 à 3 puis revient à 0', () => {
    expect([0, 1, 2, 3].map((p) => nextPriority(p as 0 | 1 | 2 | 3))).toEqual([1, 2, 3, 0])
    expect(PRIORITY_LABELS[3]).toBe('Haute')
  })
})

describe('liens externes', () => {
  it('pointe toujours vers des hôtes HTTPS connus, nom encodé', () => {
    expect(achievementExternalUrl(12)).toBe('https://ffxivcollect.com/achievements/12')
    expect(collectionExternalUrl('mount', 5, 'x')).toBe('https://ffxivcollect.com/mounts/5')
    expect(collectionExternalUrl('card' as never, 5, 'a&b c')).toBe(
      'https://ffxiv.gamerescape.com/w/index.php?search=a%26b%20c'
    )
  })
})
