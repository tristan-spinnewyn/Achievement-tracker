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
    console.log('[AutoUpdater] Application non packagée (mode dev) : recherche ignorée.')
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
    console.error('[AutoUpdater] Erreur lors de la vérification :', errorMsg)
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
    console.error('[AutoUpdater] Erreur lors du téléchargement :', errorMsg)
    setStatus({ state: 'error', message: errorMsg })
  }
}

export function quitAndInstall(): void {
  if (!app.isPackaged) return
  // Ferme l'application et lance l'installateur
  autoUpdater.quitAndInstall(false, true)
}

export function initUpdater(mainWindow: BrowserWindow): void {
  mainWindowRef = mainWindow

  // Configuration de l'auto-updater
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.allowDowngrade = false

  try {
    autoUpdater.setFeedURL({
      provider: 'github',
      owner: 'tristan-spinnewyn',
      repo: 'Achievment-tracker'
    })
  } catch {
    // Ignorer si déjà configuré via app-update.yml
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
    console.error('[AutoUpdater] Erreur détectée :', message)
    setStatus({ state: 'error', message })
  })

  // Vérification automatique au lancement si l'app est packagée
  if (app.isPackaged) {
    // Petit délai de 3 secondes après l'ouverture de la fenêtre pour ne pas ralentir le démarrage initial
    setTimeout(() => {
      checkForUpdates().catch((err) => {
        console.error('[AutoUpdater] Échec de la vérification au démarrage :', err)
      })
    }, 3000)
  }
}
