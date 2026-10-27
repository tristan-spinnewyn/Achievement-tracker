import type { CollectionItemRow } from '@shared/types'
import { iconUrl } from '../../lib/icons'
import { collectionExternalUrl } from '../../lib/external'
import { isLocked } from './shared'

export default function DetailPanel({
  row,
  onClose,
  onToggle
}: {
  row: CollectionItemRow
  onClose: () => void
  onToggle: (r: CollectionItemRow) => void
}) {
  const url = iconUrl(row.iconPath)
  const locked = isLocked(row)
  return (
    <aside className="flex w-80 shrink-0 flex-col border-l border-slate-800 bg-slate-950">
      <div className="flex items-start justify-between gap-2 border-b border-slate-800 p-4">
        <div className="flex items-center gap-3">
          {url && (
            <img
              src={url}
              className="h-12 w-12 rounded"
              onError={(e) => (e.currentTarget.style.visibility = 'hidden')}
            />
          )}
          <div>
            <h3 className="font-semibold leading-tight">{row.name}</h3>
            {row.patch && <span className="font-mono text-xs text-slate-400">Patch {row.patch}</span>}
          </div>
        </div>
        <button onClick={onClose} className="text-slate-500 hover:text-white" title="Fermer">
          ✕
        </button>
      </div>

      <div className="flex-1 space-y-4 overflow-auto p-4 text-sm">
        {row.categoryName && (
          <div>
            <div className="text-xs uppercase tracking-wide text-slate-500">Catégorie</div>
            <div className="text-slate-200">{row.categoryName}</div>
          </div>
        )}

        <div>
          <div className="text-xs uppercase tracking-wide text-slate-500">Moyen(s) d’obtention</div>
          {row.sources.length > 0 ? (
            <ul className="mt-1 list-disc space-y-1 pl-4 text-slate-200">
              {row.sources.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          ) : row.description ? (
            <div className="text-slate-200">{row.description}</div>
          ) : (
            <div className="text-slate-500">Non documenté.</div>
          )}
        </div>

        <div>
          <div className="text-xs uppercase tracking-wide text-slate-500">Statut</div>
          <div className="mt-1 flex items-center gap-2">
            <span className={row.owned ? 'text-emerald-400' : 'text-slate-400'}>
              {row.owned ? (row.source === 'lodestone' ? '✓ Vérifié (Lodestone)' : '✓ Obtenu (manuel)') : 'Non obtenu'}
            </span>
          </div>
          <button
            onClick={() => onToggle(row)}
            disabled={locked}
            title={locked ? 'Vérifié sur le Lodestone — décochage impossible' : undefined}
            className={`mt-3 w-full rounded px-3 py-1.5 text-sm font-medium ${
              locked
                ? 'cursor-not-allowed bg-slate-800 text-slate-500'
                : row.owned
                  ? 'bg-slate-700 hover:bg-slate-600'
                  : 'bg-emerald-600 hover:bg-emerald-500'
            }`}
          >
            {locked
              ? 'Verrouillé (vérifié Lodestone)'
              : row.owned
                ? 'Marquer comme non obtenu'
                : 'Marquer comme obtenu'}
          </button>
        </div>

        <a
          href={collectionExternalUrl(row.type, row.id, row.name)}
          target="_blank"
          rel="noreferrer"
          className="inline-block text-xs text-sky-400 hover:text-sky-300"
        >
          Voir en ligne ↗
        </a>
      </div>
    </aside>
  )
}
