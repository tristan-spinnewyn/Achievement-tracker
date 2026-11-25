/**
 * Writes `latest.json`, the release feed read by the Tauri updater
 * (`plugins.updater.endpoints` in src-tauri/tauri.conf.json). It announces the
 * Windows installer attached to the release, with its minisign signature.
 *
 * CLI (used by .github/workflows/release.yml):
 *   node scripts/updater-manifest.mjs <version> <signature file> <output file>
 * The repository comes from $GITHUB_REPOSITORY.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { assertSemver } from './release-version.mjs'

const REPOSITORY = /^[\w.-]+\/[\w.-]+$/

/**
 * Same name as the Electron installer, so both releases look alike.
 * @param {string} version
 */
export function installerFileName(version) {
  return `FFXIV-Achievement-Tracker-Setup-${version}.exe`
}

/**
 * @param {{ version: string, repository: string, signature: string, pubDate: Date }} input
 */
export function buildUpdaterManifest({ version, repository, signature, pubDate }) {
  assertSemver(version)
  if (!REPOSITORY.test(repository)) throw new Error(`The repository "${repository}" is not owner/name.`)
  const trimmedSignature = signature.trim()
  if (!trimmedSignature) throw new Error('The installer signature is empty.')
  return {
    version,
    pub_date: pubDate.toISOString().replace(/\.\d{3}Z$/, 'Z'),
    platforms: {
      'windows-x86_64': {
        signature: trimmedSignature,
        url: `https://github.com/${repository}/releases/download/v${version}/${installerFileName(version)}`
      }
    }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const [version, signatureFile, outputFile] = process.argv.slice(2)
    const manifest = buildUpdaterManifest({
      version,
      repository: process.env.GITHUB_REPOSITORY ?? '',
      signature: readFileSync(signatureFile, 'utf8'),
      pubDate: new Date()
    })
    writeFileSync(outputFile, `${JSON.stringify(manifest, null, 2)}\n`)
    console.log(`Updater feed for v${version}: ${manifest.platforms['windows-x86_64'].url}`)
  } catch (err) {
    console.error(`::error::${err instanceof Error ? err.message : String(err)}`)
    process.exit(1)
  }
}
