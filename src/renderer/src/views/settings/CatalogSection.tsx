import { useStore } from '../../store/useStore'
import { sectionClass } from './shared'

interface Props {
  /** True while the catalog or the collections are being refreshed. */
  busy: boolean
  onRefresh: () => void
}

export default function CatalogSection({ busy, onRefresh }: Props) {
  const catalogStatus = useStore((s) => s.catalogStatus)

  return (
    <section className={sectionClass}>
      <h3 className="font-semibold">Catalogue</h3>
      <p className="text-sm text-slate-400">
        {catalogStatus?.achievementCount ?? 0} hauts faits · version{' '}
        <span className="font-mono">{catalogStatus?.gameVersion?.slice(0, 10) ?? '—'}</span>
      </p>
      <button
        onClick={onRefresh}
        disabled={busy}
        className="rounded bg-slate-700 px-3 py-1.5 text-sm hover:bg-slate-600 disabled:opacity-50"
      >
        {busy ? 'Mise à jour… (~30 s)' : 'Mettre à jour depuis XIVAPI'}
      </button>
      <p className="text-xs text-slate-500">
        Met aussi à jour le catalogue des collections (montures, mascottes, émotes…) ci-dessous.
      </p>
    </section>
  )
}
