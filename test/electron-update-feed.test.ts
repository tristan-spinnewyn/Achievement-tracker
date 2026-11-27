import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
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

  // The Electron apps (v2.x) read this feed with electron-updater: it must keep
  // the exact format electron-builder published, here the v2.1.1 release feed.
  it('reproduces the feed electron-builder published for v2.1.1', () => {
    const published = readFileSync(join(__dirname, 'fixtures/electron-builder-latest-2.1.1.yml'), 'utf8')

    const rebuilt = buildElectronUpdateFeed({
      version: '2.1.1',
      fileName: 'FFXIV-Achievement-Tracker-Setup-2.1.1.exe',
      sha512: 's6AeOSi4IILdOUPyK8aOLVobeuQ5/TIJjhsfiKesBXA3xYzwBDKLU7A5mBETMPStMo9He/LMY9Coyxws8XaTSw==',
      size: 122_837_947,
      releaseDate: new Date('2026-10-29T12:16:36.371Z')
    })

    expect(rebuilt).toBe(published.replace(/\r\n/g, '\n'))
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
