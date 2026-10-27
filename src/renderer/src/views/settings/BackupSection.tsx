import { useEffect, useState } from 'react'
import type { AutoBackupInfo, Settings } from '@shared/types'
import { fmt, sectionClass } from './shared'

interface Props {
  settings: Settings
  onUpdate: (patch: Partial<Settings>) => Promise<void>
  /** Called after a successful import so the parent can reload everything. */
  onImported: () => Promise<void>
}

export default function BackupSection({ settings, onUpdate, onImported }: Props) {
  const [backupMsg, setBackupMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [autoBackup, setAutoBackup] = useState<AutoBackupInfo | null>(null)

  // Every settings save rewrites the mirror file: refresh its info whenever settings change.
  useEffect(() => {
    window.api.data
      .autoBackupInfo()
      .then(setAutoBackup)
      .catch(() => {
        // ignore
      })
  }, [settings])

  const doExport = async () => {
    setBackupMsg(null)
    const r = await window.api.data.export()
    if (r.canceled) return
    setBackupMsg(
      r.ok ? { ok: true, text: `Exporté : ${r.path}` } : { ok: false, text: r.error ?? 'Échec.' }
    )
  }

  const doImport = async () => {
    setBackupMsg(null)
    const r = await window.api.data.import()
    if (r.canceled) return
    if (r.ok) {
      setBackupMsg({ ok: true, text: 'Sauvegarde importée. Données rechargées.' })
      await onImported()
    } else {
      setBackupMsg({ ok: false, text: r.error ?? 'Échec de l’import.' })
    }
  }

  return (
    <section className={`mt-6 ${sectionClass}`}>
      <h3 className="font-semibold">Sauvegarde automatique dans « Mes Documents »</h3>
      <p className="text-xs text-slate-400">
        Une copie miroir permanente de vos données est automatiquement enregistrée à chaque modification dans votre dossier <b>Documents</b>.
        Idéal si vos Documents sont synchronisés avec un cloud (OneDrive, Google Drive, iCloud) ou pour transférer facilement vos données lors d'un changement de PC.
      </p>

      <label className="flex items-center gap-2 text-sm text-slate-300">
        <input
          type="checkbox"
          checked={settings.autoBackupDocuments !== false}
          onChange={(e) => onUpdate({ autoBackupDocuments: e.target.checked })}
          className="h-4 w-4 accent-emerald-500"
        />
        Sauvegarder automatiquement dans Mes Documents à chaque modification
      </label>

      {autoBackup && (
        <div className="rounded bg-slate-900/80 p-3 text-xs text-slate-400 space-y-1.5 border border-slate-800/60">
          <div className="flex items-center justify-between">
            <span className="font-medium text-slate-300">Fichier miroir :</span>
            <span className={autoBackup.exists ? 'text-emerald-400 font-medium' : 'text-amber-400'}>
              {autoBackup.exists ? '✓ Actif & à jour' : 'En attente de première écriture'}
            </span>
          </div>
          <div className="font-mono text-slate-400 break-all text-[11px] select-all bg-slate-950 px-2 py-1 rounded">
            {autoBackup.path}
          </div>
          {autoBackup.lastSavedAt && (
            <div className="text-slate-500 pt-0.5">
              Dernière écriture : {fmt(autoBackup.lastSavedAt)}
              {autoBackup.sizeBytes != null && ` (${Math.round(autoBackup.sizeBytes / 1024)} ko)`}
            </div>
          )}
          <div className="pt-1.5">
            <button
              onClick={() => window.api.data.openDocumentsFolder()}
              className="rounded bg-slate-800 hover:bg-slate-700 px-2.5 py-1 text-slate-300 hover:text-white transition-colors"
            >
              📂 Ouvrir le dossier de sauvegarde
            </button>
          </div>
        </div>
      )}

      <div className="pt-3 border-t border-slate-800">
        <div className="text-xs font-medium text-slate-300 mb-1">Sauvegarde & Restauration manuelles</div>
        <p className="text-xs text-slate-500 mb-3">
          Exporte tout ton suivi (cases cochées, priorités, notes, collections, tâches récurrentes) dans un fichier JSON externe, ou restaure-le.
          L'import <b>remplace</b> les données actuelles.
        </p>
        <div className="flex gap-2">
          <button
            onClick={doExport}
            className="rounded bg-slate-700 px-3 py-1.5 text-sm hover:bg-slate-600"
          >
            Exporter…
          </button>
          <button
            onClick={doImport}
            className="rounded bg-slate-700 px-3 py-1.5 text-sm hover:bg-slate-600"
          >
            Importer…
          </button>
        </div>
        {backupMsg && (
          <p className={`mt-2 text-xs ${backupMsg.ok ? 'text-emerald-400' : 'text-red-400'}`}>
            {backupMsg.text}
          </p>
        )}
      </div>
    </section>
  )
}
