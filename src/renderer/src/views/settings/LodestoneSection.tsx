import { useEffect, useState } from 'react'
import type { Region, Settings, SyncLogEntry, SyncResult } from '@shared/types'
import { SYNCABLE_COLLECTIONS } from '@shared/types'
import { useStore } from '../../store/useStore'
import { ctrl, fmt, sectionClass } from './shared'

interface Props {
  settings: Settings
  onUpdate: (patch: Partial<Settings>) => Promise<void>
  /** Called after a sync so the parent can reload settings and collection counts. */
  onSynced: () => Promise<void>
  /** Bumped by the parent when the sync log may have changed (e.g. after an import). */
  logVersion: number
}

export default function LodestoneSection({ settings, onUpdate, onSynced, logVersion }: Props) {
  const [log, setLog] = useState<SyncLogEntry[]>([])
  const [syncing, setSyncing] = useState(false)
  const [result, setResult] = useState<SyncResult | null>(null)

  const loadLog = async () => setLog(await window.api.lodestone.syncLog())

  useEffect(() => {
    loadLog()
  }, [logVersion])

  const sync = async () => {
    setSyncing(true)
    setResult(null)
    try {
      const r = await window.api.lodestone.sync()
      for (const t of SYNCABLE_COLLECTIONS) await window.api.collections.sync(t)
      setResult(r)
      await onSynced()
      await loadLog()
      await useStore.getState().init()
      await useStore.getState().refreshCollectionPending()
    } finally {
      setSyncing(false)
    }
  }

  const hasChar = !!settings.lodestoneCharacterId

  return (
    <section className={`mb-6 ${sectionClass}`}>
      <h3 className="font-semibold">Synchronisation Lodestone</h3>
      <p className="text-xs text-slate-500">
        Rends tes hauts faits et tes collections (montures, mascottes, émotes…) <b>publics</b> sur le
        Lodestone (Profil du personnage → Paramètres de confidentialité), puis synchronise. Seuls les
        éléments <b>obtenus</b> sont récupérés (le Lodestone n'expose pas la progression partielle).
      </p>
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm text-slate-400">
          Région
          <select
            value={settings.region}
            onChange={(e) => onUpdate({ region: e.target.value as Region })}
            className={ctrl}
          >
            <option value="eu">Europe</option>
            <option value="na">Amérique du Nord</option>
            <option value="fr">France</option>
            <option value="de">Allemagne</option>
            <option value="ja">Japon</option>
          </select>
        </label>
        <label className="block text-sm text-slate-400">
          ID ou URL Lodestone
          <input
            value={settings.lodestoneCharacterId ?? ''}
            onChange={(e) => onUpdate({ lodestoneCharacterId: e.target.value || null })}
            placeholder="ex. 6125331"
            className={ctrl}
          />
        </label>
      </div>
      <div className="flex items-center gap-3">
        <button
          onClick={sync}
          disabled={syncing || !hasChar}
          className="rounded bg-emerald-600 px-3 py-1.5 text-sm font-medium hover:bg-emerald-500 disabled:opacity-50"
        >
          {syncing ? 'Synchronisation… (~1 min)' : 'Synchroniser'}
        </button>
        <span className="text-xs text-slate-500">Dernière synchro : {fmt(settings.lastSyncAt)}</span>
      </div>
      <label className="flex items-center gap-2 text-sm text-slate-300">
        <input
          type="checkbox"
          checked={settings.autoSync}
          onChange={(e) => onUpdate({ autoSync: e.target.checked })}
          className="h-4 w-4 accent-emerald-500"
        />
        Synchroniser automatiquement au démarrage (hauts faits + collections du Lodestone)
      </label>
      {result && (
        <p className={`text-sm ${result.ok ? 'text-emerald-400' : 'text-red-400'}`}>
          {result.message}
        </p>
      )}
      {log.length > 0 && (
        <details className="text-xs text-slate-500">
          <summary className="cursor-pointer hover:text-slate-300">
            Journal de synchro ({log.length})
          </summary>
          <ul className="mt-2 space-y-1">
            {log.map((l, i) => (
              <li key={i} className={l.ok ? 'text-slate-400' : 'text-red-400/80'}>
                {fmt(l.at)} — {l.message}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  )
}
