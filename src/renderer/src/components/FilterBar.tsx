import type { AchievementStatus, DifficultyLevel, SortField } from '@shared/types'
import { useStore } from '../store/useStore'

const ctrl = 'rounded bg-slate-800 px-2 py-1.5 text-sm text-slate-200 outline-none focus:ring-1 focus:ring-emerald-500'

const SORT_OPTIONS: { value: SortField; label: string }[] = [
  { value: 'name', label: 'Nom' },
  { value: 'points', label: 'Points' },
  { value: 'difficulty', label: 'Difficulté' },
  { value: 'patch', label: 'Patch' },
  { value: 'category', label: 'Catégorie' },
  { value: 'completedDate', label: 'Date' },
  { value: 'priority', label: 'Priorité' },
  { value: 'focusOrder', label: 'Focus' },
]

export default function FilterBar() {
  const filter = useStore((s) => s.filter)
  const kinds = useStore((s) => s.kinds)
  const categories = useStore((s) => s.categories)
  const setFilter = useStore((s) => s.setFilter)
  const resetFilter = useStore((s) => s.resetFilter)

  const cats = filter.kindId != null ? categories.filter((c) => c.kindId === filter.kindId) : categories

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-slate-800 px-4 py-3">
      <input
        id="search-input"
        value={filter.search ?? ''}
        onChange={(e) => setFilter({ search: e.target.value })}
        placeholder="Rechercher… (AND, OR, NOT)"
        className={`${ctrl} w-56 placeholder:text-slate-500`}
      />

      <select
        value={filter.status}
        onChange={(e) => setFilter({ status: e.target.value as AchievementStatus })}
        className={ctrl}
      >
        <option value="all">Tous</option>
        <option value="todo">À faire</option>
        <option value="completed">Obtenus</option>
        <option value="focus">Focus</option>
      </select>

      <select
        value={filter.kindId ?? ''}
        onChange={(e) =>
          setFilter({ kindId: e.target.value ? Number(e.target.value) : null, categoryId: null })
        }
        className={ctrl}
      >
        <option value="">Tous les types</option>
        {kinds.map((k) => (
          <option key={k.id} value={k.id}>
            {k.name}
          </option>
        ))}
      </select>

      <select
        value={filter.categoryId ?? ''}
        onChange={(e) => setFilter({ categoryId: e.target.value ? Number(e.target.value) : null })}
        className={`${ctrl} max-w-[200px]`}
      >
        <option value="">Toutes les catégories</option>
        {cats.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>

      <select
        value={filter.difficultyLevel ?? ''}
        onChange={(e) => setFilter({ difficultyLevel: e.target.value as DifficultyLevel | null })}
        className={ctrl}
      >
        <option value="">Toutes difficultés</option>
        <option value="very_easy">⭐ Très facile</option>
        <option value="easy">⭐⭐ Facile</option>
        <option value="medium">⭐⭐⭐ Moyenne</option>
        <option value="hard">⭐⭐⭐⭐ Difficile</option>
        <option value="very_hard">⭐⭐⭐⭐⭐ Très difficile</option>
        <option value="extreme">⭐⭐⭐⭐⭐⭐ Extrême</option>
      </select>

      <div className="flex items-center gap-1">
        <input
          type="number"
          value={filter.minPoints ?? ''}
          onChange={(e) => setFilter({ minPoints: e.target.value ? Number(e.target.value) : null })}
          placeholder="pts min"
          className={`${ctrl} w-20 placeholder:text-slate-500`}
        />
        <span className="text-slate-600">–</span>
        <input
          type="number"
          value={filter.maxPoints ?? ''}
          onChange={(e) => setFilter({ maxPoints: e.target.value ? Number(e.target.value) : null })}
          placeholder="pts max"
          className={`${ctrl} w-20 placeholder:text-slate-500`}
        />
      </div>

      <label className="flex items-center gap-1.5 text-sm text-slate-400">
        <input
          type="checkbox"
          checked={filter.obtainableOnly ?? false}
          onChange={(e) => setFilter({ obtainableOnly: e.target.checked })}
          className="accent-emerald-500"
        />
        Obtenables
      </label>

      <label className="flex items-center gap-1.5 text-sm text-slate-400">
        <input
          type="checkbox"
          checked={filter.hasNote ?? false}
          onChange={(e) => setFilter({ hasNote: e.target.checked })}
          className="accent-emerald-500"
        />
        Avec note
      </label>

      <select
        value={filter.sortBy}
        onChange={(e) => setFilter({ sortBy: e.target.value as SortField })}
        className={ctrl}
      >
        {SORT_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>

      <select
        value={filter.sortDir}
        onChange={(e) => setFilter({ sortDir: e.target.value as 'asc' | 'desc' })}
        className={ctrl}
      >
        <option value="asc">↑ Croissant</option>
        <option value="desc">↓ Décroissant</option>
      </select>

      <button
        onClick={resetFilter}
        className="ml-auto rounded bg-slate-800 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-700"
      >
        Réinitialiser
      </button>
    </div>
  )
}
