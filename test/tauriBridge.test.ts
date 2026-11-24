import { describe, expect, it, vi } from 'vitest'
import { createTauriApi, isTauriRuntime } from '../src/renderer/src/lib/tauriBridge'

describe('createTauriApi', () => {
  it('routes settings.get to the settings_get Tauri command', async () => {
    const settings = { region: 'eu', language: 'fr' }
    const invoke = vi.fn().mockResolvedValue(settings)
    const api = createTauriApi(invoke)

    await expect(api.settings.get()).resolves.toBe(settings)
    expect(invoke).toHaveBeenCalledWith('settings_get', undefined)
  })

  it('rejects calls to methods that are not ported yet, naming the method', async () => {
    const invoke = vi.fn()
    const api = createTauriApi(invoke)

    await expect(api.catalog.status()).rejects.toThrow('Not ported to Tauri yet: catalog.status')
    expect(invoke).not.toHaveBeenCalled()
  })

  it('returns a no-op unsubscribe for event subscriptions, nested or top-level', () => {
    const api = createTauriApi(vi.fn())

    const offNested = api.updater.onStatusChange(() => {})
    const offTop = api.onNavigate(() => {})

    expect(typeof offNested).toBe('function')
    expect(typeof offTop).toBe('function')
    expect(() => {
      offNested()
      offTop()
    }).not.toThrow()
  })
})

describe('isTauriRuntime', () => {
  it('detects the Tauri internals injected into the webview', () => {
    expect(isTauriRuntime({ __TAURI_INTERNALS__: {} })).toBe(true)
  })

  it('is false in Electron or a plain browser', () => {
    expect(isTauriRuntime({})).toBe(false)
  })
})
