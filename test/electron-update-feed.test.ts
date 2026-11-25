import { createHash } from 'node:crypto'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { findFile, parseUpdateInfo, resolveFiles } from 'electron-updater/out/providers/Provider'
import { buildElectronUpdateFeed, fileDigest } from '../scripts/electron-update-feed.mjs'

const SHA512 = createHash('sha512').update('Tauri installer').digest('base64')
const feedInput = {
  version: '3.0.0',
  fileName: 'FFXIV-Achievement-Tracker-Setup-3.0.0.exe',
  sha512: SHA512,
  size: 4_200_000,
  releaseDate: new Date('2026-12-01T10:00:00.123Z')
}

describe('buildElectronUpdateFeed', () => {
  it('writes latest.yml like electron-builder', () => {
    expect(buildElectronUpdateFeed(feedInput)).toBe(
      [
        'version: 3.0.0',
        'files:',
        '  - url: FFXIV-Achievement-Tracker-Setup-3.0.0.exe',
        `    sha512: ${SHA512}`,
        '    size: 4200000',
        'path: FFXIV-Achievement-Tracker-Setup-3.0.0.exe',
        `sha512: ${SHA512}`,
        "releaseDate: '2026-12-01T10:00:00.123Z'",
        ''
      ].join('\n')
    )
  })

  // What the Electron apps (v2.x) do with the feed of the latest GitHub release.
  it('is read by electron-updater as the Tauri installer of the release', () => {
    const feed = buildElectronUpdateFeed(feedInput)
    const info = parseUpdateInfo(feed, 'latest.yml', new URL('https://github.com/x/latest.yml'))
    const files = resolveFiles(
      { ...info, tag: 'v3.0.0' } as typeof info,
      new URL('https://github.com'),
      (p) => `/tristan-spinnewyn/Achievement-tracker/releases/download/v3.0.0/${p.replace(/ /g, '-')}`
    )
    const installer = findFile(files, 'exe')

    expect(info.version).toBe('3.0.0')
    expect(installer?.url.href).toBe(
      'https://github.com/tristan-spinnewyn/Achievement-tracker/releases/download/v3.0.0/FFXIV-Achievement-Tracker-Setup-3.0.0.exe'
    )
    expect(installer?.info).toMatchObject({ sha512: SHA512, size: 4_200_000 })
  })

  it('rejects a version that is not semver', () => {
    expect(() => buildElectronUpdateFeed({ ...feedInput, version: 'v3' })).toThrow(/not a valid semver/)
  })

  it('rejects a file name or checksum that would break the YAML', () => {
    expect(() => buildElectronUpdateFeed({ ...feedInput, fileName: 'a: b.exe' })).toThrow(/file name/)
    expect(() => buildElectronUpdateFeed({ ...feedInput, sha512: 'not base64!' })).toThrow(/sha512/)
    expect(() => buildElectronUpdateFeed({ ...feedInput, size: 0 })).toThrow(/size/)
  })
})

describe('fileDigest', () => {
  let dir = ''
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('gives the base64 sha512 and the size of a file', async () => {
    dir = mkdtempSync(join(tmpdir(), 'feed-'))
    const file = join(dir, 'setup.exe')
    writeFileSync(file, 'installer bytes')

    expect(await fileDigest(file)).toEqual({
      sha512: createHash('sha512').update('installer bytes').digest('base64'),
      size: 15
    })
  })
})
