import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const h = vi.hoisted(() => {
  const instances: { opts: { body: string; icon: string }; handlers: Record<string, () => void>; show: () => void }[] = []
  const state = { supported: true }
  class Notification {
    static isSupported = (): boolean => state.supported
    handlers: Record<string, () => void> = {}
    show = vi.fn()
    constructor(public opts: { body: string; icon: string }) {
      instances.push(this)
    }
    on(ev: string, cb: () => void): void {
      this.handlers[ev] = cb
    }
  }
  return { instances, state, Notification }
})

vi.mock('electron', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  Notification: h.Notification
}))

const pending = vi.hoisted(() => ({ value: { daily: 0, weekly: 0, daily22: 0 } }))
vi.mock('../src/main/data/repo', () => ({ countPendingRecurring: () => pending.value }))

import { startResetReminders, stopResetReminders } from '../src/main/services/reminders'
import { setMockPackaged } from './stubs/electron'

const makeWindow = (minimized = false) => ({
  isMinimized: vi.fn(() => minimized),
  restore: vi.fn(),
  show: vi.fn(),
  focus: vi.fn(),
  webContents: { send: vi.fn() }
})

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-27T12:00:00Z')) // Tuesday
  h.instances.length = 0
  h.state.supported = true
  pending.value = { daily: 0, weekly: 0, daily22: 0 }
})

afterEach(() => {
  stopResetReminders()
  vi.useRealTimers()
  setMockPackaged(false)
})

describe('reset reminders', () => {
  it('notifies at the daily reset (15:00 UTC) and brings the window back on click', () => {
    pending.value = { daily: 2, weekly: 0, daily22: 0 }
    const win = makeWindow(true)
    startResetReminders(() => win as never)

    vi.advanceTimersByTime(3 * 3600 * 1000 + 1000)
    expect(h.instances).toHaveLength(1)
    const n = h.instances[0]
    expect(n.opts.body).toBe('Reset : 2 tâche(s) quotidienne(s) à refaire.')
    expect(n.opts.icon).toMatch(/build[\\/]icon\.png$/)
    expect(n.show).toHaveBeenCalled()

    n.handlers.click()
    expect(win.restore).toHaveBeenCalled()
    expect(win.focus).toHaveBeenCalled()
    expect(win.webContents.send).toHaveBeenCalledWith('navigate-to', 'recurring')
  })

  it('schedules the next period and does not notify without pending tasks', () => {
    startResetReminders(() => null)
    vi.advanceTimersByTime(3 * 3600 * 1000 + 1000)
    expect(h.instances).toHaveLength(0)

    pending.value = { daily: 1, weekly: 0, daily22: 0 }
    vi.advanceTimersByTime(24 * 3600 * 1000)
    expect(h.instances).toHaveLength(1)
    h.instances[0].handlers.click() // no window: no error
  })

  it('shows nothing when notifications are not supported', () => {
    h.state.supported = false
    pending.value = { daily: 1, weekly: 1, daily22: 1 }
    startResetReminders(() => null)
    vi.advanceTimersByTime(7 * 24 * 3600 * 1000)
    expect(h.instances).toHaveLength(0)
  })

  it('uses the resources icon path once packaged and does not restore a visible window', () => {
    setMockPackaged(true)
    ;(process as { resourcesPath?: string }).resourcesPath = '/res'
    pending.value = { daily: 0, weekly: 3, daily22: 0 }
    const win = makeWindow(false)
    startResetReminders(() => win as never)
    vi.advanceTimersByTime(7 * 24 * 3600 * 1000)
    const weekly = h.instances.find((n) => n.opts.body.includes('hebdomadaire'))!
    expect(weekly.opts.icon).toMatch(/^[\\/]res[\\/]build[\\/]icon\.png$/)
    weekly.handlers.click()
    expect(win.restore).not.toHaveBeenCalled()
  })

  it('stopResetReminders cancels everything', () => {
    pending.value = { daily: 1, weekly: 1, daily22: 1 }
    startResetReminders(() => null)
    stopResetReminders()
    vi.advanceTimersByTime(7 * 24 * 3600 * 1000)
    expect(h.instances).toHaveLength(0)
  })
})
