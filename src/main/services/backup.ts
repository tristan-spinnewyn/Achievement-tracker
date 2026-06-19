import { dialog, app } from 'electron'
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { store, type UserData } from '../data/store'

export interface BackupResult {
  ok: boolean
  canceled?: boolean
  path?: string
  error?: string
}

/** Exporte toutes les données utilisateur vers un fichier JSON choisi par l'utilisateur. */
export async function exportUserData(): Promise<BackupResult> {
  const stamp = new Date().toISOString().slice(0, 10)
  const res = await dialog.showSaveDialog({
    title: 'Exporter mes données',
    defaultPath: join(app.getPath('documents'), `ffxiv-tracker-sauvegarde-${stamp}.json`),
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

/** Importe un fichier de sauvegarde et remplace les données utilisateur. */
export async function importUserData(): Promise<BackupResult> {
  const res = await dialog.showOpenDialog({
    title: 'Importer une sauvegarde',
    properties: ['openFile'],
    filters: [{ name: 'Sauvegarde JSON', extensions: ['json'] }]
  })
  if (res.canceled || res.filePaths.length === 0) return { ok: false, canceled: true }
  try {
    const data = JSON.parse(readFileSync(res.filePaths[0], 'utf8')) as Partial<UserData>
    if (!data || typeof data !== 'object' || (!data.settings && !data.progress && !data.collections)) {
      return { ok: false, error: 'Fichier de sauvegarde invalide.' }
    }
    store.replaceUser(data)
    return { ok: true, path: res.filePaths[0] }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}
