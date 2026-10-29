import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { writeFileSync, rmSync, mkdirSync } from 'fs'
import { store } from '../src/main/data/store'
import * as repo from '../src/main/data/repo'
import { sanitizeImportedUser, getDocumentsBackupFolder, getDocumentsBackupPath } from '../src/main/services/backup'

const polluted = (): boolean => ({} as Record<string, unknown>).note !== undefined ||
  ({} as Record<string, unknown>).priority !== undefined ||
  ({} as Record<string, unknown>).completed !== undefined

beforeEach(() => {
  store.init()
  store.replaceUser({ settings: { ...store.user.settings, autoBackupDocuments: false } })
})

afterEach(() => {
  // Never leak a polluted prototype into other tests
  for (const k of ['note', 'priority', 'completed', 'inFocus', 'focusOrder', 'deadline']) {
    delete (Object.prototype as Record<string, unknown>)[k]
  }
})

describe('imported undo history (untrusted backup file)', () => {
  it('drops undo/redo entries whose achievementId is not a positive integer', () => {
    const out = sanitizeImportedUser({
      progress: {},
      undoStack: [
        { type: 'setNote', achievementId: '__proto__', timestamp: '', previousData: { note: 'x' }, newData: {} },
        { type: 'setNote', achievementId: 12, timestamp: '', previousData: { note: 'ok' }, newData: { note: null } },
        'garbage'
      ],
      redoStack: [{ type: 'setPriority', achievementId: -1, timestamp: '', previousData: {}, newData: {} }]
    })
    expect(out?.undoStack).toEqual([
      { type: 'setNote', achievementId: 12, timestamp: '', previousData: { note: 'ok' }, newData: { note: null } }
    ])
    expect(out?.redoStack).toEqual([])
  })

  it('cannot pollute Object.prototype when undoing an imported action', () => {
    const out = sanitizeImportedUser({
      progress: {},
      undoStack: [
        { type: 'setNote', achievementId: '__proto__', timestamp: '', previousData: { note: 'pwned' }, newData: {} }
      ]
    })
    store.replaceUser({ ...out, settings: { ...store.user.settings, autoBackupDocuments: false } })
    repo.undo()
    expect(polluted()).toBe(false)
  })

  it('ignores a crafted action already present in the store when undoing', () => {
    store.user.undoStack.push({
      type: 'setNote',
      achievementId: '__proto__' as unknown as number,
      timestamp: '',
      previousData: { note: 'pwned' },
      newData: {}
    })
    repo.undo()
    expect(polluted()).toBe(false)
  })

  it('keeps only string arrays in tagsByAchievement', () => {
    const out = sanitizeImportedUser({
      progress: {},
      tagsByAchievement: { '1': ['raid', 3, 'pvp'], '2': 'oops', __proto__: ['x'] }
    })
    expect(out?.tagsByAchievement).toEqual({ '1': ['raid', 'pvp'] })
  })

  it('keeps only well-keyed collection entries and string hash names', () => {
    const out = sanitizeImportedUser({
      collections: { 'mount:1': { owned: true }, constructor: { owned: true }, 'mount:2': 'oops' },
      collectionHashCache: { 'mount:ab12': 'Chocobo', 'mount:cd34': 7 }
    })
    expect(out?.collections).toEqual({ 'mount:1': { owned: true } })
    expect(out?.collectionHashCache).toEqual({ 'mount:ab12': 'Chocobo' })
    expect(sanitizeImportedUser({ progress: {}, tagsByAchievement: [] })).toBeNull()
    expect(sanitizeImportedUser({ progress: {}, collectionHashCache: 'x' })).toBeNull()
    expect(sanitizeImportedUser({ progress: {}, undoStack: {} })).toBeNull()
  })

  it('ignores a non-object settings update', () => {
    const before = { ...repo.getSettings() }
    expect(repo.updateSettings(null as never)).toEqual(before)
  })
})

describe('IPC mutation arguments (renderer is not trusted blindly)', () => {
  it('rejects a non-integer achievement id instead of writing through the prototype', () => {
    const bad = '__proto__' as unknown as number
    expect(() => repo.setNote(bad, 'pwned')).toThrow()
    expect(() => repo.setPriority(bad, 3)).toThrow()
    expect(() => repo.setFocus(bad, true)).toThrow()
    expect(() => repo.setDeadline(bad, '2026-01-01')).toThrow()
    expect(() => repo.setManualCompletion(bad, true)).toThrow()
    expect(() => repo.setAchievementTags(bad, ['x'])).toThrow()
    expect(() => repo.reorderFocus([bad])).toThrow()
    expect(polluted()).toBe(false)
  })

  it('rejects non-string tags', () => {
    expect(() => repo.setAchievementTags(1, [{} as unknown as string])).toThrow()
  })

  it('validates new recurring tasks', () => {
    expect(() => repo.addRecurringTask({ name: 42 as unknown as string, type: 'daily' })).toThrow()
    expect(() => repo.addRecurringTask({ name: 'ok', type: 'hourly' as never })).toThrow()
    const t = repo.addRecurringTask({ name: 'ok', type: 'weekly', iconPath: '../../etc/passwd' })
    expect(t.iconPath).toBeNull()
  })

  it('only accepts known settings with the right type', () => {
    const s = repo.updateSettings({
      region: 'mars',
      theme: 'light',
      injected: true,
      lodestoneCharacterId: { $: 1 }
    } as never)
    expect(s.region).toBe('eu')
    expect(s.theme).toBe('light')
    expect(s).not.toHaveProperty('injected')
    expect(s.lodestoneCharacterId).toBeNull()
  })
})

describe('startup auto-restore from the Documents backup', () => {
  afterEach(() => rmSync(getDocumentsBackupPath(), { force: true }))

  it('sanitizes the Documents backup before using it', () => {
    rmSync(store['userPath' as keyof typeof store] as unknown as string, { force: true })
    mkdirSync(getDocumentsBackupFolder(), { recursive: true })
    writeFileSync(
      getDocumentsBackupPath(),
      JSON.stringify({
        settings: { region: 'mars', injected: true },
        progress: { '1': { achievementId: 1, completed: true } },
        undoStack: [{ type: 'setNote', achievementId: '__proto__', previousData: {}, newData: {} }]
      })
    )
    store.init()
    expect(store.user.settings.region).toBe('eu')
    expect(store.user.settings).not.toHaveProperty('injected')
    expect(store.user.undoStack).toEqual([])
    expect(store.user.progress['1']).toBeDefined()
  })
})
