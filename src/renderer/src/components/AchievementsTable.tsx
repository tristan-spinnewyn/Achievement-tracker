import { useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { SortField } from '@shared/types'
import { useStore } from '../store/useStore'
import { iconUrl } from '../lib/icons'
import { PRIORITY_DOT, PRIORITY_SHORT, PRIORITY_TEXT, nextPriority } from '../lib/priority'
import { DifficultyBadge } from './DifficultyBadge'

// check | nom (flex) | points | difficulté | patch | catégorie | priorité | focus | date
const GRID = '40px minmax(0,1fr) 60px 150px 64px 120px 76px 40px 96px'
const ROW_HEIGHT = 52

const columns: { key: string; label: string; sort?: SortField }[] = [
  { key: 'check', label: '' },
  { key: 'name', label: 'Haut fait', sort: 'name' },
  { key: 'points', label: 'Points', sort: 'points' },
  { key: 'difficulty', label: 'Difficulté' },
  { key: 'patch', label: 'Patch', sort: 'patch' },
  { key: 'category', label: 'Catégorie', sort: 'category' },
  { key: 'priority', label: 'Priorité', sort: 'priority' },
  { key: 'focus', label: '★' },
  { key: 'date', label: 'Obtenu le', sort: 'completedDate' }
]

export default function AchievementsTable() {
  const rows = useStore((s) => s.rows)
  const filter = useStore((s) => s.filter)
  const difficulties = useStore((s) => s.difficulties)
  const setFilter = useStore((s) => s.setFilter)
  const toggleCompletion = useStore((s) => s.toggleCompletion)
  const setPriority = useStore((s) => s.setPriority)
  const setFocus = useStore((s) => s.setFocus)
  const select = useStore((s) => s.select)
  const parentRef = useRef<HTMLDivElement>(null)

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12
  })

  const toggleSort = (sort?: SortField) => {
    if (!sort) return
    if (filter.sortBy === sort) setFilter({ sortDir: filter.sortDir === 'asc' ? 'desc' : 'asc' })
    else setFilter({ sortBy: sort, sortDir: sort === 'patch' ? 'desc' : 'asc' })
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div
        className="grid border-b border-slate-700 bg-slate-950 px-3 text-xs font-semibold uppercase tracking-wide text-slate-400"
        style={{ gridTemplateColumns: GRID }}
      >
        {columns.map((c) => (
          <button
            key={c.key}
            onClick={() => toggleSort(c.sort)}
            disabled={!c.sort}
            className={`flex items-center gap-1 py-2 text-left ${
              c.sort ? 'hover:text-slate-200' : 'cursor-default'
            }`}
          >
            {c.label}
            {filter.sortBy === c.sort && c.sort ? (filter.sortDir === 'asc' ? '↑' : '↓') : ''}
          </button>
        ))}
      </div>

      <div ref={parentRef} className="flex-1 overflow-auto">
        <div style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }}>
          {virtualizer.getVirtualItems().map((vi) => {
            const r = rows[vi.index]
            const url = iconUrl(r.iconPath)
            return (
              <div
                key={r.id}
                className="absolute grid w-full items-center border-b border-slate-800/60 px-3 hover:bg-slate-800/40"
                style={{
                  gridTemplateColumns: GRID,
                  transform: `translateY(${vi.start}px)`,
                  height: ROW_HEIGHT
                }}
              >
                <input
                  type="checkbox"
                  checked={r.completed}
                  disabled={r.completed && r.source === 'lodestone'}
                  onChange={() => toggleCompletion(r)}
                  title={
                    r.completed && r.source === 'lodestone'
                      ? 'Obtenu via le Lodestone — décochage impossible'
                      : undefined
                  }
                  className={`h-4 w-4 accent-emerald-500 ${
                    r.completed && r.source === 'lodestone' ? 'cursor-not-allowed opacity-70' : ''
                  }`}
                />

                <button
                  onClick={() => select(r.id)}
                  className="flex min-w-0 items-center gap-2 pr-2 text-left"
                >
                  {url && (
                    <img
                      src={url}
                      loading="lazy"
                      className="h-7 w-7 shrink-0 rounded"
                      onError={(e) => {
                        e.currentTarget.style.visibility = 'hidden'
                      }}
                    />
                  )}
                  <div className="min-w-0">
                    <div className="truncate font-medium text-slate-100">{r.name}</div>
                    <div className="truncate text-xs text-slate-500">{r.description}</div>
                  </div>
                </button>

                <div className="font-mono text-amber-400">{r.points}</div>
                {/* Difficulté */}
                <DifficultyBadge achievementId={r.id} />
                <div className="font-mono text-xs text-slate-400">{r.patch ?? '—'}</div>
                <div className="truncate text-slate-300">{r.categoryName}</div>

                <button
                  onClick={() => setPriority(r.id, nextPriority(r.priority))}
                  title="Cliquer pour changer la priorité"
                  className="flex items-center gap-1.5"
                >
                  <span className={`h-2.5 w-2.5 rounded-full ${PRIORITY_DOT[r.priority]}`} />
                  <span className={`text-xs ${PRIORITY_TEXT[r.priority]}`}>
                    {PRIORITY_SHORT[r.priority]}
                  </span>
                </button>

                <button
                  onClick={() => setFocus(r.id, !r.inFocus)}
                  title={r.inFocus ? 'Retirer du focus' : 'Ajouter au focus'}
                  className={r.inFocus ? 'text-amber-400' : 'text-slate-600 hover:text-slate-400'}
                >
                  {r.inFocus ? '★' : '☆'}
                </button>

                <div className="text-xs text-slate-400">{r.completedDate ?? ''}</div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
