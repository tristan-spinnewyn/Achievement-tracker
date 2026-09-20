import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { EventEmitter } from 'events'
import { setMockPackaged } from './stubs/electron'

vi.mock('electron-updater', () => {
  const { EventEmitter } = require('events')
  class MockAutoUpdater extends EventEmitter {
    autoDownload = false
    autoInstallOnAppQuit = false
    allowDowngrade = false
    setFeedURL = vi.fn()
    checkForUpdates = vi.fn().mockResolvedValue({})
    downloadUpdate = vi.fn().mockResolvedValue([])
    quitAndInstall = vi.fn()
  }
  return {
    autoUpdater: new MockAutoUpdater()
  }
})

import { autoUpdater } from 'electron-updater'
import * as updaterModule from '../src/main/services/updater'

const mockAutoUpdater = autoUpdater as unknown as EventEmitter & {
  autoDownload: boolean
  autoInstallOnAppQuit: boolean
  allowDowngrade: boolean
  checkForUpdates: ReturnType<typeof vi.fn>
  downloadUpdate: ReturnType<typeof vi.fn>
  quitAndInstall: ReturnType<typeof vi.fn>
}

describe('Service Updater (auto-updater)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAutoUpdater.removeAllListeners()
  })

  afterEach(() => {
    setMockPackaged(false)
  })

  it('gère le mode développement (non packagé) sans erreur', async () => {
    setMockPackaged(false)

    const status = await updaterModule.checkForUpdates()
    expect(status.state).toBe('not-available')
    expect(mockAutoUpdater.checkForUpdates).not.toHaveBeenCalled()

    await updaterModule.downloadUpdate()
    expect(mockAutoUpdater.downloadUpdate).not.toHaveBeenCalled()

    updaterModule.quitAndInstall()
    expect(mockAutoUpdater.quitAndInstall).not.toHaveBeenCalled()
  })

  it('initialise autoUpdater et enregistre les écouteurs sur la fenêtre', async () => {
    setMockPackaged(true)

    const sentEvents: { channel: string; data: unknown }[] = []
    const mockWindow = {
      webContents: {
        send: (channel: string, data: unknown) => {
          sentEvents.push({ channel, data })
        }
      },
      isDestroyed: () => false
    }

    // @ts-ignore
    updaterModule.initUpdater(mockWindow)

    expect(mockAutoUpdater.autoDownload).toBe(true)
    expect(mockAutoUpdater.autoInstallOnAppQuit).toBe(true)

    // Événement checking-for-update
    mockAutoUpdater.emit('checking-for-update')
    expect(updaterModule.getUpdaterStatus().state).toBe('checking')
    expect(sentEvents).toContainEqual({
      channel: 'updater:status',
      data: { state: 'checking' }
    })

    // Événement update-available avec release notes sous forme de string
    mockAutoUpdater.emit('update-available', {
      version: '1.2.0',
      releaseDate: '2026-09-20',
      releaseNotes: 'Correction de bugs'
    })
    expect(updaterModule.getUpdaterStatus()).toEqual({
      state: 'available',
      version: '1.2.0',
      releaseDate: '2026-09-20',
      releaseNotes: 'Correction de bugs'
    })

    // Événement download-progress
    mockAutoUpdater.emit('download-progress', {
      percent: 42.6,
      bytesPerSecond: 1048576,
      transferred: 42000000,
      total: 100000000
    })
    expect(updaterModule.getUpdaterStatus()).toEqual({
      state: 'downloading',
      version: '1.2.0',
      progress: {
        percent: 43,
        bytesPerSecond: 1048576,
        transferred: 42000000,
        total: 100000000
      }
    })

    // Événement update-downloaded
    mockAutoUpdater.emit('update-downloaded', {
      version: '1.2.0'
    })
    expect(updaterModule.getUpdaterStatus()).toEqual({
      state: 'downloaded',
      version: '1.2.0'
    })

    // Événement error
    mockAutoUpdater.emit('error', new Error('Erreur de connexion réseau'))
    expect(updaterModule.getUpdaterStatus()).toEqual({
      state: 'error',
      message: 'Erreur de connexion réseau'
    })

    // Événement update-not-available
    mockAutoUpdater.emit('update-not-available', {
      version: '1.0.1'
    })
    expect(updaterModule.getUpdaterStatus()).toEqual({
      state: 'not-available',
      version: '1.0.1'
    })
  })

  it('formate correctement les releaseNotes sous forme de tableau', async () => {
    setMockPackaged(true)

    const mockWindow = {
      webContents: { send: vi.fn() },
      isDestroyed: () => false
    }
    // @ts-ignore
    updaterModule.initUpdater(mockWindow)

    mockAutoUpdater.emit('update-available', {
      version: '1.3.0',
      releaseNotes: [
        { version: '1.2.0', note: 'Amélioration UI' },
        { version: '1.3.0', note: 'Ajout auto-updater' }
      ]
    })

    const status = updaterModule.getUpdaterStatus()
    expect(status.state).toBe('available')
    if (status.state === 'available') {
      expect(status.releaseNotes).toBe('Amélioration UI\nAjout auto-updater')
    }
  })

  it('déclenche les méthodes autoUpdater en mode packagé', async () => {
    setMockPackaged(true)

    await updaterModule.checkForUpdates()
    expect(mockAutoUpdater.checkForUpdates).toHaveBeenCalled()

    await updaterModule.downloadUpdate()
    expect(mockAutoUpdater.downloadUpdate).toHaveBeenCalled()

    updaterModule.quitAndInstall()
    expect(mockAutoUpdater.quitAndInstall).toHaveBeenCalledWith(false, true)
  })

  it('gère une erreur lors de checkForUpdates ou downloadUpdate en mode packagé', async () => {
    setMockPackaged(true)

    mockAutoUpdater.checkForUpdates.mockRejectedValueOnce(new Error('GitHub 404'))
    const checkResult = await updaterModule.checkForUpdates()
    expect(checkResult.state).toBe('error')
    if (checkResult.state === 'error') {
      expect(checkResult.message).toContain('GitHub 404')
    }

    mockAutoUpdater.downloadUpdate.mockRejectedValueOnce(new Error('Disque plein'))
    await updaterModule.downloadUpdate()
    const downloadStatus = updaterModule.getUpdaterStatus()
    expect(downloadStatus.state).toBe('error')
    if (downloadStatus.state === 'error') {
      expect(downloadStatus.message).toContain('Disque plein')
    }
  })

  it('ne plante pas si la fenêtre est détruite lors de setStatus', async () => {
    setMockPackaged(true)

    const mockSend = vi.fn()
    const mockWindow = {
      webContents: { send: mockSend },
      isDestroyed: () => true // fenêtre fermée / détruite
    }
    // @ts-ignore
    updaterModule.initUpdater(mockWindow)

    mockAutoUpdater.emit('checking-for-update')
    expect(mockSend).not.toHaveBeenCalled()
  })
})
