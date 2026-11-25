/**
 * Sets the version of the Tauri crate (src-tauri/Cargo.toml and Cargo.lock) to
 * the package.json version. The app itself reads its version from package.json
 * (`version` in tauri.conf.json); this keeps the crate metadata in step.
 *
 * CLI (used by .github/workflows/prepare-release.yml, after `npm version`):
 *   node scripts/sync-cargo-version.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { assertSemver } from './release-version.mjs'

const CRATE = 'ffxiv-achievement-tracker'
const CARGO_TOML = 'src-tauri/Cargo.toml'
const CARGO_LOCK = 'src-tauri/Cargo.lock'

// The first `version` line of the [package] table.
const PACKAGE_VERSION = /^(\[package\]\r?\n(?:[^[\r\n].*\r?\n|\r?\n)*?version = )"[^"]*"/m
// The `version` line right after the crate's own name in the lock file.
const LOCK_VERSION = new RegExp(`^(name = "${CRATE}"\\r?\\nversion = )"[^"]*"`, 'm')

/**
 * @param {string} contents
 * @param {RegExp} pattern
 * @param {string} version
 * @param {string} file
 */
function replaceVersion(contents, pattern, version, file) {
  if (!pattern.test(contents)) throw new Error(`Cannot find the ${CRATE} version in ${file}.`)
  return contents.replace(pattern, `$1"${version}"`)
}

/**
 * @param {{ cargoToml: string, cargoLock: string, version: string }} input
 * @returns {{ cargoToml: string, cargoLock: string }}
 */
export function syncCargoVersion({ cargoToml, cargoLock, version }) {
  assertSemver(version)
  return {
    cargoToml: replaceVersion(cargoToml, PACKAGE_VERSION, version, 'Cargo.toml'),
    cargoLock: replaceVersion(cargoLock, LOCK_VERSION, version, 'Cargo.lock')
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const { version } = JSON.parse(readFileSync('package.json', 'utf8'))
    const synced = syncCargoVersion({
      cargoToml: readFileSync(CARGO_TOML, 'utf8'),
      cargoLock: readFileSync(CARGO_LOCK, 'utf8'),
      version
    })
    writeFileSync(CARGO_TOML, synced.cargoToml)
    writeFileSync(CARGO_LOCK, synced.cargoLock)
    console.log(`Tauri crate version set to ${version}`)
  } catch (err) {
    console.error(`::error::${err instanceof Error ? err.message : String(err)}`)
    process.exit(1)
  }
}
