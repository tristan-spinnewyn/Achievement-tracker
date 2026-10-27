/**
 * Resolves the release tag/version and checks it matches package.json.
 *
 * package.json is the single source of truth for the version: it is bumped
 * through a pull request before tagging (main is protected, so CI cannot push
 * a bump itself). A tag that disagrees with package.json fails the release.
 *
 * CLI (used by .github/workflows/release.yml):
 *   node scripts/release-version.mjs [tag]
 * Prints the result and, on GitHub Actions, writes `tag_name` and
 * `clean_version` to $GITHUB_OUTPUT.
 */
import { appendFileSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/

/** @param {string} version */
export function assertSemver(version) {
  if (!SEMVER.test(version)) throw new Error(`Version "${version}" is not a valid semver.`)
}

/**
 * @param {{ tag?: string, packageVersion: string }} input
 * @returns {{ tag: string, version: string }}
 */
export function resolveReleaseVersion({ tag, packageVersion }) {
  const version = tag ? tag.replace(/^v/, '') : packageVersion
  assertSemver(version)
  if (version !== packageVersion) {
    throw new Error(
      `Tag v${version} does not match package.json version ${packageVersion}. ` +
        'Bump package.json through a pull request before tagging.'
    )
  }
  return { tag: `v${version}`, version }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const { version: packageVersion } = JSON.parse(readFileSync('package.json', 'utf8'))
    const { tag, version } = resolveReleaseVersion({ tag: process.argv[2], packageVersion })
    console.log(`Release tag: ${tag} (version ${version})`)
    if (process.env.GITHUB_OUTPUT) {
      appendFileSync(process.env.GITHUB_OUTPUT, `tag_name=${tag}\nclean_version=${version}\n`)
    }
  } catch (err) {
    console.error(`::error::${err instanceof Error ? err.message : String(err)}`)
    process.exit(1)
  }
}
