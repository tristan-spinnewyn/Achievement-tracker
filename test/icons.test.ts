import { describe, it, expect, vi, afterEach } from 'vitest'
import { existsSync, readdirSync, rmSync } from 'fs'
import { join } from 'path'
import { TEST_USER_DATA } from './stubs/electron'
import {
  getIconPath,
  getIconPathWithDownload,
  getIconUrl,
  iconPathToFilename,
  isSafeIconPath,
  prefetchIcons,
  remoteAssetUrl
} from '../src/main/utils/icons'

const CACHE_DIR = join(TEST_USER_DATA, 'icon-cache')
const TEST_ICON = 'ui/icon/999000/999001.tex'

function mockFetchPng(): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn().mockResolvedValue(new Response(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), { status: 200 }))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

afterEach(() => {
  vi.unstubAllGlobals()
  rmSync(join(CACHE_DIR, 'ui_icon_999000_999001.tex'), { force: true })
})

describe('isSafeIconPath', () => {
  it.each(['ui/icon/062000/062904.tex', '/ui/icon/062000/062904.tex', '/i/000000/000123.png'])(
    'accepte un chemin XIVAPI légitime : %s',
    (p) => expect(isSafeIconPath(p)).toBe(true)
  )

  it.each([
    '../../evil.png',
    'ui/../../evil.png',
    '..\\..\\AppData\\evil.exe',
    'C:\\Windows\\evil.png',
    'https://evil.example/icon.png',
    'ui/icon/x.tex:stream',
    'ui//icon.tex',
    'noextension',
    '',
    'a/'.repeat(200) + 'b.png'
  ])('rejects a dangerous or invalid path: %s', (p) => expect(isSafeIconPath(p)).toBe(false))

  it('rejects non-string values', () => {
    expect(isSafeIconPath(null)).toBe(false)
    expect(isSafeIconPath(undefined)).toBe(false)
    expect(isSafeIconPath(42 as unknown as string)).toBe(false)
  })
})

describe('iconPathToFilename / remoteAssetUrl', () => {
  it('flattens the path into a file name without separators', () => {
    expect(iconPathToFilename('ui/icon/062000/062904.tex')).toBe('ui_icon_062000_062904.tex')
    expect(iconPathToFilename('/i/000000/000123.png')).toBe('000000_000123.png')
    expect(iconPathToFilename('../../evil.png')).toBeNull()
  })

  it('builds the XIVAPI v2 URL with a relative path (the API returns 404 otherwise)', () => {
    expect(remoteAssetUrl('/ui/icon/062000/062904.tex')).toBe(
      'https://v2.xivapi.com/api/asset?path=ui%2Ficon%2F062000%2F062904.tex&format=png'
    )
    expect(remoteAssetUrl('ui/icon/062000/062904.tex')).toBe(remoteAssetUrl('/ui/icon/062000/062904.tex'))
  })
})

describe('icon cache', () => {
  it('returns the remote URL while the icon is not cached', () => {
    expect(getIconPath(TEST_ICON)).toBeNull()
    expect(getIconUrl(TEST_ICON)).toBe(remoteAssetUrl(TEST_ICON))
  })

  it('downloads then serves the icon over file:// from userData', async () => {
    const fetchMock = mockFetchPng()
    const local = await getIconPathWithDownload(TEST_ICON)
    expect(local).toBe(join(CACHE_DIR, 'ui_icon_999000_999001.tex'))
    expect(fetchMock).toHaveBeenCalledWith(remoteAssetUrl(TEST_ICON), expect.anything())
    expect(getIconUrl(TEST_ICON)).toMatch(/^file:\/\/.*ui_icon_999000_999001\.tex$/)

    // Second call: served from the cache, no network
    await getIconPathWithDownload(TEST_ICON)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('writes nothing and contacts no host for a malicious path', async () => {
    const fetchMock = mockFetchPng()
    const before = existsSync(CACHE_DIR) ? readdirSync(CACHE_DIR).length : 0
    expect(await getIconPathWithDownload('..\\..\\evil.exe')).toBeNull()
    expect(getIconUrl('../../evil.png')).toBeNull()
    await prefetchIcons(['../../evil.png', 'https://evil.example/a.png', null])
    expect(fetchMock).not.toHaveBeenCalled()
    expect(readdirSync(CACHE_DIR).length).toBe(before)
  })

  it('ignores an HTTP error response and a non-array input', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('nope', { status: 404 })))
    expect(await getIconPathWithDownload(TEST_ICON)).toBeNull()
    await expect(prefetchIcons('oops' as unknown as string[])).resolves.toBeUndefined()
  })

  it('prefetches the valid icons', async () => {
    const fetchMock = mockFetchPng()
    await prefetchIcons([TEST_ICON, TEST_ICON])
    await vi.waitFor(() => expect(getIconPath(TEST_ICON)).not.toBeNull())
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
