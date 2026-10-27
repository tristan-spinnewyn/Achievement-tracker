import { useEffect, useState } from 'react'
import type { UpdateStatus } from '@shared/types'

export default function UpdatesSection() {
  const [appVersion, setAppVersion] = useState<string>('')
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>({ state: 'idle' })
  const [checkingUpdates, setCheckingUpdates] = useState(false)

  useEffect(() => {
    window.api.updater.appVersion().then(setAppVersion)
    window.api.updater.status().then(setUpdateStatus)
    return window.api.updater.onStatusChange((s) => setUpdateStatus(s))
  }, [])

  const handleCheckUpdates = async () => {
    setCheckingUpdates(true)
    try {
      const s = await window.api.updater.check()
      setUpdateStatus(s)
    } finally {
      setCheckingUpdates(false)
    }
  }

  return (
    <section className="rounded-lg border border-slate-800 bg-slate-900/50 p-4">
      <h3 className="text-base font-semibold text-slate-100 mb-2">Application & Mises à jour</h3>
      <p className="text-xs text-slate-400 mb-3">
        Vérifie la disponibilité de nouvelles versions de FFXIV Achievement Tracker via GitHub Releases.
      </p>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded bg-slate-900/80 p-3 border border-slate-800/60">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-slate-300">Version actuelle :</span>
            <span className="font-mono text-sm text-emerald-400 font-semibold">
              {appVersion ? `v${appVersion}` : '…'}
            </span>
          </div>
          <div className="text-xs text-slate-400 mt-1">
            {updateStatus.state === 'idle' && 'Aucune recherche effectuée.'}
            {updateStatus.state === 'checking' && 'Recherche de mise à jour en cours…'}
            {updateStatus.state === 'not-available' && '✓ Vous utilisez la version la plus récente.'}
            {updateStatus.state === 'available' && `Une mise à jour (v${updateStatus.version}) est disponible !`}
            {updateStatus.state === 'downloading' && `Téléchargement en cours (${updateStatus.progress.percent}%)…`}
            {updateStatus.state === 'downloaded' && `✓ Mise à jour (v${updateStatus.version}) prête à être installée.`}
            {updateStatus.state === 'error' && `Erreur : ${updateStatus.message}`}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {updateStatus.state === 'downloaded' ? (
            <button
              onClick={() => window.api.updater.install()}
              className="rounded bg-emerald-600 hover:bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-white shadow"
            >
              Redémarrer et installer
            </button>
          ) : (
            <button
              onClick={handleCheckUpdates}
              disabled={checkingUpdates || updateStatus.state === 'checking' || updateStatus.state === 'downloading'}
              className="rounded bg-slate-800 hover:bg-slate-700 px-3 py-1.5 text-xs text-slate-200 hover:text-white transition-colors disabled:opacity-50"
            >
              {checkingUpdates || updateStatus.state === 'checking' ? 'Vérification…' : 'Rechercher des mises à jour'}
            </button>
          )}
        </div>
      </div>
    </section>
  )
}
