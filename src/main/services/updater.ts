import { app, BrowserWindow } from 'electron'
import { autoUpdater } from 'electron-updater'
import type { UpdateProgress, UpdateStatus } from '@shared/types'

let currentStatus: UpdateStatus = { state: 'idle' }
let mainWindowRef: BrowserWindow | null = null
let lastAvailableVersion = ''

function formatReleaseNotes(notes: unknown): string | null {
  if (!notes) return null
  if (typeof notes === 'string') return notes
  if (Array.isArray(notes)) {
    return notes
      .map((n) => (typeof n === 'object' && n && 'note' in n ? (n as { note: string }).note : String(n)))
      .filter(Boolean)
      .join('\n')
  }
  return null
}

function setStatus(status: UpdateStatus): void {
  currentStatus = status
  if (mainWindowRef && !mainWindowRef.isDestroyed()) {
    mainWindowRef.webContents.send('updater:status', currentStatus)
  }
}

export function getUpdaterStatus(): UpdateStatus {
  return currentStatus
}

export async function checkForUpdates(): Promise<UpdateStatus> {
  if (!app.isPackaged) {
    console.log('[AutoUpdater] App not packaged (dev mode): update check skipped.')
    const status: UpdateStatus = { state: 'not-available', version: app.getVersion() }
    setStatus(status)
    return status
  }

  setStatus({ state: 'checking' })
  try {
    await autoUpdater.checkForUpdates()
    return currentStatus
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    console.error('[AutoUpdater] Error while checking for updates:', errorMsg)
    const errStatus: UpdateStatus = { state: 'error', message: errorMsg }
    setStatus(errStatus)
    return errStatus
  }
}

export async function downloadUpdate(): Promise<void> {
  if (!app.isPackaged) return
  try {
    await autoUpdater.downloadUpdate()
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    console.error('[AutoUpdater] Error while downloading the update:', errorMsg)
    setStatus({ state: 'error', message: errorMsg })
  }
}

export function quitAndInstall(): void {
  if (!app.isPackaged) return
  // Quit the app and launch the installer
  autoUpdater.quitAndInstall(false, true)
}

export function initUpdater(mainWindow: BrowserWindow): void {
  mainWindowRef = mainWindow

  // Auto-updater configuration
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.allowDowngrade = false

  try {
    autoUpdater.setFeedURL({
      provider: 'github',
      owner: 'tristan-spinnewyn',
      repo: 'Achievement-tracker'
    })
  } catch {
    // Ignore if already configured via app-update.yml
  }

  autoUpdater.on('checking-for-update', () => {
    setStatus({ state: 'checking' })
  })

  autoUpdater.on('update-available', (info) => {
    lastAvailableVersion = info.version
    setStatus({
      state: 'available',
      version: info.version,
      releaseDate: info.releaseDate,
      releaseNotes: formatReleaseNotes(info.releaseNotes)
    })
  })

  autoUpdater.on('update-not-available', (info) => {
    setStatus({
      state: 'not-available',
      version: info?.version || app.getVersion()
    })
  })

  autoUpdater.on('download-progress', (progressObj) => {
    const progress: UpdateProgress = {
      percent: Math.round(progressObj.percent),
      bytesPerSecond: progressObj.bytesPerSecond,
      transferred: progressObj.transferred,
      total: progressObj.total
    }
    setStatus({
      state: 'downloading',
      version: lastAvailableVersion || app.getVersion(),
      progress
    })
  })

  autoUpdater.on('update-downloaded', (info) => {
    setStatus({
      state: 'downloaded',
      version: info.version
    })
  })

  autoUpdater.on('error', (err) => {
    const message = err?.message || 'Erreur lors de la mise à jour'
    console.error('[AutoUpdater] Error detected:', message)
    setStatus({ state: 'error', message })
  })

  // Automatic check at launch when the app is packaged
  if (app.isPackaged) {
    // Short 3-second delay after the window opens so the initial startup is not slowed down
    setTimeout(() => {
      checkForUpdates().catch((err) => {
        console.error('[AutoUpdater] Update check at startup failed:', err)
      })
    }, 3000)
  }
}
