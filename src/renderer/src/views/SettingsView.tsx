import { useEffect, useState } from 'react'
import type { DifficultyLevel, Region, Settings, SyncLogEntry, SyncResult } from '@shared/types'
import { useStore } from '../store/useStore'

const ctrl =
  'mt-1 w-full rounded bg-slate-800 px-2 py-1.5 text-sm text-slate-200 outline-none focus:ring-1 focus:ring-emerald-500'

/** Métadonnées d'affichage des niveaux de difficulté (alignées sur difficulty.ts). */
const DIFFICULTY_LEVELS: { key: DifficultyLevel; label: string; color: string }[] = [
  { key: 'very_easy', label: 'Très facile', color: '#22c55e' },
  { key: 'easy', label: 'Facile', color: '#84cc16' },
  { key: 'medium', label: 'Moyenne', color: '#eab308' },
  { key: 'hard', label: 'Difficile', color: '#f97316' },
  { key: 'very_hard', label: 'Très difficile', color: '#ef4444' },
  { key: 'extreme', label: 'Extrême', color: '#64748b' }
]

/** Libellés des types de hauts faits (kindId) pour la vue des poids. */
const KIND_LABELS: Record<number, string> = {
  0: 'Non classé',
  1: 'Combats',
  2: 'JcJ',
  3: 'Personnage',
  4: 'Objets',
  5: 'Synthèse & récolte',
  8: 'Quêtes',
  11: 'Exploration',
  12: 'Grandes compagnies',
  13: 'Legacy'
}

type DifficultyStats = {
  total: number
  byLevel: Record<DifficultyLevel, number>
  averageScore: number
  hardest: { id: number; name: string; score: number } | null
  easiest: { id: number; name: string; score: number } | null
}

function fmt(iso: string | null): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('fr-FR')
  } catch {
    return iso
  }
}

interface CollStatus {
  counts: { mount: number; minion: number; orchestrion: number }
  generatedAt: string | null
}

export default function SettingsView() {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [log, setLog] = useState<SyncLogEntry[]>([])
  const [syncing, setSyncing] = useState(false)
  const [result, setResult] = useState<SyncResult | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [collStatus, setCollStatus] = useState<CollStatus | null>(null)
  const [collRefreshing, setCollRefreshing] = useState(false)
  const [backupMsg, setBackupMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [diffStats, setDiffStats] = useState<DifficultyStats | null>(null)
  const [diffWeights, setDiffWeights] = useState<Record<number, number> | null>(null)
  const [recalculating, setRecalculating] = useState(false)
  const catalogStatus = useStore((s) => s.catalogStatus)

  const loadLog = async () => setLog(await window.api.lodestone.syncLog())
  const loadCollStatus = async () => {
    const s = await window.api.collections.status()
    setCollStatus({ counts: s.counts, generatedAt: s.generatedAt })
  }
  const loadDifficulty = async () => {
    setDiffStats(await window.api.difficulty.stats())
    setDiffWeights((await window.api.difficulty.weights()).kind)
  }

  useEffect(() => {
    window.api.settings.get().then(setSettings)
    loadLog()
    loadCollStatus()
    loadDifficulty()
  }, [])

  const recalcDifficulty = async () => {
    setRecalculating(true)
    try {
      await window.api.difficulty.recalculate()
      await loadDifficulty()
      await useStore.getState().init()
    } finally {
      setRecalculating(false)
    }
  }

  const update = async (patch: Partial<Settings>) =>
    setSettings(await window.api.settings.update(patch))

  const sync = async () => {
    setSyncing(true)
    setResult(null)
    try {
      const r = await window.api.lodestone.sync()
      setResult(r)
      setSettings(await window.api.settings.get())
      await loadLog()
      await useStore.getState().init()
    } finally {
      setSyncing(false)
    }
  }

  const refreshCatalog = async () => {
    setRefreshing(true)
    try {
      await window.api.catalog.refresh()
      await useStore.getState().init()
    } finally {
      setRefreshing(false)
    }
  }

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
      setSettings(await window.api.settings.get())
      await loadCollStatus()
      await useStore.getState().init()
      await useStore.getState().refreshCollectionPending()
      await loadLog()
    } else {
      setBackupMsg({ ok: false, text: r.error ?? 'Échec de l’import.' })
    }
  }

  const refreshCollections = async () => {
    setCollRefreshing(true)
    try {
      await window.api.collections.refresh()
      await loadCollStatus()
      await useStore.getState().refreshCollectionPending()
    } finally {
      setCollRefreshing(false)
    }
  }

  if (!settings) return <div className="p-6 text-slate-400">Chargement…</div>

  const hasChar = !!settings.lodestoneCharacterId

  return (
    <div className="flex-1 overflow-auto p-6">
      <h2 className="mb-4 text-lg font-bold">Paramètres</h2>

      <section className="mb-6 max-w-xl space-y-3 rounded border border-slate-800 bg-slate-950 p-4">
        <h3 className="font-semibold">Synchronisation Lodestone</h3>
        <p className="text-xs text-slate-500">
          Rends tes hauts faits <b>publics</b> sur le Lodestone (Profil du personnage → Paramètres de
          confidentialité), puis synchronise. Seuls les hauts faits <b>obtenus</b> sont récupérés (le
          Lodestone n'expose pas la progression partielle).
        </p>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm text-slate-400">
            Région
            <select
              value={settings.region}
              onChange={(e) => update({ region: e.target.value as Region })}
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
              onChange={(e) => update({ lodestoneCharacterId: e.target.value || null })}
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
            {syncing ? 'Synchronisation… (~30 s)' : 'Synchroniser'}
          </button>
          <span className="text-xs text-slate-500">Dernière synchro : {fmt(settings.lastSyncAt)}</span>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-300">
          <input
            type="checkbox"
            checked={settings.autoSync}
            onChange={(e) => update({ autoSync: e.target.checked })}
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

      <section className="max-w-xl space-y-3 rounded border border-slate-800 bg-slate-950 p-4">
        <h3 className="font-semibold">Catalogue</h3>
        <p className="text-sm text-slate-400">
          {catalogStatus?.achievementCount ?? 0} hauts faits · version{' '}
          <span className="font-mono">{catalogStatus?.gameVersion?.slice(0, 10) ?? '—'}</span>
        </p>
        <button
          onClick={refreshCatalog}
          disabled={refreshing}
          className="rounded bg-slate-700 px-3 py-1.5 text-sm hover:bg-slate-600 disabled:opacity-50"
        >
          {refreshing ? 'Mise à jour…' : 'Mettre à jour depuis XIVAPI'}
        </button>
      </section>

      <section className="mt-6 max-w-xl space-y-3 rounded border border-slate-800 bg-slate-950 p-4">
        <h3 className="font-semibold">Difficulté</h3>
        <p className="text-xs text-slate-500">
          Score additif borné : <b>points</b> + <b>palier</b> (Ultime/Sadique/Extrême) +{' '}
          <b>grind</b> + <b>défi</b> (no-hit/solo) + contexte (type) + récence + saisonnier. Les scores
          sont calculés au démarrage ; recalcule-les après une mise à jour du catalogue.
        </p>

        {diffStats && (
          <>
            <p className="text-sm text-slate-400">
              {diffStats.total} hauts faits notés · score moyen{' '}
              <span className="font-mono text-slate-200">{diffStats.averageScore}</span>
            </p>
            <div className="space-y-1">
              {DIFFICULTY_LEVELS.map((lvl) => {
                const n = diffStats.byLevel[lvl.key] ?? 0
                const pct = diffStats.total > 0 ? (n / diffStats.total) * 100 : 0
                return (
                  <div key={lvl.key} className="flex items-center gap-2 text-xs">
                    <span className="w-24 shrink-0 text-slate-400">{lvl.label}</span>
                    <div className="h-2 flex-1 overflow-hidden rounded bg-slate-800">
                      <div
                        className="h-full rounded"
                        style={{ width: `${pct}%`, backgroundColor: lvl.color }}
                      />
                    </div>
                    <span className="w-10 shrink-0 text-right font-mono text-slate-500">{n}</span>
                  </div>
                )
              })}
            </div>
            {diffStats.hardest && (
              <p className="text-xs text-slate-500">
                Le plus dur : <span className="text-slate-300">{diffStats.hardest.name}</span> (
                {diffStats.hardest.score})
              </p>
            )}
          </>
        )}

        <button
          onClick={recalcDifficulty}
          disabled={recalculating}
          className="rounded bg-slate-700 px-3 py-1.5 text-sm hover:bg-slate-600 disabled:opacity-50"
        >
          {recalculating ? 'Recalcul…' : 'Recalculer les scores'}
        </button>

        {diffWeights && (
          <details className="text-xs text-slate-500">
            <summary className="cursor-pointer hover:text-slate-300">
              Poids par type de haut fait (valeurs calibrées)
            </summary>
            <ul className="mt-2 grid grid-cols-2 gap-x-4 gap-y-0.5">
              {Object.entries(diffWeights)
                .filter(([id]) => (KIND_LABELS[Number(id)] ?? '') !== '' && Number(id) !== 0)
                .sort((a, b) => b[1] - a[1])
                .map(([id, w]) => (
                  <li key={id} className="flex justify-between">
                    <span>{KIND_LABELS[Number(id)] ?? `Type ${id}`}</span>
                    <span className="font-mono text-slate-400">{w}</span>
                  </li>
                ))}
            </ul>
          </details>
        )}
      </section>

      <section className="mt-6 max-w-xl space-y-3 rounded border border-slate-800 bg-slate-950 p-4">
        <h3 className="font-semibold">Collections</h3>
        <p className="text-sm text-slate-400">
          {collStatus
            ? `${collStatus.counts.mount} montures · ${collStatus.counts.minion} mascottes · ${collStatus.counts.orchestrion} orchestrions`
            : '—'}
        </p>
        <p className="text-xs text-slate-500">Dernière mise à jour : {fmt(collStatus?.generatedAt ?? null)}</p>
        <button
          onClick={refreshCollections}
          disabled={collRefreshing}
          className="rounded bg-slate-700 px-3 py-1.5 text-sm hover:bg-slate-600 disabled:opacity-50"
        >
          {collRefreshing ? 'Mise à jour… (~20 s)' : 'Mettre à jour les collections'}
        </button>
        <p className="text-xs text-slate-500">
          Récupère montures, mascottes, orchestrion et leurs patchs (XIVAPI + FFXIV Collect). Tes
          éléments cochés sont conservés.
        </p>
      </section>

      <section className="mt-6 max-w-xl space-y-3 rounded border border-slate-800 bg-slate-950 p-4">
        <h3 className="font-semibold">Sauvegarde des données</h3>
        <p className="text-xs text-slate-500">
          Exporte tout ton suivi (cases cochées, priorités, notes, tâches récurrentes) dans un fichier,
          ou restaure-le. L’import <b>remplace</b> les données actuelles.
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
          <p className={`text-xs ${backupMsg.ok ? 'text-emerald-400' : 'text-red-400'}`}>
            {backupMsg.text}
          </p>
        )}
      </section>
    </div>
  )
}
