import { describe, expect, it } from 'vitest'
import { buildUpdaterManifest, installerFileName } from '../scripts/updater-manifest.mjs'

const REPOSITORY = 'tristan-spinnewyn/Achievement-tracker'

describe('installerFileName', () => {
  it('keeps the name of the Electron installer', () => {
    expect(installerFileName('3.0.0')).toBe('FFXIV-Achievement-Tracker-Setup-3.0.0.exe')
  })
})

describe('buildUpdaterManifest', () => {
  const input = {
    version: '3.0.0',
    repository: REPOSITORY,
    signature: 'dW50cnVzdGVkIGNvbW1lbnQ6\n',
    pubDate: new Date('2026-12-01T10:00:00.123Z')
  }

  it('announces the Windows installer of the release with its signature', () => {
    expect(buildUpdaterManifest(input)).toEqual({
      version: '3.0.0',
      pub_date: '2026-12-01T10:00:00Z',
      platforms: {
        'windows-x86_64': {
          signature: 'dW50cnVzdGVkIGNvbW1lbnQ6',
          url: 'https://github.com/tristan-spinnewyn/Achievement-tracker/releases/download/v3.0.0/FFXIV-Achievement-Tracker-Setup-3.0.0.exe'
        }
      }
    })
  })

  it('rejects a version that is not semver', () => {
    expect(() => buildUpdaterManifest({ ...input, version: 'next' })).toThrow(/not a valid semver/)
  })

  it('rejects a missing signature', () => {
    expect(() => buildUpdaterManifest({ ...input, signature: '  ' })).toThrow(/signature/)
  })

  it('rejects a repository that is not owner/name', () => {
    expect(() => buildUpdaterManifest({ ...input, repository: 'https://evil.example/x' })).toThrow(/repository/)
  })
})
