import { useEffect, useState } from 'react'
import type { AchievementRow } from '@shared/types'
import { useStore } from '../store/useStore'
import { iconUrl } from '../lib/icons'

export default function NewPatchView() {
  const select = useStore((s) => s.select)
  const refreshStatus = useStore((s) => s.refreshStatus)
  const refreshNewPatch = useStore((s) => s.refreshNewPatch)
  const loadRows = useStore((s) => s.loadRows)

  const [patches, setPatches] = useState<string[]>([])
  const [patch, setPatch] = useState<string | null>(null)
  const [rows, setRows] = useState<AchievementRow[]>([])
  const [loading, setLoading] = useState(false)

  // Liste des patchs disponibles ; on sélectionne le plus récent par défaut.
  useEffect(() => {
    window.api.meta.patches().then((ps) => {
      setPatches(ps)
      setPatch((cur) => cur ?? ps[0] ?? null)
    })
  }, [])

  useEffect(() => {
    if (!patch) return
    setLoading(true)
    window.api.achievements
      .list({ patch, sortBy: 'category', sortDir: 'asc' })
      .then((r) => {
        setRows(r)
        setLoading(false)
      })
  }, [patch])

  const toggle = async (row: AchievementRow) => {
    if (row.completed && row.source === 'lodestone') return // verrouillé (Lodestone)
    const next = !row.completed
    await window.api.achievements.setCompletion(row.id, next)
    setRows((rs) => rs.map((x) => (x.id === row.id ? { ...x, completed: next } : x)))
    refreshStatus()
    refreshNewPatch()
    loadRows()
  }

  const completed = rows.filter((r) => r.completed).length
  const total = rows.length
  const points = rows.reduce((s, r) => s + r.points, 0)
  const earned = rows.filter((r) => r.completed).reduce((s, r) => s + r.points, 0)
  const pct = total ? Math.round((completed / total) * 100) : 0

  if (patches.length === 0) {
    return (
      <div className="flex-1 overflow-auto p-6">
        <h2 className="mb-2 text-lg font-bold">Nouveautés</h2>
        <p className="text-sm text-slate-500">
          Aucune donnée de patch dans le catalogue. Va dans <b>Paramètres → Catalogue</b> et clique sur
          « Mettre à jour depuis XIVAPI » pour récupérer les patchs.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="border-b border-slate-800 p-6 pb-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold">Nouveautés</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Hauts faits ajoutés à un patch donné — le plus récent par défaut.
            </p>
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-400">
            Patch
            <select
              value={patch ?? ''}
              onChange={(e) => setPatch(e.target.value)}
              className="rounded bg-slate-800 px-2 py-1.5 font-mono text-sm text-slate-200"
            >
              {patches.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="max-w-md">
          <div className="mb-1 flex justify-between text-xs text-slate-400">
            <span>
              {completed} / {total} obtenu(s) · {earned}/{points} pts
            </span>
            <span>{pct}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-800">
            <div className="h-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        {loading ? (
          <p className="text-sm text-slate-500">Chargement…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-slate-500">Aucun haut fait pour ce patch.</p>
        ) : (
          <ul className="max-w-3xl space-y-1">
            {rows.map((row) => {
              const url = iconUrl(row.iconPath)
              return (
                <li
                  key={row.id}
                  className="flex items-center gap-3 rounded bg-slate-800/50 px-3 py-2"
                >
                  <input
                    type="checkbox"
                    checked={row.completed}
                    disabled={row.completed && row.source === 'lodestone'}
                    onChange={() => toggle(row)}
                    title={
                      row.completed && row.source === 'lodestone'
                        ? 'Obtenu via le Lodestone — décochage impossible'
                        : undefined
                    }
                    className={`h-4 w-4 shrink-0 accent-emerald-500 ${
                      row.completed && row.source === 'lodestone' ? 'cursor-not-allowed opacity-70' : ''
                    }`}
                  />
                  {url && (
                    <img
                      src={url}
                      className="h-6 w-6 shrink-0 rounded"
                      onError={(e) => (e.currentTarget.style.visibility = 'hidden')}
                    />
                  )}
                  <button
                    onClick={() => select(row.id)}
                    className={`min-w-0 flex-1 truncate text-left text-sm hover:text-white ${
                      row.completed ? 'text-slate-500 line-through' : 'text-slate-200'
                    }`}
                    title="Voir le détail"
                  >
                    {row.name}
                  </button>
                  <span className="shrink-0 text-xs text-slate-600">{row.categoryName}</span>
                  <span className="shrink-0 text-xs font-medium text-amber-400">{row.points} pts</span>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
