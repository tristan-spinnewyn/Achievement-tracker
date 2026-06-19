import FilterBar from '../components/FilterBar'
import AchievementsTable from '../components/AchievementsTable'
import { useStore } from '../store/useStore'

export default function AchievementsView() {
  const rows = useStore((s) => s.rows)
  const loading = useStore((s) => s.loading)

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <FilterBar />
      <div className="flex items-center justify-between px-4 py-2 text-xs text-slate-500">
        <span>{rows.length} résultat(s)</span>
        {loading && <span className="text-slate-400">Chargement…</span>}
      </div>
      <AchievementsTable />
    </div>
  )
}
