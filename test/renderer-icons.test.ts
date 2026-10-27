import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const api = {
  icons: {
    prefetch: vi.fn(async () => {}),
    getUrl: vi.fn(async (p: string) => `file:///cache/${p}`)
  }
}

type IconsModule = typeof import('../src/renderer/src/lib/icons')
let icons: IconsModule

beforeEach(async () => {
  // Module reloaded for each test: the internal cache starts empty.
  vi.resetModules()
  vi.stubGlobal('window', { api })
  api.icons.prefetch.mockClear()
  api.icons.getUrl.mockClear()
  icons = await import('../src/renderer/src/lib/icons')
})

afterEach(() => vi.unstubAllGlobals())

describe('icons (renderer)', () => {
  it('iconUrl falls back to remote URLs when not cached', () => {
    expect(icons.iconUrl(null)).toBeNull()
    expect(icons.iconUrl('ui/icon/000001.tex')).toBe(
      'https://v2.xivapi.com/api/asset?path=ui%2Ficon%2F000001.tex&format=png'
    )
    expect(icons.iconUrl('/ui/icon/x.tex')).toBe('https://v2.xivapi.com/api/asset?path=ui%2Ficon%2Fx.tex&format=png')
    expect(icons.iconUrl('/i/000000/1.png')).toBe('https://xivapi.com/i/000000/1.png')
  })

  it('iconUrlAsync resolves via IPC only once then serves the cache', async () => {
    expect(await icons.iconUrlAsync(null)).toBeNull()
    expect(await icons.iconUrlAsync('ui/a.tex')).toBe('file:///cache/ui/a.tex')
    expect(await icons.iconUrlAsync('ui/a.tex')).toBe('file:///cache/ui/a.tex')
    expect(api.icons.getUrl).toHaveBeenCalledTimes(1)
    expect(icons.iconUrl('ui/a.tex')).toBe('file:///cache/ui/a.tex')
  })

  it('prefetchIconUrls deduplicates, ignores nulls and fills the cache', async () => {
    await icons.prefetchIconUrls(['ui/a.tex', null, 'ui/a.tex', 'ui/b.tex'])
    expect(api.icons.prefetch).toHaveBeenCalledWith(['ui/a.tex', 'ui/b.tex'])
    expect(api.icons.getUrl).toHaveBeenCalledTimes(2)
    expect(icons.iconUrl('ui/b.tex')).toBe('file:///cache/ui/b.tex')
  })
})
