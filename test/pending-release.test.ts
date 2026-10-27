import { describe, expect, it } from 'vitest'
import { findPendingReleaseTag } from '../scripts/pending-release.mjs'

describe('findPendingReleaseTag', () => {
  it('returns the tag when package.json holds a version not released yet', () => {
    expect(findPendingReleaseTag({ packageVersion: '2.1.0', tags: ['v1.1.2', 'v2.0.0'] })).toBe('v2.1.0')
  })

  it('returns null when the version is already tagged', () => {
    expect(findPendingReleaseTag({ packageVersion: '2.0.0', tags: ['v1.1.2', 'v2.0.0'] })).toBeNull()
  })

  it('returns the tag when the repository has no tags at all', () => {
    expect(findPendingReleaseTag({ packageVersion: '1.0.0', tags: [] })).toBe('v1.0.0')
  })

  it('ignores blank entries from the git tag listing', () => {
    expect(findPendingReleaseTag({ packageVersion: '2.0.0', tags: ['', 'v2.0.0', ''] })).toBeNull()
  })

  it('rejects a package.json version that is not semver', () => {
    expect(() => findPendingReleaseTag({ packageVersion: 'next', tags: [] })).toThrow(/not a valid semver/)
  })
})
