/**
 * Notifications scheduled at FFXIV resets.
 *
 * For each recurring type, a `setTimeout` is scheduled until the next reset
 * (≤ 7 days, below setTimeout's ~24.8-day limit); when it fires, pending tasks
 * are notified and the next period is scheduled.
 */
import { app, Notification, type BrowserWindow } from 'electron'
import { join } from 'path'
import type { RecurringType } from '@shared/types'
import { nextReset } from '@shared/resets'
import { countPendingRecurring } from '../data/repo'

type PendingField = 'daily' | 'weekly' | 'daily22'

const RESET_TYPES: { type: RecurringType; field: PendingField; label: string }[] = [
  { type: 'daily', field: 'daily', label: 'quotidienne(s)' },
  { type: 'daily22', field: 'daily22', label: 'de ravitaillement' },
  { type: 'weekly', field: 'weekly', label: 'hebdomadaire(s)' }
]

const timers = new Map<RecurringType, NodeJS.Timeout>()
let getWindow: () => BrowserWindow | null = () => null

function iconPath(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'build', 'icon.png')
    : join(app.getAppPath(), 'build', 'icon.png')
}

function notify(body: string): void {
  if (!Notification.isSupported()) return
  const n = new Notification({ title: 'FFXIV Achievement Tracker', body, icon: iconPath() })
  n.on('click', () => {
    const w = getWindow()
    if (w) {
      if (w.isMinimized()) w.restore()
      w.show()
      w.focus()
      w.webContents.send('navigate-to', 'recurring')
    }
  })
  n.show()
}

function scheduleType(entry: (typeof RESET_TYPES)[number]): void {
  const now = new Date()
  // +1 s margin to be sure we are past the reset boundary.
  const delay = Math.max(0, nextReset(entry.type, now).getTime() - now.getTime()) + 1000

  const timer = setTimeout(() => {
    // At reset, tasks done during the previous period become "to do" again.
    const pending = countPendingRecurring()
    const n = pending[entry.field]
    if (n > 0) notify(`Reset : ${n} tâche(s) ${entry.label} à refaire.`)
    scheduleType(entry) // next period
  }, delay)

  timers.set(entry.type, timer)
}

/** Starts (or restarts) the reset reminders. */
export function startResetReminders(windowGetter: () => BrowserWindow | null): void {
  stopResetReminders()
  getWindow = windowGetter
  for (const entry of RESET_TYPES) scheduleType(entry)
}

/** Cancels every scheduled reminder. */
export function stopResetReminders(): void {
  for (const timer of timers.values()) clearTimeout(timer)
  timers.clear()
}
