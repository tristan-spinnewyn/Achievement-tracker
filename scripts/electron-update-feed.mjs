/**
 * Writes `latest.yml`, the feed electron-updater reads in the latest GitHub
 * release: the Electron apps (v2.x) then download the Tauri installer, check
 * its sha512 and run it. The installer removes the Electron app, and the Tauri
 * app copies its data on the first launch.
 *
 * File URLs must stay relative: electron-updater's GitHub provider always
 * prefixes them with `releases/download/<latest tag>/`.
 *
 * CLI (used by .github/workflows/release.yml):
 *   node scripts/electron-update-feed.mjs <version> <installer> <output file>
 */
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { stat, writeFile } from 'node:fs/promises'
import { basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import { assertSemver } from './release-version.mjs'

const FILE_NAME = /^[\w.-]+$/
const SHA512_BASE64 = /^[A-Za-z0-9+/]{86}==$/

/**
 * @param {{ version: string, fileName: string, sha512: string, size: number, releaseDate: Date }} input
 * @returns {string}
 */
export function buildElectronUpdateFeed({ version, fileName, sha512, size, releaseDate }) {
  assertSemver(version)
  if (!FILE_NAME.test(fileName)) throw new Error(`The installer file name "${fileName}" is not supported.`)
  if (!SHA512_BASE64.test(sha512)) throw new Error('The installer sha512 is not a base64 SHA-512 digest.')
  if (!Number.isInteger(size) || size <= 0) throw new Error(`The installer size ${size} is not valid.`)
  return [
    `version: ${version}`,
    'files:',
    `  - url: ${fileName}`,
    `    sha512: ${sha512}`,
    `    size: ${size}`,
    `path: ${fileName}`,
    `sha512: ${sha512}`,
    `releaseDate: '${releaseDate.toISOString()}'`,
    ''
  ].join('\n')
}

/**
 * @param {string} file
 * @returns {Promise<{ sha512: string, size: number }>}
 */
export async function fileDigest(file) {
  const hash = createHash('sha512')
  for await (const chunk of createReadStream(file)) hash.update(chunk)
  return { sha512: hash.digest('base64'), size: (await stat(file)).size }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const [version, installer, outputFile] = process.argv.slice(2)
    const { sha512, size } = await fileDigest(installer)
    const fileName = basename(installer)
    await writeFile(outputFile, buildElectronUpdateFeed({ version, fileName, sha512, size, releaseDate: new Date() }))
    console.log(`Electron update feed for v${version}: ${fileName} (${size} bytes)`)
  } catch (err) {
    console.error(`::error::${err instanceof Error ? err.message : String(err)}`)
    process.exit(1)
  }
}
