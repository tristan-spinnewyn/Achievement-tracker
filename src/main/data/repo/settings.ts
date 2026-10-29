import type { Settings, SyncLogEntry } from '@shared/types'
import { store } from '../store'
import { sanitizeSettings } from '../sanitize'

const MAX_SYNC_LOG = 50

// ---------------------------------------------------------------- Settings

export function getSettings(): Settings {
  return store.user.settings
}

export function updateSettings(partial: Partial<Settings>): Settings {
  store.user.settings = { ...store.user.settings, ...sanitizeSettings(partial) }
  store.saveUser()
  return store.user.settings
}

// ---------------------------------------------------------------- Sync log

export function addSyncLog(entry: SyncLogEntry): void {
  store.user.syncLog.unshift(entry)
  if (store.user.syncLog.length > MAX_SYNC_LOG) store.user.syncLog.length = MAX_SYNC_LOG
  store.saveUser()
}

export function getSyncLog(): SyncLogEntry[] {
  return store.user.syncLog
}
