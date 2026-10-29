import { describe, it, expect, beforeEach } from 'vitest'
import { existsSync, readFileSync, rmSync, mkdirSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { store } from '../src/main/data/store'
import {
  getDocumentsBackupFolder,
  getDocumentsBackupPath,
  getAutoBackupInfo,
  openDocumentsBackupFolder,
  exportUserData,
  importUserData,
  sanitizeImportedUser
} from '../src/main/services/backup'
import { setMockDialog, TEST_USER_DATA } from './stubs/electron'

describe('Automatic mirror backup in My Documents', () => {
  const docFolder = getDocumentsBackupFolder()
  const docPath = getDocumentsBackupPath()

  beforeEach(() => {
    // Clean up the temporary folder
    if (existsSync(docPath)) {
      try {
        rmSync(docPath, { force: true })
      } catch {
        // ignore
      }
    }
  })

  it('builds a valid path in the Documents folder', () => {
    expect(docFolder).toContain('FFXIV Achievement Tracker')
    expect(docPath).toContain('userdata-backup.json')
  })

  it('automatically writes a mirror copy on store.saveUser()', () => {
    store.init()
    store.user.settings.autoBackupDocuments = true
    store.user.progress['123'] = {
      achievementId: 123,
      completed: true,
      completedDate: '2026-09-17',
      source: 'manual',
      updatedAt: '2026-09-17T22:00:00Z'
    }

    store.saveUser()

    expect(existsSync(docPath)).toBe(true)
    const content = JSON.parse(readFileSync(docPath, 'utf8'))
    expect(content.progress['123']).toBeDefined()
    expect(content.progress['123'].completed).toBe(true)
  })

  it('provides reliable status information via getAutoBackupInfo()', () => {
    store.init()
    store.user.settings.autoBackupDocuments = true
    store.saveUser()

    const info = getAutoBackupInfo()
    expect(info.enabled).toBe(true)
    expect(info.exists).toBe(true)
    expect(info.path).toBe(docPath)
    expect(info.lastSavedAt).toBeDefined()
    expect(info.sizeBytes).toBeGreaterThan(0)
  })

  it('does not update the Documents mirror when autoBackupDocuments is false', () => {
    store.init()
    store.user.settings.autoBackupDocuments = false
    if (existsSync(docPath)) rmSync(docPath, { force: true })

    store.saveUser()

    expect(existsSync(docPath)).toBe(false)
  })

  it('automatically restores from Documents at startup when local data is empty', () => {
    // 1. Write a fake backup into Documents
    mkdirSync(docFolder, { recursive: true })
    const dummyBackup = {
      settings: { lodestoneCharacterId: '999999' },
      progress: {
        '4032': { achievementId: 4032, completed: true, completedDate: '2026-09-17', source: 'manual', updatedAt: '2026-09-17' }
      },
      collections: {
        'beast:1': { owned: true, ownedDate: '2026-09-17', source: 'manual', updatedAt: '2026-09-17' }
      }
    }
    const { writeFileSync } = require('fs')
    writeFileSync(docPath, JSON.stringify(dummyBackup), 'utf8')

    // 2. Delete userdata.json in userData to simulate a new PC
    const userJsonPath = join(TEST_USER_DATA, 'userdata.json')
    if (existsSync(userJsonPath)) rmSync(userJsonPath, { force: true })

    // 3. Initialise the store
    store.init()

    // The store must have restored the data from the Documents backup
    expect(store.user.progress['4032']).toBeDefined()
    expect(store.user.progress['4032'].completed).toBe(true)
    expect(store.user.collections['beast:1']).toBeDefined()
    expect(store.user.collections['beast:1'].owned).toBe(true)
    expect(store.user.settings.lodestoneCharacterId).toBe('999999')
  })

  it('opens the backup folder in Documents', async () => {
    const folder = await openDocumentsBackupFolder()
    expect(folder).toBe(docFolder)
    expect(existsSync(folder)).toBe(true)
  })

  it('handles user data export (cancelled or confirmed)', async () => {
    store.init()
    // 1. Cancelled
    setMockDialog.save({ canceled: true })
    const resCancel = await exportUserData()
    expect(resCancel.ok).toBe(false)
    expect(resCancel.canceled).toBe(true)

    // 2. Confirmed
    const exportFile = join(tmpdir(), 'export-test.json')
    setMockDialog.save({ canceled: false, filePath: exportFile })
    const resSuccess = await exportUserData()
    expect(resSuccess.ok).toBe(true)
    expect(resSuccess.path).toBe(exportFile)
    expect(existsSync(exportFile)).toBe(true)
    const content = JSON.parse(readFileSync(exportFile, 'utf8'))
    expect(content.settings).toBeDefined()
    rmSync(exportFile, { force: true })
  })

  it('handles user data import (cancelled, invalid or valid)', async () => {
    const { writeFileSync } = require('fs')
    store.init()
    // 1. Cancelled
    setMockDialog.open({ canceled: true, filePaths: [] })
    const resCancel = await importUserData()
    expect(resCancel.ok).toBe(false)
    expect(resCancel.canceled).toBe(true)

    // 2. Invalid file
    const invalidFile = join(tmpdir(), 'invalid-test.json')
    writeFileSync(invalidFile, JSON.stringify({ random: 123 }), 'utf8')
    setMockDialog.open({ canceled: false, filePaths: [invalidFile] })
    const resInvalid = await importUserData()
    expect(resInvalid.ok).toBe(false)
    expect(resInvalid.error).toContain('invalide')
    rmSync(invalidFile, { force: true })

    // 3. Valid file
    const validFile = join(tmpdir(), 'valid-test.json')
    writeFileSync(
      validFile,
      JSON.stringify({
        settings: { lodestoneCharacterId: '888888' },
        progress: { '10': { achievementId: 10, completed: true, completedDate: '2026-09-20', source: 'manual', updatedAt: '2026-09-20' } }
      }),
      'utf8'
    )
    setMockDialog.open({ canceled: false, filePaths: [validFile] })
    const resValid = await importUserData()
    expect(resValid.ok).toBe(true)
    expect(store.user.settings.lodestoneCharacterId).toBe('888888')
    expect(store.user.progress['10'].completed).toBe(true)
    rmSync(validFile, { force: true })
  })

  it('reports an error when the export destination is not writable', async () => {
    store.init()
    // A directory cannot be overwritten as a file
    setMockDialog.save({ canceled: false, filePath: tmpdir() })
    const res = await exportUserData()
    expect(res.ok).toBe(false)
    expect(res.error).toBeTruthy()
  })

  it('rejects an oversized backup without reading it', async () => {
    const { closeSync, openSync, ftruncateSync } = require('fs')
    store.init()
    const bigFile = join(tmpdir(), 'oversized-test.json')
    const fd = openSync(bigFile, 'w')
    ftruncateSync(fd, 50 * 1024 * 1024 + 1) // sparse file, nothing actually written
    closeSync(fd)
    setMockDialog.open({ canceled: false, filePaths: [bigFile] })
    const res = await importUserData()
    expect(res.ok).toBe(false)
    expect(res.error).toContain('trop volumineux')
    rmSync(bigFile, { force: true })
  })

  it('reports an error for a malformed JSON backup', async () => {
    const { writeFileSync } = require('fs')
    store.init()
    const badFile = join(tmpdir(), 'malformed-test.json')
    writeFileSync(badFile, '{ not json', 'utf8')
    setMockDialog.open({ canceled: false, filePaths: [badFile] })
    const res = await importUserData()
    expect(res.ok).toBe(false)
    expect(res.error).toBeTruthy()
    rmSync(badFile, { force: true })
  })

  it('sanitises an imported backup (untrusted file)', () => {
    expect(sanitizeImportedUser(null)).toBeNull()
    expect(sanitizeImportedUser([1, 2])).toBeNull()
    expect(sanitizeImportedUser({ settings: 'oops' })).toBeNull()
    expect(sanitizeImportedUser({ progress: [] })).toBeNull()
    expect(sanitizeImportedUser({ progress: {}, syncLog: {} })).toBeNull()
    expect(sanitizeImportedUser({ progress: {}, recurringTasks: 'x' })).toBeNull()

    const out = sanitizeImportedUser({
      settings: {
        lodestoneCharacterId: '123',
        region: 'mars',
        language: 'en',
        theme: 'light',
        autoSync: 'yes',
        autoBackupDocuments: false,
        lastSyncAt: null,
        suggestionWeights: { priority: 1, points: 2, categoryProximity: 3 },
        injected: true
      },
      progress: {},
      syncLog: [],
      unknownKey: { a: 1 },
      recurringTasks: [
        { id: 'a', name: 'ok', iconPath: 'ui/icon/000000/000001.tex' },
        { id: 'b', name: 'evil', iconPath: '..\..\Startup\evil.bat' },
        { name: 'sans id' },
        'pas un objet'
      ]
    })!
    expect(out.settings).toEqual({
      lodestoneCharacterId: '123',
      language: 'en',
      theme: 'light',
      autoBackupDocuments: false,
      lastSyncAt: null,
      suggestionWeights: { priority: 1, points: 2, categoryProximity: 3 }
    })
    expect(out).not.toHaveProperty('unknownKey')
    expect(out.recurringTasks!.map((t) => [t.id, t.iconPath])).toEqual([
      ['a', 'ui/icon/000000/000001.tex'],
      ['b', null]
    ])
  })
})
