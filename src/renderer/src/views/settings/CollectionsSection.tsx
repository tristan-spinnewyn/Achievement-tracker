import type { CollectionType } from '@shared/types'
import { fmt, sectionClass } from './shared'

export interface CollStatus {
  counts: Record<CollectionType, number>
  generatedAt: string | null
}

interface Props {
  status: CollStatus | null
  refreshing: boolean
  onRefresh: () => void
}

export default function CollectionsSection({ status, refreshing, onRefresh }: Props) {
  return (
    <section className={`mt-6 ${sectionClass}`}>
      <h3 className="font-semibold">Collections</h3>
      <p className="text-sm text-slate-400">
        {status
          ? `${status.counts.mount} montures · ${status.counts.minion} mascottes · ${status.counts.orchestrion} orchestrions`
          : '—'}
      </p>
      <p className="text-xs text-slate-500">Dernière mise à jour : {fmt(status?.generatedAt ?? null)}</p>
      <button
        onClick={onRefresh}
        disabled={refreshing}
        className="rounded bg-slate-700 px-3 py-1.5 text-sm hover:bg-slate-600 disabled:opacity-50"
      >
        {refreshing ? 'Mise à jour… (~20 s)' : 'Mettre à jour les collections'}
      </button>
      <p className="text-xs text-slate-500">
        Récupère montures, mascottes, orchestrion et leurs patchs (XIVAPI + FFXIV Collect). Tes
        éléments cochés sont conservés.
      </p>
    </section>
  )
}
