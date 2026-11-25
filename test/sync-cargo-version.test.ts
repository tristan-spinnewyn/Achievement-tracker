import { describe, expect, it } from 'vitest'
import { syncCargoVersion } from '../scripts/sync-cargo-version.mjs'

const CARGO_TOML = `[package]
name = "ffxiv-achievement-tracker"
version = "2.1.1"
edition = "2021"

[dependencies]
serde = { version = "1", features = ["derive"] }
tauri-plugin-updater = "2.14.1"
`

const CARGO_LOCK = `[[package]]
name = "dunce"
version = "2.1.1"

[[package]]
name = "ffxiv-achievement-tracker"
version = "2.1.1"
dependencies = [
 "chrono",
]

[[package]]
name = "ffxiv-achievement-tracker-helper"
version = "2.1.1"
`

describe('syncCargoVersion', () => {
  it('sets the package version in Cargo.toml and Cargo.lock only', () => {
    const synced = syncCargoVersion({ cargoToml: CARGO_TOML, cargoLock: CARGO_LOCK, version: '3.0.0' })

    expect(synced.cargoToml).toBe(CARGO_TOML.replace('version = "2.1.1"', 'version = "3.0.0"'))
    expect(synced.cargoLock).toBe(
      CARGO_LOCK.replace(
        'name = "ffxiv-achievement-tracker"\nversion = "2.1.1"',
        'name = "ffxiv-achievement-tracker"\nversion = "3.0.0"'
      )
    )
  })

  it('accepts Windows line endings', () => {
    const synced = syncCargoVersion({
      cargoToml: CARGO_TOML.replace(/\n/g, '\r\n'),
      cargoLock: CARGO_LOCK.replace(/\n/g, '\r\n'),
      version: '3.0.0'
    })
    expect(synced.cargoToml).toContain('version = "3.0.0"\r\n')
    expect(synced.cargoLock).toContain('name = "ffxiv-achievement-tracker"\r\nversion = "3.0.0"')
  })

  it('fails when the package entry cannot be found', () => {
    expect(() => syncCargoVersion({ cargoToml: '[workspace]\n', cargoLock: CARGO_LOCK, version: '3.0.0' })).toThrow(
      /Cargo\.toml/
    )
    expect(() => syncCargoVersion({ cargoToml: CARGO_TOML, cargoLock: '', version: '3.0.0' })).toThrow(/Cargo\.lock/)
  })

  it('rejects a version that is not semver', () => {
    expect(() => syncCargoVersion({ cargoToml: CARGO_TOML, cargoLock: CARGO_LOCK, version: '3' })).toThrow(
      /not a valid semver/
    )
  })
})
