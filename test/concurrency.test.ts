import { describe, expect, it } from 'vitest'
import { mapLimit } from '../src/main/utils/concurrency'

describe('mapLimit', () => {
  it('keeps input order in the results', async () => {
    const res = await mapLimit([30, 10, 20], 2, async (ms) => {
      await new Promise((r) => setTimeout(r, ms))
      return ms * 2
    })
    expect(res).toEqual([60, 20, 40])
  })

  it('never runs more than `limit` tasks at once', async () => {
    let running = 0
    let peak = 0
    await mapLimit([1, 2, 3, 4, 5, 6], 3, async () => {
      running++
      peak = Math.max(peak, running)
      await new Promise((r) => setTimeout(r, 5))
      running--
    })
    expect(peak).toBe(3)
  })

  it('handles an empty list', async () => {
    expect(await mapLimit([], 4, async (x) => x)).toEqual([])
  })
})
