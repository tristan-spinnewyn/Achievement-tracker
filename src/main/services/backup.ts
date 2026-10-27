import { dialog, app, shell } from 'electron'
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { AutoBackupInfo, Settings } from '@shared/types'
import { store, type UserData } from '../data/store'
import { isSafeIconPath } from '../utils/icons'

/** Max size of an imported backup (real ones are a few hundred KB). */
const MAX_BACKUP_BYTES = 50 * 1024 * 1024

const RECORD_KEYS = ['progress', 'userMeta', 'tagsByAchievement', 'collections', 'collectionHashCache'] as const
const ARRAY_KEYS = ['syncLog', 'undoStack', 'redoStack'] as const
const REGIONS = ['na', 'eu', 'fr', 'de', 'ja']
const LANGUAGES = ['fr', 'en', 'de', 'ja']

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)
const isNullableString = (v: unknown): v is string | null => v === null || typeof v === 'string'

/** Keeps only known settings, with the right type (the others fall back to their default). */
function sanitizeSettings(raw: Record<string, unknown>): Partial<Settings> {
  const out: Partial<Settings> = {}
  if (isNullableString(raw.lodestoneCharacterId)) out.lodestoneCharacterId = raw.lodestoneCharacterId
  if (typeof raw.region === 'string' && REGIONS.includes(raw.region)) out.region = raw.region as Settings['region']
  if (typeof raw.language === 'string' && LANGUAGES.includes(raw.language)) out.language = raw.language as Settings['language']
  if (isNullableString(raw.lastSyncAt)) out.lastSyncAt = raw.lastSyncAt
  if (raw.theme === 'dark' || raw.theme === 'light') out.theme = raw.theme
  if (typeof raw.autoSync === 'boolean') out.autoSync = raw.autoSync
  if (typeof raw.autoBackupDocuments === 'boolean') out.autoBackupDocuments = raw.autoBackupDocuments
  const w = raw.suggestionWeights
  if (isRecord(w) && ['priority', 'points', 'categoryProximity'].every((k) => Number.isFinite(w[k]))) {
    out.suggestionWeights = w as unknown as Settings['suggestionWeights']
  }
  return out
}

/**
 * Validates the structure of an imported backup (untrusted file):
 * unknown keys ignored, types checked, suspicious icon paths neutralised.
 * Returns null if the file does not look like a backup.
 */
export function sanitizeImportedUser(raw: unknown): Partial<UserData> | null {
  if (!isRecord(raw) || (!raw.settings && !raw.progress && !raw.collections)) return null
  const out: Partial<UserData> = {}

  if ('settings' in raw) {
    if (!isRecord(raw.settings)) return null
    out.settings = sanitizeSettings(raw.settings) as Settings
  }
  for (const key of RECORD_KEYS) {
    if (!(key in raw)) continue
    if (!isRecord(raw[key])) return null
    ;(out as Record<string, unknown>)[key] = raw[key]
  }
  for (const key of ARRAY_KEYS) {
    if (!(key in raw)) continue
    if (!Array.isArray(raw[key])) return null
    ;(out as Record<string, unknown>)[key] = raw[key]
  }
  if ('recurringTasks' in raw) {
    if (!Array.isArray(raw.recurringTasks)) return null
    out.recurringTasks = raw.recurringTasks
      .filter((t): t is Record<string, unknown> => isRecord(t) && typeof t.id === 'string' && typeof t.name === 'string')
      .map((t) => ({ ...t, iconPath: isSafeIconPath(t.iconPath as string) ? t.iconPath : null })) as UserData['recurringTasks']
  }
  return out
}

export interface BackupResult {
  ok: boolean
  canceled?: boolean
  path?: string
  error?: string
}

export function getDocumentsBackupFolder(): string {
  return join(app.getPath('documents'), 'FFXIV Achievement Tracker')
}

export function getDocumentsBackupPath(): string {
  return join(getDocumentsBackupFolder(), 'userdata-backup.json')
}

export function getAutoBackupInfo(): AutoBackupInfo {
  const folder = getDocumentsBackupFolder()
  const path = getDocumentsBackupPath()
  const exists = existsSync(path)
  let lastSavedAt: string | null = null
  let sizeBytes: number | null = null
  if (exists) {
    try {
      const stat = statSync(path)
      lastSavedAt = stat.mtime.toISOString()
      sizeBytes = stat.size
    } catch {
      // ignore
    }
  }
  return {
    enabled: store.user.settings.autoBackupDocuments !== false,
    path,
    folder,
    exists,
    lastSavedAt,
    sizeBytes
  }
}

export async function openDocumentsBackupFolder(): Promise<string> {
  const folder = getDocumentsBackupFolder()
  mkdirSync(folder, { recursive: true })
  await shell.openPath(folder)
  return folder
}

/** Exports all user data to a JSON file chosen by the user. */
export async function exportUserData(): Promise<BackupResult> {
  const stamp = new Date().toISOString().slice(0, 10)
  const res = await dialog.showSaveDialog({
    title: 'Exporter mes données',
    defaultPath: join(getDocumentsBackupFolder(), `ffxiv-tracker-sauvegarde-${stamp}.json`),
    filters: [{ name: 'Sauvegarde JSON', extensions: ['json'] }]
  })
  if (res.canceled || !res.filePath) return { ok: false, canceled: true }
  try {
    writeFileSync(res.filePath, JSON.stringify(store.user, null, 2), 'utf8')
    return { ok: true, path: res.filePath }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/** Imports a backup file and replaces the user data. */
export async function importUserData(): Promise<BackupResult> {
  const res = await dialog.showOpenDialog({
    title: 'Importer une sauvegarde',
    defaultPath: getDocumentsBackupFolder(),
    properties: ['openFile'],
    filters: [{ name: 'Sauvegarde JSON', extensions: ['json'] }]
  })
  if (res.canceled || res.filePaths.length === 0) return { ok: false, canceled: true }
  try {
    if (statSync(res.filePaths[0]).size > MAX_BACKUP_BYTES) {
      return { ok: false, error: 'Fichier de sauvegarde invalide (trop volumineux).' }
    }
    const data = sanitizeImportedUser(JSON.parse(readFileSync(res.filePaths[0], 'utf8')))
    if (!data) {
      return { ok: false, error: 'Fichier de sauvegarde invalide.' }
    }
    store.replaceUser(data)
    return { ok: true, path: res.filePaths[0] }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}
