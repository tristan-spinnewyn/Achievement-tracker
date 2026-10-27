import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

type Handler = (...args: any[]) => any

const h = vi.hoisted(() => {
  const state = {
    userData: '',
    lock: true,
    packaged: false,
    notifSupported: true,
    windows: [] as any[],
    notifications: [] as any[],
    appHandlers: {} as Record<string, Handler>,
    readyResolve: null as null | (() => void)
  }

  class BrowserWindow {
    static getAllWindows = vi.fn(() => state.windows)
    handlers: Record<string, Handler> = {}
    wcHandlers: Record<string, Handler> = {}
    windowOpenHandler: Handler | null = null
    minimized = false
    maximize = vi.fn()
    show = vi.fn()
    focus = vi.fn()
    restore = vi.fn()
    loadURL = vi.fn()
    loadFile = vi.fn()
    isMinimized = vi.fn(() => this.minimized)
    isMaximized = vi.fn(() => true)
    getNormalBounds = vi.fn(() => ({ width: 1000, height: 700, x: 10, y: 20 }))
    webContents = {
      send: vi.fn(),
      setWindowOpenHandler: (fn: Handler) => (this.windowOpenHandler = fn),
      on: (ev: string, fn: Handler) => (this.wcHandlers[ev] = fn)
    }
    constructor(public opts: any) {
      state.windows.push(this)
    }
    on(ev: string, fn: Handler): void {
      this.handlers[ev] = fn
    }
  }

  class Notification {
    static isSupported = (): boolean => state.notifSupported
    handlers: Record<string, Handler> = {}
    show = vi.fn()
    constructor(public opts: any) {
      state.notifications.push(this)
    }
    on(ev: string, fn: Handler): void {
      this.handlers[ev] = fn
    }
  }

  const app = {
    requestSingleInstanceLock: vi.fn(() => state.lock),
    quit: vi.fn(),
    commandLine: { appendSwitch: vi.fn() },
    getPath: vi.fn(() => state.userData),
    getAppPath: () => '/app',
    get isPackaged() {
      return state.packaged
    },
    setAppUserModelId: vi.fn(),
    on: vi.fn((ev: string, fn: Handler) => (state.appHandlers[ev] = fn)),
    whenReady: vi.fn(() => new Promise<void>((r) => (state.readyResolve = r)))
  }

  const session = {
    defaultSession: { setPermissionRequestHandler: vi.fn(), setPermissionCheckHandler: vi.fn() }
  }
  const shell = { openExternal: vi.fn() }
  const pending = { value: { daily: 0, weekly: 0, daily22: 0 } }

  return { state, BrowserWindow, Notification, app, session, shell, pending }
})

vi.mock('electron', () => ({
  app: h.app,
  shell: h.shell,
  BrowserWindow: h.BrowserWindow,
  session: h.session,
  Notification: h.Notification
}))

const mocks = vi.hoisted(() => ({
  storeInit: vi.fn(),
  setDifficulties: vi.fn(),
  seedCatalog: vi.fn(),
  seedCollections: vi.fn(),
  startReminders: vi.fn(),
  registerIpc: vi.fn(),
  initSearch: vi.fn(),
  prefetch: vi.fn(async () => {}),
  difficulties: vi.fn(() => new Map()),
  initUpdater: vi.fn()
}))

vi.mock('../src/main/data/store', () => ({
  store: {
    init: mocks.storeInit,
    setDifficulties: mocks.setDifficulties,
    catalog: { achievements: [{ iconPath: 'ui/a.tex' }, { iconPath: null }] }
  }
}))
vi.mock('../src/main/services/catalog', () => ({ seedCatalogIfEmpty: mocks.seedCatalog }))
vi.mock('../src/main/services/collectionsSync', () => ({ seedCollectionsIfEmpty: mocks.seedCollections }))
vi.mock('../src/main/data/repo', () => ({ countPendingRecurring: () => h.pending.value }))
vi.mock('../src/main/services/reminders', () => ({ startResetReminders: mocks.startReminders }))
vi.mock('../src/main/ipc/handlers', () => ({ registerIpcHandlers: mocks.registerIpc }))
vi.mock('../src/main/services/search', () => ({ initSearchIndex: mocks.initSearch }))
vi.mock('../src/main/utils/icons', () => ({ prefetchIcons: mocks.prefetch }))
vi.mock('../src/main/services/difficulty', () => ({ calculateAllDifficulties: mocks.difficulties }))
vi.mock('../src/main/services/updater', () => ({ initUpdater: mocks.initUpdater }))

/** Imports the entry point and waits for `app.whenReady()` to complete. */
async function boot(): Promise<InstanceType<typeof h.BrowserWindow>> {
  vi.resetModules()
  await import('../src/main/index')
  h.state.readyResolve?.()
  await vi.waitFor(() => expect(h.state.windows.length).toBeGreaterThan(0))
  return h.state.windows[0]
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout'] })
  h.state.userData = mkdtempSync(join(tmpdir(), 'main-index-'))
  h.state.lock = true
  h.state.packaged = false
  h.state.notifSupported = true
  h.state.windows = []
  h.state.notifications = []
  h.state.appHandlers = {}
  h.pending.value = { daily: 0, weekly: 0, daily22: 0 }
  vi.clearAllMocks()
  delete process.env['ELECTRON_RENDERER_URL']
})

afterEach(() => {
  vi.useRealTimers()
  rmSync(h.state.userData, { recursive: true, force: true })
  delete process.env['ELECTRON_RENDERER_URL']
})

describe('startup', () => {
  it('quits when another instance holds the lock', async () => {
    h.state.lock = false
    const exit = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('exit')
    }) as never)
    vi.resetModules()
    await expect(import('../src/main/index')).rejects.toThrow('exit')
    expect(h.app.quit).toHaveBeenCalled()
    expect(exit).toHaveBeenCalledWith(0)
    exit.mockRestore()
  })

  it('initialises services, disables caches and denies every web permission', async () => {
    const win = await boot()
    expect(h.app.commandLine.appendSwitch).toHaveBeenCalledWith('disable-http-cache')
    expect(mocks.storeInit).toHaveBeenCalled()
    expect(mocks.seedCatalog).toHaveBeenCalled()
    expect(mocks.seedCollections).toHaveBeenCalled()
    expect(mocks.registerIpc).toHaveBeenCalled()
    expect(mocks.initSearch).toHaveBeenCalled()
    expect(mocks.setDifficulties).toHaveBeenCalled()
    expect(mocks.prefetch).toHaveBeenCalledWith(['ui/a.tex'])
    expect(mocks.startReminders).toHaveBeenCalled()
    expect(mocks.startReminders.mock.calls[0][0]()).toBe(win)

    const reqHandler = h.session.defaultSession.setPermissionRequestHandler.mock.calls[0][0]
    const cb = vi.fn()
    reqHandler(null, 'media', cb)
    expect(cb).toHaveBeenCalledWith(false)
    expect(h.session.defaultSession.setPermissionCheckHandler.mock.calls[0][0]()).toBe(false)

    expect(win.opts.webPreferences).toMatchObject({ sandbox: true, contextIsolation: true, nodeIntegration: false })
    expect(win.opts).toMatchObject({ width: 1280, height: 820 })
    expect(win.loadFile).toHaveBeenCalled()
  })

  it('ignores an icon prefetch failure', async () => {
    mocks.prefetch.mockRejectedValueOnce(new Error('offline'))
    await boot()
    expect(mocks.prefetch).toHaveBeenCalled()
  })

  it('loads the Vite server in dev', async () => {
    process.env['ELECTRON_RENDERER_URL'] = 'http://localhost:5173'
    const win = await boot()
    expect(win.loadURL).toHaveBeenCalledWith('http://localhost:5173')
  })
})

describe('window state', () => {
  it('restores the saved state and writes it back on close', async () => {
    const statePath = join(h.state.userData, 'window-state.json')
    writeFileSync(statePath, JSON.stringify({ width: 900, height: 650, x: 1, y: 2, maximized: true }))
    const win = await boot()
    expect(win.opts).toMatchObject({ width: 900, height: 650, x: 1, y: 2 })
    expect(win.maximize).toHaveBeenCalled()

    win.handlers.close()
    expect(JSON.parse(readFileSync(statePath, 'utf8'))).toEqual({ width: 1000, height: 700, x: 10, y: 20, maximized: true })
  })

  it('ignores an unreadable state and a write failure', async () => {
    writeFileSync(join(h.state.userData, 'window-state.json'), '{bad')
    const win = await boot()
    expect(win.opts).toMatchObject({ width: 1280, height: 820 })
    h.state.userData = join(h.state.userData, 'inexistant', 'dossier')
    expect(() => win.handlers.close()).not.toThrow()
  })

  it('shows the window and starts the updater when ready', async () => {
    const win = await boot()
    win.handlers['ready-to-show']()
    expect(win.show).toHaveBeenCalled()
    expect(mocks.initUpdater).toHaveBeenCalledWith(win)
  })
})

describe('navigation and external links', () => {
  it('only opens HTTPS links in the system browser', async () => {
    const win = await boot()
    expect(win.windowOpenHandler!({ url: 'https://ffxivcollect.com/x' })).toEqual({ action: 'deny' })
    expect(h.shell.openExternal).toHaveBeenCalledWith('https://ffxivcollect.com/x')

    h.shell.openExternal.mockClear()
    win.windowOpenHandler!({ url: 'file:///C:/Windows/system32/calc.exe' })
    win.windowOpenHandler!({ url: 'pas une url' })
    expect(h.shell.openExternal).not.toHaveBeenCalled()
  })

  it('blocks navigation away from the local page in production', async () => {
    const win = await boot()
    const local = { preventDefault: vi.fn() }
    win.wcHandlers['will-navigate'](local, 'file:///app/index.html')
    expect(local.preventDefault).not.toHaveBeenCalled()

    const ext = { preventDefault: vi.fn() }
    win.wcHandlers['will-navigate'](ext, 'https://example.com/')
    expect(ext.preventDefault).toHaveBeenCalled()
    expect(h.shell.openExternal).toHaveBeenCalledWith('https://example.com/')
  })

  it('only allows the Vite server in dev', async () => {
    process.env['ELECTRON_RENDERER_URL'] = 'http://localhost:5173'
    const win = await boot()
    const dev = { preventDefault: vi.fn() }
    win.wcHandlers['will-navigate'](dev, 'http://localhost:5173/#/x')
    expect(dev.preventDefault).not.toHaveBeenCalled()
    const file = { preventDefault: vi.fn() }
    win.wcHandlers['will-navigate'](file, 'file:///etc/passwd')
    expect(file.preventDefault).toHaveBeenCalled()
  })
})

describe('pending recurring tasks notification at startup', () => {
  it('notifies pending tasks and navigates on click', async () => {
    h.pending.value = { daily: 1, weekly: 2, daily22: 1 }
    const win = await boot()
    vi.advanceTimersByTime(1000)
    const n = h.state.notifications[0]
    expect(n.opts.body).toBe('2 quotidienne(s) et 2 hebdomadaire(s) en attente.')
    expect(n.opts.icon).toMatch(/build[\\/]icon\.png$/)
    expect(n.show).toHaveBeenCalled()
    n.handlers.click()
    expect(win.webContents.send).toHaveBeenCalledWith('navigate-to', 'recurring')
  })

  it('uses the resources icon once packaged', async () => {
    h.state.packaged = true
    ;(process as { resourcesPath?: string }).resourcesPath = '/res'
    h.pending.value = { daily: 1, weekly: 0, daily22: 0 }
    await boot()
    vi.advanceTimersByTime(1000)
    expect(h.state.notifications[0].opts.icon).toMatch(/^[\\/]res[\\/]build[\\/]icon\.png$/)
  })

  it('notifies nothing without tasks or without support', async () => {
    await boot()
    vi.advanceTimersByTime(1000)
    h.pending.value = { daily: 1, weekly: 0, daily22: 0 }
    h.state.notifSupported = false
    h.state.windows = []
    await boot()
    vi.advanceTimersByTime(1000)
    expect(h.state.notifications).toHaveLength(0)
  })
})

describe('application events', () => {
  it('second-instance shows the existing window again', async () => {
    const win = await boot()
    win.minimized = true
    h.state.appHandlers['second-instance']()
    expect(win.restore).toHaveBeenCalled()
    expect(win.focus).toHaveBeenCalled()
  })

  it('activate recreates a window when none is open', async () => {
    await boot()
    h.state.appHandlers.activate()
    expect(h.state.windows).toHaveLength(1)
    h.state.windows = []
    h.state.appHandlers.activate()
    expect(h.state.windows).toHaveLength(1)
  })

  it('window-all-closed quits outside macOS', async () => {
    await boot()
    h.state.appHandlers['window-all-closed']()
    expect(h.app.quit).toHaveBeenCalledTimes(process.platform === 'darwin' ? 0 : 1)
  })
})
