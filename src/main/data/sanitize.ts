/**
 * Validation of data that crosses a trust boundary: IPC arguments from the
 * renderer and backup files read from disk. Every value is type-checked and
 * every record key is constrained, so that no input can reach
 * `Object.prototype` (e.g. an achievement id of "__proto__").
 */

import type { RecurringType, Settings, UndoableAction } from '@shared/types'
import type { UserData } from './store'
import { isSafeIconPath } from '../utils/icons'

const REGIONS = ['na', 'eu', 'fr', 'de', 'ja']
const LANGUAGES = ['fr', 'en', 'de', 'ja']
const RECURRING_TYPES: RecurringType[] = ['daily', 'weekly', 'daily22']
const UNDO_TYPES: UndoableAction['type'][] = [
  'setCompletion',
  'setPriority',
  'setFocus',
  'setNote',
  'setTags',
  'setDeadline'
]
/** Records keyed by achievement id. */
const ACHIEVEMENT_RECORD_KEYS = ['progress', 'userMeta'] as const
const MAX_TEXT_LENGTH = 10_000

export const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)
const isNullableString = (v: unknown): v is string | null => v === null || typeof v === 'string'
const isNumericKey = (k: string): boolean => /^\d+$/.test(k)
/** Collection keys are `${type}:${id}` or `${type}:${hash}`. */
const isCollectionKey = (k: string): boolean => /^[a-z]+:[A-Za-z0-9]+$/.test(k)

/** An achievement id is a positive safe integer. */
export function isAchievementId(v: unknown): v is number {
  return typeof v === 'number' && Number.isSafeInteger(v) && v > 0
}

export function assertAchievementId(v: unknown): asserts v is number {
  if (!isAchievementId(v)) throw new TypeError(`Invalid achievement id: ${String(v)}`)
}

export function assertString(v: unknown, label: string): asserts v is string {
  if (typeof v !== 'string' || v.length > MAX_TEXT_LENGTH) throw new TypeError(`Invalid ${label}`)
}

export function assertRecurringType(v: unknown): asserts v is RecurringType {
  if (!RECURRING_TYPES.includes(v as RecurringType)) throw new TypeError(`Invalid recurring type: ${String(v)}`)
}

/** Returns the icon path if it is safe to use as a cache file name, otherwise null. */
export function safeIconPathOrNull(v: unknown): string | null {
  return isSafeIconPath(v as string) ? (v as string) : null
}

/** Keeps only known settings, with the right type (the others are dropped). */
export function sanitizeSettings(raw: unknown): Partial<Settings> {
  const out: Partial<Settings> = {}
  if (!isRecord(raw)) return out
  if (isNullableString(raw.lodestoneCharacterId)) out.lodestoneCharacterId = raw.lodestoneCharacterId
  if (typeof raw.region === 'string' && REGIONS.includes(raw.region)) out.region = raw.region as Settings['region']
  if (typeof raw.language === 'string' && LANGUAGES.includes(raw.language)) out.language = raw.language as Settings['language']
  if (isNullableString(raw.lastSyncAt)) out.lastSyncAt = raw.lastSyncAt
  if (raw.theme === 'dark' || raw.theme === 'light') out.theme = raw.theme
  if (typeof raw.autoSync === 'boolean') out.autoSync = raw.autoSync
  if (typeof raw.autoBackupDocuments === 'boolean') out.autoBackupDocuments = raw.autoBackupDocuments
  const w = raw.suggestionWeights
  if (isRecord(w) && ['priority', 'points', 'categoryProximity'].every((k) => Number.isFinite(w[k]))) {
    out.suggestionWeights = {
      priority: w.priority as number,
      points: w.points as number,
      categoryProximity: w.categoryProximity as number
    }
  }
  return out
}

/** Keeps only well-formed undo/redo entries. */
export function sanitizeUndoStack(raw: unknown[]): UndoableAction[] {
  return raw.filter(
    (a): a is UndoableAction =>
      isRecord(a) &&
      UNDO_TYPES.includes(a.type as UndoableAction['type']) &&
      isAchievementId(a.achievementId) &&
      isRecord(a.previousData) &&
      isRecord(a.newData)
  )
}

/** Copies the entries of a record whose key and value pass the given checks. */
function filterRecord(
  raw: Record<string, unknown>,
  isValidKey: (k: string) => boolean,
  mapValue: (v: unknown) => unknown | undefined
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(raw)) {
    if (!isValidKey(k)) continue
    const mapped = mapValue(v)
    if (mapped !== undefined) out[k] = mapped
  }
  return out
}

const recordOrUndefined = (v: unknown): unknown => (isRecord(v) ? v : undefined)
const stringOrUndefined = (v: unknown): unknown => (typeof v === 'string' ? v : undefined)
const stringArrayOrUndefined = (v: unknown): unknown => {
  if (!Array.isArray(v)) return undefined
  const tags = v.filter((t): t is string => typeof t === 'string')
  return tags.length ? tags : undefined
}

/**
 * Validates the structure of a backup (untrusted file):
 * unknown keys ignored, types checked, suspicious ids and icon paths neutralised.
 * Returns null if the file does not look like a backup.
 */
export function sanitizeImportedUser(raw: unknown): Partial<UserData> | null {
  if (!isRecord(raw) || (!raw.settings && !raw.progress && !raw.collections)) return null
  const out: Partial<UserData> = {}

  if ('settings' in raw) {
    if (!isRecord(raw.settings)) return null
    out.settings = sanitizeSettings(raw.settings) as Settings
  }
  for (const key of ACHIEVEMENT_RECORD_KEYS) {
    if (!(key in raw)) continue
    if (!isRecord(raw[key])) return null
    ;(out as Record<string, unknown>)[key] = filterRecord(raw[key], isNumericKey, recordOrUndefined)
  }
  if ('tagsByAchievement' in raw) {
    if (!isRecord(raw.tagsByAchievement)) return null
    out.tagsByAchievement = filterRecord(raw.tagsByAchievement, isNumericKey, stringArrayOrUndefined) as UserData['tagsByAchievement']
  }
  if ('collections' in raw) {
    if (!isRecord(raw.collections)) return null
    out.collections = filterRecord(raw.collections, isCollectionKey, recordOrUndefined) as UserData['collections']
  }
  if ('collectionHashCache' in raw) {
    if (!isRecord(raw.collectionHashCache)) return null
    out.collectionHashCache = filterRecord(raw.collectionHashCache, isCollectionKey, stringOrUndefined) as UserData['collectionHashCache']
  }
  if ('syncLog' in raw) {
    if (!Array.isArray(raw.syncLog)) return null
    out.syncLog = raw.syncLog.filter(isRecord) as unknown as UserData['syncLog']
  }
  for (const key of ['undoStack', 'redoStack'] as const) {
    if (!(key in raw)) continue
    const stack = raw[key]
    if (!Array.isArray(stack)) return null
    out[key] = sanitizeUndoStack(stack)
  }
  if ('recurringTasks' in raw) {
    if (!Array.isArray(raw.recurringTasks)) return null
    out.recurringTasks = raw.recurringTasks
      .filter((t): t is Record<string, unknown> => isRecord(t) && typeof t.id === 'string' && typeof t.name === 'string')
      .map((t) => ({ ...t, iconPath: safeIconPathOrNull(t.iconPath) })) as UserData['recurringTasks']
  }
  return out
}
