import { app, shell, BrowserWindow, session, Notification } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { store } from './data/store'
import { seedCatalogIfEmpty } from './services/catalog'
import { seedCollectionsIfEmpty } from './services/collectionsSync'
import { countPendingRecurring } from './data/repo'
import { startResetReminders } from './services/reminders'
import { registerIpcHandlers } from './ipc/handlers'
import { initSearchIndex } from './services/search'
import { prefetchIcons } from './utils/icons'
import { calculateAllDifficulties } from './services/difficulty'
import { initUpdater } from './services/updater'

let mainWindow: BrowserWindow | null = null

// Single-instance lock: prevents two Electron processes from fighting over
// the same cache file (classic cause of "Unable to move the cache: Access denied").
if (!app.requestSingleInstanceLock()) {
  app.quit()
  process.exit(0)
}

// This app does not use Chromium's disk cache:
//  - the HTML is loaded locally (loadFile)
//  - icons are already cached on disk (icon-cache/) and served over file://
// So we disable the disk caches, which fail to be created/moved on Windows.
// Must be done before Chromium starts.
app.commandLine.appendSwitch('disable-http-cache') // no on-disk HTTP cache
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache') // no GPU shader cache

interface WinState {
  width: number
  height: number
  x?: number
  y?: number
  maximized?: boolean
}

function winStatePath(): string {
  return join(app.getPath('userData'), 'window-state.json')
}

function loadWinState(): WinState {
  try {
    if (existsSync(winStatePath())) return JSON.parse(readFileSync(winStatePath(), 'utf8'))
  } catch {
    // unreadable state: fall back to the defaults
  }
  return { width: 1280, height: 820 }
}

/**
 * Prefetches icons in the background.
 * Caps the count to avoid flooding the network.
 */
function prefetchIconsInBackground(): void {
  // Take the icons of the first 100 achievements
  const iconPaths = store.catalog.achievements
    .slice(0, 100) // Cap at 100 so we don't load everything
    .map(a => a.iconPath)
    .filter(Boolean) as string[]
  
  // Start the prefetch without waiting
  prefetchIcons(iconPaths).catch(() => {
    // Ignore prefetch errors
  })
}

function showPendingRecurringNotification(): void {
  const pending = countPendingRecurring()
  const total = pending.daily + pending.weekly + pending.daily22
  if (total > 0 && Notification.isSupported()) {
    const notification = new Notification({
      title: 'FFXIV Achievement Tracker',
      body: `${pending.daily + pending.daily22} quotidienne(s) et ${pending.weekly} hebdomadaire(s) en attente.`,
      icon: app.isPackaged
        ? join(process.resourcesPath, 'build', 'icon.png')
        : join(app.getAppPath(), 'build', 'icon.png')
    })
    notification.on('click', () => {
      if (mainWindow) {
        mainWindow.show()
        mainWindow.focus()
        // Ask the renderer to switch to the recurring tasks view
        mainWindow.webContents.send('navigate-to', 'recurring')
      }
    })
    notification.show()
  }
}

/** Opens a URL in the system browser, HTTPS only (never file:, smb:, etc.). */
function openExternalIfSafe(url: string): void {
  try {
    const parsedUrl = new URL(url)
    if (parsedUrl.protocol === 'https:') {
      shell.openExternal(parsedUrl.href)
    }
  } catch {
    // Ignore invalid or disallowed URLs
  }
}

function createWindow(): void {
  const state = loadWinState()
  mainWindow = new BrowserWindow({
    width: state.width,
    height: state.height,
    x: state.x,
    y: state.y,
    minWidth: 940,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#0f172a',
    title: 'FFXIV Achievement Tracker',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      // The preload only uses contextBridge/ipcRenderer: sandbox-compatible.
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true
    }
  })

  if (state.maximized) mainWindow.maximize()

  const saveState = (): void => {
    const maximized = mainWindow!.isMaximized()
    const b = mainWindow!.getNormalBounds()
    try {
      writeFileSync(
        winStatePath(),
        JSON.stringify({ width: b.width, height: b.height, x: b.x, y: b.y, maximized }),
        'utf8'
      )
    } catch {
      // write failure is non-blocking
    }
  }
  mainWindow.on('close', saveState)

  mainWindow.on('ready-to-show', () => {
    mainWindow!.show()
    initUpdater(mainWindow!)
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    openExternalIfSafe(details.url)
    return { action: 'deny' }
  })

  // Prevent the Electron window from navigating to an unexpected external site
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const isDev = !app.isPackaged && process.env['ELECTRON_RENDERER_URL']
    const isLocal = isDev
      ? url.startsWith(process.env['ELECTRON_RENDERER_URL']!)
      : url.startsWith('file://')
    if (!isLocal) {
      event.preventDefault()
      openExternalIfSafe(url)
    }
  })

  // electron-vite injects ELECTRON_RENDERER_URL in dev (HMR).
  if (!app.isPackaged && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// If a second instance is launched, show the existing window instead of opening another one.
app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
  }
})

app.whenReady().then(() => {
  app.setAppUserModelId('com.shin.ffxiv-achievement-tracker')
  store.init()
  seedCatalogIfEmpty()
  seedCollectionsIfEmpty()
  registerIpcHandlers()
  // Initialise the FlexSearch search index
  initSearchIndex()
  
  // Compute and store the difficulty of every achievement
  store.setDifficulties(calculateAllDifficulties())
  
  // Prefetch icons in the background
  prefetchIconsInBackground()

  // The renderer needs no web permission (camera, mic, geolocation…):
  // notifications go through the main process.
  session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false))
  session.defaultSession.setPermissionCheckHandler(() => false)

  // The production CSP is injected as a <meta> into index.html at build time
  // (see electron.vite.config.ts): it is versioned with the page itself.

  createWindow()

  // Show a notification for pending recurring tasks
  // Wait a little so the window is ready
  setTimeout(() => {
    showPendingRecurringNotification()
  }, 1000)

  // Schedule notifications at resets (daily 15:00 UTC, grand company supply 20:00 UTC,
  // weekly Tuesday 08:00 UTC); they reschedule themselves every period.
  startResetReminders(() => mainWindow)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
