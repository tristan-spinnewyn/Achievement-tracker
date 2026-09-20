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
  importUserData
} from '../src/main/services/backup'
import { setMockDialog } from './stubs/electron'

describe('Sauvegarde miroir automatique dans Mes Documents', () => {
  const docFolder = getDocumentsBackupFolder()
  const docPath = getDocumentsBackupPath()

  beforeEach(() => {
    // Nettoyer le dossier temporaire
    if (existsSync(docPath)) {
      try {
        rmSync(docPath, { force: true })
      } catch {
        // ignore
      }
    }
  })

  it('génère un chemin valide dans le dossier Documents', () => {
    expect(docFolder).toContain('FFXIV Achievement Tracker')
    expect(docPath).toContain('userdata-backup.json')
  })

  it('écrit automatiquement une copie miroir lors de store.saveUser()', () => {
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

  it('fournit des informations d’état fiables via getAutoBackupInfo()', () => {
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

  it('ne met pas à jour le miroir Documents si autoBackupDocuments est false', () => {
    store.init()
    store.user.settings.autoBackupDocuments = false
    if (existsSync(docPath)) rmSync(docPath, { force: true })

    store.saveUser()

    expect(existsSync(docPath)).toBe(false)
  })

  it('restaure automatiquement depuis Documents au démarrage si les données locales sont vierges', () => {
    // 1. Écrire une fausse sauvegarde dans Documents
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

    // 2. Supprimer userdata.json dans userData pour simuler un nouveau PC
    const userJsonPath = join(tmpdir(), 'userdata.json')
    if (existsSync(userJsonPath)) rmSync(userJsonPath, { force: true })

    // 3. Initialiser le store
    store.init()

    // Le store doit avoir restauré les données depuis le backup Documents
    expect(store.user.progress['4032']).toBeDefined()
    expect(store.user.progress['4032'].completed).toBe(true)
    expect(store.user.collections['beast:1']).toBeDefined()
    expect(store.user.collections['beast:1'].owned).toBe(true)
    expect(store.user.settings.lodestoneCharacterId).toBe('999999')
  })

  it('ouvre le dossier de sauvegarde dans Documents', async () => {
    const folder = await openDocumentsBackupFolder()
    expect(folder).toBe(docFolder)
    expect(existsSync(folder)).toBe(true)
  })

  it('gère l’exportation de données utilisateur (annulée ou confirmée)', async () => {
    store.init()
    // 1. Annulé
    setMockDialog.save({ canceled: true })
    const resCancel = await exportUserData()
    expect(resCancel.ok).toBe(false)
    expect(resCancel.canceled).toBe(true)

    // 2. Confirmé
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

  it('gère l’importation de données utilisateur (annulée, invalide ou valide)', async () => {
    const { writeFileSync } = require('fs')
    store.init()
    // 1. Annulé
    setMockDialog.open({ canceled: true, filePaths: [] })
    const resCancel = await importUserData()
    expect(resCancel.ok).toBe(false)
    expect(resCancel.canceled).toBe(true)

    // 2. Fichier invalide
    const invalidFile = join(tmpdir(), 'invalid-test.json')
    writeFileSync(invalidFile, JSON.stringify({ random: 123 }), 'utf8')
    setMockDialog.open({ canceled: false, filePaths: [invalidFile] })
    const resInvalid = await importUserData()
    expect(resInvalid.ok).toBe(false)
    expect(resInvalid.error).toContain('invalide')
    rmSync(invalidFile, { force: true })

    // 3. Fichier valide
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
})