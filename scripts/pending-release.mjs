/**
 * Finds the release tag to publish after a push to main, if any.
 *
 * A release is pending when package.json holds a version that has no `v<version>`
 * tag yet, i.e. a release PR (opened by the "Prepare release" workflow) was just
 * merged. Any other push to main leaves the version untouched, so nothing is due.
 *
 * CLI (used by .github/workflows/tag-release.yml):
 *   node scripts/pending-release.mjs
 * Reads package.json and the local git tags (fetch them first), prints the
 * result and, on GitHub Actions, writes `tag_name` (empty when nothing is due)
 * to $GITHUB_OUTPUT.
 */
import { execFileSync } from 'node:child_process'
import { appendFileSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { assertSemver } from './release-version.mjs'

/**
 * @param {{ packageVersion: string, tags: string[] }} input
 * @returns {string | null} the tag to release, or null when already released
 */
export function findPendingReleaseTag({ packageVersion, tags }) {
  assertSemver(packageVersion)
  const tag = `v${packageVersion}`
  return tags.includes(tag) ? null : tag
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const { version: packageVersion } = JSON.parse(readFileSync('package.json', 'utf8'))
    const tags = execFileSync('git', ['tag', '--list'], { encoding: 'utf8' }).split('\n')
    const tag = findPendingReleaseTag({ packageVersion, tags })
    console.log(tag ? `Release pending: ${tag}` : `v${packageVersion} is already released, nothing to do.`)
    if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `tag_name=${tag ?? ''}\n`)
  } catch (err) {
    console.error(`::error::${err instanceof Error ? err.message : String(err)}`)
    process.exit(1)
  }
}
