import type { CSSProperties } from 'react'
import type { CollectionItemRow } from '@shared/types'
import { iconUrl } from '../../lib/icons'
import { isLocked } from './shared'

function SourceBadge({ row }: { row: CollectionItemRow }) {
  if (!row.owned) return null
  const verified = row.source === 'lodestone'
  return (
    <span
      className={`shrink-0 rounded px-1.5 text-[10px] uppercase ${
        verified ? 'bg-emerald-700 text-emerald-50' : 'bg-amber-700/60 text-amber-100'
      }`}
      title={
        verified
          ? 'Possession vérifiée sur le Lodestone (verrouillé)'
          : 'Coché manuellement — non vérifié sur le Lodestone'
      }
    >
      {verified ? '✓ vérifié' : 'manuel'}
    </span>
  )
}

export default function CollectionRow({
  row,
  onToggle,
  onOpen,
  active,
  style
}: {
  row: CollectionItemRow
  onToggle: (r: CollectionItemRow) => void
  onOpen: (r: CollectionItemRow) => void
  active: boolean
  style: CSSProperties
}) {
  const url = iconUrl(row.iconPath)
  const acq = row.description || row.sources.join(' · ')
  const locked = isLocked(row)
  return (
    <div
      style={style}
      className={`flex items-center gap-3 border-b border-slate-800/50 px-2 ${
        active ? 'bg-slate-700/60' : 'hover:bg-slate-800/40'
      }`}
    >
      <input
        type="checkbox"
        checked={row.owned}
        disabled={locked}
        onChange={() => onToggle(row)}
        title={locked ? 'Vérifié sur le Lodestone — décochage impossible' : undefined}
        className={`h-4 w-4 shrink-0 accent-emerald-500 ${locked ? 'cursor-not-allowed opacity-70' : ''}`}
      />
      {url && (
        <img
          src={url}
          loading="lazy"
          className="h-7 w-7 shrink-0 rounded"
          onError={(e) => (e.currentTarget.style.visibility = 'hidden')}
        />
      )}
      <button onClick={() => onOpen(row)} className="min-w-0 flex-1 text-left">
        <div className={`truncate text-sm hover:text-white ${row.owned ? 'text-white' : 'text-slate-300'}`}>
          {row.name}
        </div>
        {acq && <div className="truncate text-xs text-slate-500">{acq}</div>}
      </button>
      {row.categoryName && (
        <span className="shrink-0 text-xs text-slate-600">{row.categoryName}</span>
      )}
      {row.patch && (
        <span
          className="shrink-0 rounded bg-slate-700/70 px-1.5 font-mono text-[11px] text-slate-300"
          title={`Ajouté au patch ${row.patch}`}
        >
          {row.patch}
        </span>
      )}
      <SourceBadge row={row} />
    </div>
  )
}
