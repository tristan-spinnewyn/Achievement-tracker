import { useEffect, useState } from 'react'
import type { UpdateStatus } from '@shared/types'

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 Mo'
  const mb = bytes / (1024 * 1024)
  return `${mb.toFixed(1)} Mo`
}

export default function UpdateBanner() {
  const [status, setStatus] = useState<UpdateStatus>({ state: 'idle' })
  const [dismissed, setDismissed] = useState(false)
  const [installing, setInstalling] = useState(false)

  useEffect(() => {
    // Récupérer le statut initial
    window.api.updater.status().then((s) => {
      setStatus(s)
    })

    // Écouter les changements de statut en temps réel
    const unsubscribe = window.api.updater.onStatusChange((newStatus) => {
      setStatus(newStatus)
      // Si une nouvelle mise à jour est prête ou disponible, réafficher le bandeau même s'il avait été masqué
      if (newStatus.state === 'downloaded' || newStatus.state === 'available') {
        setDismissed(false)
      }
    })

    return unsubscribe
  }, [])

  // Si masqué ou dans un état inactif / à jour
  if (dismissed || status.state === 'idle' || status.state === 'checking' || status.state === 'not-available') {
    return null
  }

  const handleInstall = () => {
    setInstalling(true)
    window.api.updater.install()
  }

  const handleDownload = () => {
    window.api.updater.download()
  }

  return (
    <aside
      aria-label="Mise à jour de l'application"
      className="fixed bottom-4 right-4 z-50 w-96 max-w-[calc(100vw-2rem)] rounded-lg border border-slate-700 bg-slate-900/95 p-4 shadow-2xl backdrop-blur transition-all duration-300 animate-in fade-in slide-in-from-bottom-2"
    >
      {status.state === 'available' && (
        <div>
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-xl">🚀</span>
              <div>
                <h4 className="text-sm font-semibold text-white">
                  Mise à jour disponible
                </h4>
                <p className="text-xs text-slate-400">
                  Version <span className="font-mono text-emerald-400 font-medium">v{status.version}</span>
                </p>
              </div>
            </div>
            <button
              onClick={() => setDismissed(true)}
              className="text-slate-500 hover:text-slate-300 p-1 text-xs"
              title="Ignorer pour l'instant"
            >
              ✕
            </button>
          </div>

          {status.releaseNotes && (
            <div className="mt-2.5 max-h-24 overflow-y-auto rounded bg-slate-950/70 p-2 text-xs text-slate-300 font-mono whitespace-pre-line border border-slate-800">
              {status.releaseNotes}
            </div>
          )}

          <div className="mt-3 flex items-center justify-end gap-2">
            <button
              onClick={() => setDismissed(true)}
              className="rounded px-2.5 py-1 text-xs text-slate-400 hover:bg-slate-800 hover:text-slate-200"
            >
              Plus tard
            </button>
            <button
              onClick={handleDownload}
              className="rounded bg-emerald-600 px-3 py-1 text-xs font-medium text-white hover:bg-emerald-500 shadow"
            >
              Télécharger
            </button>
          </div>
        </div>
      )}

      {status.state === 'downloading' && (
        <div>
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-xl animate-bounce">⬇️</span>
              <div>
                <h4 className="text-sm font-semibold text-white">
                  Téléchargement de la v{status.version}
                </h4>
                <p className="text-xs text-slate-400">
                  {formatBytes(status.progress.transferred)} / {formatBytes(status.progress.total)}{' '}
                  {status.progress.bytesPerSecond > 0 && (
                    <span className="text-slate-500">
                      ({(status.progress.bytesPerSecond / (1024 * 1024)).toFixed(1)} Mo/s)
                    </span>
                  )}
                </p>
              </div>
            </div>
            <button
              onClick={() => setDismissed(true)}
              className="text-slate-500 hover:text-slate-300 p-1 text-xs"
              title="Réduire"
            >
              ✕
            </button>
          </div>

          <div className="mt-3">
            <div className="flex justify-between text-[11px] text-slate-400 mb-1">
              <span>Progression</span>
              <span className="font-semibold text-emerald-400">{status.progress.percent}%</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
              <div
                className="h-full bg-emerald-500 transition-all duration-300 ease-out"
                style={{ width: `${Math.min(100, Math.max(0, status.progress.percent))}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {status.state === 'downloaded' && (
        <div>
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-xl">✨</span>
              <div>
                <h4 className="text-sm font-semibold text-emerald-400">
                  Mise à jour prête !
                </h4>
                <p className="text-xs text-slate-300">
                  La version <span className="font-mono font-medium text-white">v{status.version}</span> a été téléchargée.
                </p>
              </div>
            </div>
            <button
              onClick={() => setDismissed(true)}
              className="text-slate-500 hover:text-slate-300 p-1 text-xs"
              title="Plus tard"
            >
              ✕
            </button>
          </div>

          <p className="mt-2 text-xs text-slate-400">
            Redémarrez l'application pour appliquer automatiquement la mise à jour.
          </p>

          <div className="mt-3 flex items-center justify-end gap-2">
            <button
              onClick={() => setDismissed(true)}
              className="rounded px-2.5 py-1 text-xs text-slate-400 hover:bg-slate-800 hover:text-slate-200"
            >
              Plus tard
            </button>
            <button
              onClick={handleInstall}
              disabled={installing}
              className="rounded bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500 shadow disabled:opacity-50"
            >
              {installing ? 'Redémarrage…' : 'Redémarrer et installer'}
            </button>
          </div>
        </div>
      )}

      {status.state === 'error' && (
        <div>
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-xl">⚠️</span>
              <div>
                <h4 className="text-sm font-semibold text-rose-400">
                  Échec de la mise à jour
                </h4>
                <p className="text-xs text-slate-400 line-clamp-2" title={status.message}>
                  {status.message}
                </p>
              </div>
            </div>
            <button
              onClick={() => setDismissed(true)}
              className="text-slate-500 hover:text-slate-300 p-1 text-xs"
            >
              ✕
            </button>
          </div>

          <div className="mt-3 flex items-center justify-end gap-2">
            <button
              onClick={() => setDismissed(true)}
              className="rounded px-2.5 py-1 text-xs text-slate-400 hover:bg-slate-800 hover:text-slate-200"
            >
              Fermer
            </button>
            <button
              onClick={() => window.api.updater.check()}
              className="rounded bg-slate-700 px-3 py-1 text-xs text-white hover:bg-slate-600"
            >
              Réessayer
            </button>
          </div>
        </div>
      )}
    </aside>
  )
}
