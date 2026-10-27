import { vi } from 'vitest'

/**
 * jsdom has no layout, so the real virtualizer renders nothing.
 * This stand-in renders every item at a fixed height.
 */
export const virtualMock = {
  useVirtualizer: (opts: { count: number; estimateSize: (i: number) => number }) => {
    const items = Array.from({ length: opts.count }, (_, index) => ({
      index,
      key: index,
      start: index * opts.estimateSize(index),
      size: opts.estimateSize(index)
    }))
    return {
      getVirtualItems: () => items,
      getTotalSize: () => items.reduce((n, i) => n + i.size, 0),
      measureElement: vi.fn(),
      scrollToIndex: vi.fn()
    }
  }
}
