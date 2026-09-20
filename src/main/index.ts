import { app, shell, BrowserWindow, session, Notification } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { store } from './data/store'
import { seedCatalogIfEmpty } from './services/catalog'
import { seedCollectionsIfEmpty } from './services/collections'
import { countPendingRecurring } from './data/repo'
import { startResetReminders } from './services/reminders'
import { registerIpcHandlers } from './ipc/handlers'
import { initSearchIndex } from './utils/search'
import { prefetchIcons } from './utils/icons'
import { calculateAllDifficulties } from './utils/difficulty'
import { initUpdater } from './services/updater'

let mainWindow: BrowserWindow | null = null

// Verrou d'instance unique : empêche deux process Electron de se disputer
// le même fichier de cache (cause classique de « Unable to move the cache: Accès refusé »).
if (!app.requestSingleInstanceLock()) {
  app.quit()
  process.exit(0)
}

// Cette app n'utilise pas le cache disque de Chromium :
//  - le HTML est chargé en local (loadFile)
//  - les icônes sont déjà mises en cache sur disque (icon-cache/) et servies en file://
// On désactive donc les caches disque qui échouent à se créer/déplacer sous Windows.
// Doit être fait avant que Chromium ne démarre.
app.commandLine.appendSwitch('disable-http-cache') // pas de cache HTTP disque
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache') // pas de cache shader GPU

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
    // état illisible : on repart sur les valeurs par défaut
  }
  return { width: 1280, height: 820 }
}

/**
 * Précharge les icônes en arrière-plan.
 * Limite le nombre pour éviter de surcharger le réseau.
 */
function prefetchIconsInBackground(): void {
  // Récupérer les icônes des 100 premiers hauts faits
  const iconPaths = store.catalog.achievements
    .slice(0, 100) // Limiter à 100 pour ne pas tout charger
    .map(a => a.iconPath)
    .filter(Boolean) as string[]
  
  // Lancer le préchargement sans attendre
  prefetchIcons(iconPaths).catch(() => {
    // Ignorer les erreurs de préchargement
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
        // Envoyer un message pour changer de vue vers les tâches récurrentes
        mainWindow.webContents.send('navigate-to', 'recurring')
      }
    })
    notification.show()
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
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
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
      // échec d'écriture non bloquant
    }
  }
  mainWindow.on('close', saveState)

  mainWindow.on('ready-to-show', () => {
    mainWindow!.show()
    initUpdater(mainWindow!)
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    try {
      const parsedUrl = new URL(details.url)
      if (parsedUrl.protocol === 'https:' || parsedUrl.protocol === 'http:') {
        shell.openExternal(parsedUrl.href)
      }
    } catch {
      // Ignorer les URLs invalides ou non autorisées
    }
    return { action: 'deny' }
  })

  // Empêche la fenêtre Electron de naviguer vers un site externe inattendu
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const isDev = !app.isPackaged && process.env['ELECTRON_RENDERER_URL']
    const isLocal = isDev
      ? url.startsWith(process.env['ELECTRON_RENDERER_URL']!)
      : url.startsWith('file://')
    if (!isLocal) {
      event.preventDefault()
      try {
        const parsedUrl = new URL(url)
        if (parsedUrl.protocol === 'https:' || parsedUrl.protocol === 'http:') {
          shell.openExternal(parsedUrl.href)
        }
      } catch {
        // Ignorer les URLs invalides
      }
    }
  })

  // electron-vite injecte ELECTRON_RENDERER_URL en dev (HMR).
  if (!app.isPackaged && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// Si une 2ᵉ instance est lancée, on réaffiche la fenêtre existante au lieu d'en ouvrir une autre.
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
  // Initialiser l'index de recherche FlexSearch
  initSearchIndex()
  
  // Calculer et stocker les difficultés de tous les hauts faits
  store.setDifficulties(calculateAllDifficulties())
  
  // Précharger les icônes en arrière-plan
  prefetchIconsInBackground()

  // Configurer la session pour éviter les erreurs de cache
  // Désactiver le cache disque pour la session principale
  session.defaultSession.setPreloads([join(__dirname, '../preload/index.js')])
  
  // Désactiver le cache pour éviter les erreurs de permissions Windows
  if (app.isPackaged) {
    session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
      // On pourrait ajouter des headers cache-control: no-store si nécessaire
      callback({ cancel: false })
    })
  }

  // Durcissement CSP en production (en dev, Vite a besoin de plus de souplesse).
  if (app.isPackaged) {
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [
            "default-src 'self'; img-src 'self' data: https://xivapi.com https://*.xivapi.com https://v2.xivapi.com https://*.v2.xivapi.com https://*.finalfantasyxiv.com; connect-src 'self' https://xivapi.com https://*.xivapi.com https://v2.xivapi.com https://*.v2.xivapi.com; style-src 'self' 'unsafe-inline'; script-src 'self'"
          ]
        }
      })
    })
  }

  createWindow()

  // Montrer une notification pour les tâches récurrentes en attente
  // On attend un peu pour que la fenêtre soit prête
  setTimeout(() => {
    showPendingRecurringNotification()
  }, 1000)

  // Planifier les notifications aux resets (quotidien 15h UTC, ravitaillement 20h UTC,
  // hebdo mardi 8h UTC) ; elles se replanifient automatiquement à chaque période.
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
