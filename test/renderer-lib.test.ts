import { describe, it, expect } from 'vitest'
import { formatCountdown } from '../src/renderer/src/lib/time'
import { nextPriority, PRIORITY_LABELS } from '../src/renderer/src/lib/priority'
import { achievementExternalUrl, collectionExternalUrl } from '../src/renderer/src/lib/external'

describe('formatCountdown', () => {
  it('formats as HH:MM:SS under 24 h and in days beyond', () => {
    expect(formatCountdown(0)).toBe('00:00:00')
    expect(formatCountdown(-5000)).toBe('00:00:00')
    expect(formatCountdown((3600 + 2 * 60 + 3) * 1000)).toBe('01:02:03')
    expect(formatCountdown((2 * 86400 + 5 * 3600 + 7 * 60) * 1000)).toBe('2j 5h 7m')
  })
})

describe('priorities', () => {
  it('cycles from 0 to 3 then back to 0', () => {
    expect([0, 1, 2, 3].map((p) => nextPriority(p as 0 | 1 | 2 | 3))).toEqual([1, 2, 3, 0])
    expect(PRIORITY_LABELS[3]).toBe('Haute')
  })
})

describe('external links', () => {
  it('always points to known HTTPS hosts, with an encoded name', () => {
    expect(achievementExternalUrl(12)).toBe('https://ffxivcollect.com/achievements/12')
    expect(collectionExternalUrl('mount', 5, 'x')).toBe('https://ffxivcollect.com/mounts/5')
    expect(collectionExternalUrl('card' as never, 5, 'a&b c')).toBe(
      'https://ffxiv.gamerescape.com/w/index.php?search=a%26b%20c'
    )
  })
})
