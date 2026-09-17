import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import {
  SYNCABLE_COLLECTIONS,
  type CollectionCategory,
  type CollectionItemRow,
  type CollectionStatus,
  type CollectionType
} from '@shared/types'
import { iconUrl } from '../lib/icons'
import { collectionExternalUrl } from '../lib/external'
import { useStore } from '../store/useStore'

const ROW_H = 56

const LABELS: Record<CollectionType, { title: string; lead: string }> = {
  mount: { title: 'Montures', lead: 'Coche, ou synchronise depuis ton Lodestone.' },
  minion: { title: 'Mascottes', lead: 'Coche, ou synchronise depuis ton Lodestone.' },
  orchestrion: {
    title: 'Rouleaux d’orchestrion',
    lead: 'Suivi manuel : le Lodestone ne liste pas l’orchestrion.'
  },
  emote: { title: 'Emotes', lead: 'Coche, ou synchronise depuis ton Lodestone.' },
  faceaccessory: {
    title: 'Accessoires de visage',
    lead: 'Coche, ou synchronise depuis ton Lodestone.'
  },
  fashion: { title: 'Accessoires de mode', lead: 'Suivi manuel. Coche ce que tu possèdes.' },
  hairstyle: { title: 'Coiffures', lead: 'Suivi manuel. Coche ce que tu possèdes.' },
  barding: { title: 'Bardes', lead: 'Suivi manuel. Coche ce que tu possèdes.' },
  title: { title: 'Titres', lead: 'Suivi manuel. Coche ce que tu possèdes.' },
  spell: { title: 'Magie bleue', lead: 'Suivi manuel. Coche les sorts appris.' },
  beast: { title: 'Bestiaire de dresseur', lead: 'Suivi manuel. Coche les bêtes capturées.' },
  tripletriad: { title: 'Cartes de Triple Triade', lead: 'Suivi manuel. Coche les cartes obtenues.' }
}

const isLocked = (row: CollectionItemRow): boolean => row.owned && row.source === 'lodestone'

function ProgressBar({ owned, total }: { owned: number; total: number }) {
  const pct = total ? Math.round((owned / total) * 100) : 0
  return (
    <div className="max-w-md">
      <div className="mb-1 flex justify-between text-xs text-slate-400">
        <span>
          {owned} / {total} obtenu(s)
        </span>
        <span>{pct}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-800">
        <div className="h-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

export default function CollectionsView({ type }: { type: CollectionType }) {
  const meta = LABELS[type]
  const canSync = SYNCABLE_COLLECTIONS.includes(type)
  const [rows, setRows] = useState<CollectionItemRow[]>([])
  const [categories, setCategories] = useState<CollectionCategory[]>([])
  const [progress, setProgress] = useState({ owned: 0, total: 0 })
  const [query, setQuery] = useState('')
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<CollectionStatus>('all')
  const [categoryId, setCategoryId] = useState<number | null>(null)
  const [patches, setPatches] = useState<string[]>([])
  const [patch, setPatch] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [selected, setSelected] = useState<CollectionItemRow | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_H,
    overscan: 14
  })

  useEffect(() => {
    setQuery('')
    setSearch('')
    setStatus('all')
    setCategoryId(null)
    setPatch(null)
    setSyncMsg(null)
    setSelected(null)
    window.api.collections.categories(type).then(setCategories)
    window.api.collections.patches(type).then(setPatches)
  }, [type])

  useEffect(() => {
    const id = setTimeout(() => setSearch(query.trim()), 250)
    return () => clearTimeout(id)
  }, [query])

  const load = async () => {
    setLoading(true)
    const [r, p] = await Promise.all([
      window.api.collections.list({ type, search, status, categoryId, patch }),
      window.api.collections.progress(type)
    ])
    setRows(r)
    setProgress({ owned: p.owned, total: p.total })
    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, search, status, categoryId, patch])

  const toggle = async (row: CollectionItemRow) => {
    if (isLocked(row)) return // vérifié sur le Lodestone : décochage interdit
    const next = !row.owned
    await window.api.collections.setOwned(type, row.id, next)
    setProgress((p) => ({ ...p, owned: p.owned + (next ? 1 : -1) }))
    const patched = (x: CollectionItemRow): CollectionItemRow =>
      x.id === row.id ? { ...x, owned: next, source: next ? 'manual' : null } : x
    setRows((rs) => {
      const updated = rs.map(patched)
      if (status === 'owned') return updated.filter((x) => x.owned)
      if (status === 'missing') return updated.filter((x) => !x.owned)
      return updated
    })
    setSelected((s) => (s && s.id === row.id ? patched(s) : s))
    useStore.getState().refreshCollectionPending()
  }

  const doSync = async () => {
    setSyncing(true)
    setSyncMsg(null)
    try {
      const res = await window.api.collections.sync(type)
      setSyncMsg({ ok: res.ok, text: res.message })
      if (res.ok) {
        await load()
        useStore.getState().refreshCollectionPending()
      }
    } catch (e) {
      setSyncMsg({ ok: false, text: String(e) })
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div className="flex flex-1 overflow-hidden">
      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="border-b border-slate-800 p-6 pb-4">
          <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold">{meta.title}</h2>
              <p className="mt-0.5 text-xs text-slate-500">{meta.lead}</p>
            </div>
            {canSync && (
              <div className="text-right">
                <button
                  onClick={doSync}
                  disabled={syncing}
                  className="rounded bg-sky-600 px-3 py-1.5 text-sm font-medium hover:bg-sky-500 disabled:opacity-50"
                >
                  {syncing ? 'Synchronisation…' : '⟳ Synchroniser (Lodestone)'}
                </button>
                {syncMsg && (
                  <p className={`mt-1 max-w-xs text-xs ${syncMsg.ok ? 'text-emerald-400' : 'text-red-400'}`}>
                    {syncMsg.text}
                  </p>
                )}
              </div>
            )}
          </div>

          <ProgressBar owned={progress.owned} total={progress.total} />

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Rechercher…"
              className="w-56 rounded bg-slate-800 px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-emerald-500"
            />
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as CollectionStatus)}
              className="rounded bg-slate-800 px-2 py-1.5 text-sm text-slate-200"
            >
              <option value="all">Tout</option>
              <option value="owned">Obtenu</option>
              <option value="missing">Manquant</option>
            </select>
            {categories.length > 0 && (
              <select
                value={categoryId ?? ''}
                onChange={(e) => setCategoryId(e.target.value ? Number(e.target.value) : null)}
                className="rounded bg-slate-800 px-2 py-1.5 text-sm text-slate-200"
              >
                <option value="">Toutes catégories</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            )}
            {patches.length > 0 && (
              <select
                value={patch ?? ''}
                onChange={(e) => setPatch(e.target.value || null)}
                className="rounded bg-slate-800 px-2 py-1.5 font-mono text-sm text-slate-200"
              >
                <option value="">Tous patchs</option>
                {patches.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            )}
            <span className="text-xs text-slate-500">{rows.length} affiché(s)</span>
          </div>
        </div>

        <div ref={scrollRef} className="flex-1 overflow-auto px-6 py-4">
          {loading && rows.length === 0 ? (
            <p className="text-sm text-slate-500">Chargement…</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-slate-500">Aucun résultat.</p>
          ) : (
            <div
              style={{ height: virtualizer.getTotalSize(), maxWidth: '48rem', position: 'relative' }}
            >
              {virtualizer.getVirtualItems().map((vi) => {
                const row = rows[vi.index]
                return (
                  <CollectionRow
                    key={row.id}
                    row={row}
                    onToggle={toggle}
                    onOpen={setSelected}
                    active={selected?.id === row.id}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      height: ROW_H,
                      transform: `translateY(${vi.start}px)`
                    }}
                  />
                )
              })}
            </div>
          )}
        </div>
      </div>

      {selected && (
        <DetailPanel row={selected} onClose={() => setSelected(null)} onToggle={toggle} />
      )}
    </div>
  )
}

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

function CollectionRow({
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

function DetailPanel({
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
