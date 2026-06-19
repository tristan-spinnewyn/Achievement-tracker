/**
 * Notifications planifiées aux resets FFXIV.
 *
 * Pour chaque type récurrent, on programme un `setTimeout` jusqu'au prochain reset
 * (≤ 7 jours, sous la limite ~24,8 j de setTimeout) ; au déclenchement, on notifie
 * les tâches encore en attente puis on replanifie la période suivante.
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
  // +1 s de marge pour être certain d'être passé la frontière du reset.
  const delay = Math.max(0, nextReset(entry.type, now).getTime() - now.getTime()) + 1000

  const timer = setTimeout(() => {
    // Au reset, les tâches faites la période précédente redeviennent « à faire ».
    const pending = countPendingRecurring()
    const n = pending[entry.field]
    if (n > 0) notify(`Reset : ${n} tâche(s) ${entry.label} à refaire.`)
    scheduleType(entry) // période suivante
  }, delay)

  timers.set(entry.type, timer)
}

/** Démarre (ou redémarre) les rappels de reset. */
export function startResetReminders(windowGetter: () => BrowserWindow | null): void {
  stopResetReminders()
  getWindow = windowGetter
  for (const entry of RESET_TYPES) scheduleType(entry)
}

/** Annule tous les rappels planifiés. */
export function stopResetReminders(): void {
  for (const timer of timers.values()) clearTimeout(timer)
  timers.clear()
}
