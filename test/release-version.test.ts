import { describe, expect, it } from 'vitest'
import { resolveReleaseVersion } from '../scripts/release-version.mjs'

describe('resolveReleaseVersion', () => {
  it('accepts a tag matching package.json', () => {
    expect(resolveReleaseVersion({ tag: 'v2.0.0', packageVersion: '2.0.0' })).toEqual({
      tag: 'v2.0.0',
      version: '2.0.0'
    })
  })

  it('derives the tag from package.json when none is given', () => {
    expect(resolveReleaseVersion({ tag: '', packageVersion: '2.1.0' })).toEqual({ tag: 'v2.1.0', version: '2.1.0' })
    expect(resolveReleaseVersion({ packageVersion: '2.1.0' })).toEqual({ tag: 'v2.1.0', version: '2.1.0' })
  })

  it('accepts a tag without the leading v', () => {
    expect(resolveReleaseVersion({ tag: '2.0.0', packageVersion: '2.0.0' })).toEqual({ tag: 'v2.0.0', version: '2.0.0' })
  })

  it('rejects a tag that does not match package.json', () => {
    expect(() => resolveReleaseVersion({ tag: 'v2.0.0', packageVersion: '1.0.1' })).toThrow(
      /Tag v2\.0\.0 does not match package\.json version 1\.0\.1/
    )
  })

  it('rejects a version that is not semver', () => {
    expect(() => resolveReleaseVersion({ tag: 'vnext', packageVersion: 'next' })).toThrow(/not a valid semver/)
  })

  it('accepts prerelease versions', () => {
    expect(resolveReleaseVersion({ tag: 'v2.1.0-beta.1', packageVersion: '2.1.0-beta.1' }).version).toBe('2.1.0-beta.1')
  })
})
