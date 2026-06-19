import { useEffect, useState } from 'react'
import type { AchievementRow, Priority } from '@shared/types'
import { useStore } from '../store/useStore'
import { iconUrl } from '../lib/icons'
import { achievementExternalUrl } from '../lib/external'
import { PRIORITY_DOT, PRIORITY_LABELS } from '../lib/priority'

export default function DetailDrawer() {
  const selectedId = useStore((s) => s.selectedId)
  const rows = useStore((s) => s.rows)
  const select = useStore((s) => s.select)
  const toggleCompletion = useStore((s) => s.toggleCompletion)
  const setPriority = useStore((s) => s.setPriority)
  const setFocus = useStore((s) => s.setFocus)
  const setNote = useStore((s) => s.setNote)
  const setTags = useStore((s) => s.setTags)
  const setDeadline = useStore((s) => s.setDeadline)
  const recurring = useStore((s) => s.recurring)
  const addRecurring = useStore((s) => s.addRecurring)

  const [row, setRow] = useState<AchievementRow | null>(null)
  const [noteDraft, setNoteDraft] = useState('')
  const [tagDraft, setTagDraft] = useState('')

  useEffect(() => {
    if (selectedId == null) {
      setRow(null)
      return
    }
    window.api.achievements.get(selectedId).then((r) => {
      setRow(r)
      setNoteDraft(r?.note ?? '')
    })
  }, [selectedId, rows])

  if (selectedId == null) return null

  const url = row ? iconUrl(row.iconPath) : null

  const addTag = () => {
    if (!row) return
    const t = tagDraft.trim()
    if (t && !row.tags.includes(t)) setTags(row.id, [...row.tags, t])
    setTagDraft('')
  }
  const removeTag = (t: string) => {
    if (row) setTags(row.id, row.tags.filter((x) => x !== t))
  }

  return (
    <>
      <div className="fixed inset-0 z-20 bg-black/40" onClick={() => select(null)} />
      <aside className="fixed right-0 top-0 z-30 flex h-full w-[420px] flex-col border-l border-slate-700 bg-slate-900 shadow-2xl">
        {!row ? (
          <div className="p-6 text-slate-400">Chargement…</div>
        ) : (
          <>
            <div className="flex items-start gap-3 border-b border-slate-800 p-4">
              {url && (
                <img
                  src={url}
                  className="h-12 w-12 rounded"
                  onError={(e) => {
                    e.currentTarget.style.visibility = 'hidden'
                  }}
                />
              )}
              <div className="min-w-0 flex-1">
                <h3 className="font-bold leading-tight">{row.name}</h3>
                <p className="text-xs text-slate-500">
                  {row.kindName} · {row.categoryName}
                </p>
                <p className="mt-1 text-sm">
                  <span className="font-mono text-amber-400">{row.points}</span> points
                </p>
              </div>
              <button onClick={() => select(null)} className="text-slate-500 hover:text-white">
                ✕
              </button>
            </div>

            <div className="flex-1 space-y-5 overflow-auto p-4 text-sm">
              <p className="text-slate-300">{row.description}</p>

              <a
                href={achievementExternalUrl(row.id)}
                target="_blank"
                rel="noreferrer"
                className="inline-block text-xs text-sky-400 hover:text-sky-300"
              >
                Voir en ligne ↗
              </a>

              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={row.completed}
                  disabled={row.completed && row.source === 'lodestone'}
                  onChange={() => toggleCompletion(row)}
                  title={
                    row.completed && row.source === 'lodestone'
                      ? 'Obtenu via le Lodestone — décochage impossible'
                      : undefined
                  }
                  className={`h-4 w-4 accent-emerald-500 ${
                    row.completed && row.source === 'lodestone' ? 'cursor-not-allowed opacity-70' : ''
                  }`}
                />
                <span>
                  {row.completed
                    ? `Obtenu${row.completedDate ? ` le ${row.completedDate}` : ''}`
                    : 'Non obtenu'}
                </span>
                {row.source && (
                  <span className="text-xs text-slate-500">
                    ({row.source === 'lodestone' ? 'Lodestone — verrouillé' : 'manuel'})
                  </span>
                )}
              </label>

              <div>
                <div className="mb-1 text-xs uppercase text-slate-500">Priorité</div>
                <div className="flex flex-wrap gap-1">
                  {([0, 1, 2, 3] as Priority[]).map((p) => (
                    <button
                      key={p}
                      onClick={() => setPriority(row.id, p)}
                      className={`flex items-center gap-1 rounded px-2 py-1 text-xs ${
                        row.priority === p
                          ? 'bg-slate-700 text-white'
                          : 'bg-slate-800 text-slate-400 hover:bg-slate-700/60'
                      }`}
                    >
                      <span className={`h-2 w-2 rounded-full ${PRIORITY_DOT[p]}`} />
                      {PRIORITY_LABELS[p]}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-xs uppercase text-slate-500">Focus</span>
                <button
                  onClick={() => setFocus(row.id, !row.inFocus)}
                  className={`rounded px-3 py-1 text-xs ${
                    row.inFocus
                      ? 'bg-amber-600/80 text-white'
                      : 'bg-slate-800 text-slate-400 hover:bg-slate-700/60'
                  }`}
                >
                  {row.inFocus ? '★ Dans le focus' : '☆ Ajouter au focus'}
                </button>
              </div>

              <div>
                <div className="mb-1 text-xs uppercase text-slate-500">Checklist récurrente</div>
                {recurring.some((t) => t.achievementId === row.id) ? (
                  <p className="text-xs text-slate-500">Déjà dans la checklist (voir Quotidiens).</p>
                ) : (
                  <div className="flex gap-2">
                    <button
                      onClick={() =>
                        addRecurring({
                          name: row.name,
                          type: 'daily',
                          achievementId: row.id,
                          iconPath: row.iconPath
                        })
                      }
                      className="rounded bg-slate-800 px-2 py-1 text-xs text-slate-300 hover:bg-slate-700/60"
                    >
                      + Quotidien
                    </button>
                    <button
                      onClick={() =>
                        addRecurring({
                          name: row.name,
                          type: 'daily22',
                          achievementId: row.id,
                          iconPath: row.iconPath
                        })
                      }
                      title="Ravitaillement — reset à 22 h"
                      className="rounded bg-slate-800 px-2 py-1 text-xs text-slate-300 hover:bg-slate-700/60"
                    >
                      + Ravito
                    </button>
                    <button
                      onClick={() =>
                        addRecurring({
                          name: row.name,
                          type: 'weekly',
                          achievementId: row.id,
                          iconPath: row.iconPath
                        })
                      }
                      className="rounded bg-slate-800 px-2 py-1 text-xs text-slate-300 hover:bg-slate-700/60"
                    >
                      + Hebdo
                    </button>
                  </div>
                )}
              </div>

              <label className="block">
                <div className="mb-1 text-xs uppercase text-slate-500">Échéance</div>
                <input
                  type="date"
                  value={row.deadline ?? ''}
                  onChange={(e) => setDeadline(row.id, e.target.value || null)}
                  className="rounded bg-slate-800 px-2 py-1 text-sm text-slate-200 outline-none"
                />
              </label>

              <div>
                <div className="mb-1 text-xs uppercase text-slate-500">Note</div>
                <textarea
                  value={noteDraft}
                  onChange={(e) => setNoteDraft(e.target.value)}
                  onBlur={() => setNote(row.id, noteDraft)}
                  rows={3}
                  placeholder="Note personnelle…"
                  className="w-full rounded bg-slate-800 px-2 py-1.5 text-sm outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <div>
                <div className="mb-1 text-xs uppercase text-slate-500">Tags</div>
                <div className="mb-2 flex flex-wrap gap-1">
                  {row.tags.map((t) => (
                    <span
                      key={t}
                      className="flex items-center gap-1 rounded bg-slate-800 px-2 py-0.5 text-xs"
                    >
                      {t}
                      <button
                        onClick={() => removeTag(t)}
                        className="text-slate-500 hover:text-red-400"
                      >
                        ✕
                      </button>
                    </span>
                  ))}
                  {row.tags.length === 0 && <span className="text-xs text-slate-600">Aucun tag</span>}
                </div>
                <input
                  value={tagDraft}
                  onChange={(e) => setTagDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') addTag()
                  }}
                  placeholder="Ajouter un tag puis Entrée"
                  className="w-full rounded bg-slate-800 px-2 py-1.5 text-sm outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>
            </div>
          </>
        )}
      </aside>
    </>
  )
}
