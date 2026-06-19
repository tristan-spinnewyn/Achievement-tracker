import { useEffect, useState } from 'react'
import type { AchievementRow, CollectionType, DashboardData, DifficultyLevel } from '@shared/types'
import ProgressChart from '../components/ProgressChart'
import { DifficultyBadge } from '../components/DifficultyBadge'
import { useStore } from '../store/useStore'

const COLLECTION_LABELS: Record<CollectionType, string> = {
  mount: 'Montures',
  minion: 'Mascottes',
  orchestrion: 'Orchestrion',
  emote: 'Emotes',
  faceaccessory: 'Accessoires de visage',
  fashion: 'Accessoires de mode',
  hairstyle: 'Coiffures',
  barding: 'Bardes',
  title: 'Titres',
  spell: 'Magie bleue',
  tripletriad: 'Triple Triade'
}

function pct(done: number, total: number): number {
  return total ? Math.round((done / total) * 100) : 0
}

function Bar({ value }: { value: number }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded bg-slate-800">
      <div className="h-full rounded bg-emerald-500 transition-all" style={{ width: `${value}%` }} />
    </div>
  )
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded border border-slate-800 bg-slate-950 p-4">
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-bold">{value}</div>
      {sub && <div className="text-xs text-slate-500">{sub}</div>}
    </div>
  )
}

// Couleurs des niveaux de difficulté
const DIFFICULTY_COLORS: Record<DifficultyLevel, string> = {
  very_easy: '#22c55e',
  easy: '#84cc16',
  medium: '#eab308',
  hard: '#f97316',
  very_hard: '#ef4444',
  extreme: '#93c5fd',
}

const DIFFICULTY_NAMES: Record<DifficultyLevel, string> = {
  very_easy: 'Très facile',
  easy: 'Facile',
  medium: 'Moyenne',
  hard: 'Difficile',
  very_hard: 'Très difficile',
  extreme: 'Extrême',
}

export default function DashboardView() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [collections, setCollections] = useState<
    { type: CollectionType; owned: number; total: number }[]
  >([])
  const [difficultyStats, setDifficultyStats] = useState<{
    total: number
    byLevel: Record<DifficultyLevel, number>
    averageScore: number
    hardest: { id: number; name: string; score: number } | null
    easiest: { id: number; name: string; score: number } | null
  } | null>(null)
  const [hardestTodo, setHardestTodo] = useState<AchievementRow[]>([])
  const select = useStore((s) => s.select)

  useEffect(() => {
    window.api.dashboard().then(setData)
    window.api.collections.allProgress().then(setCollections)
    window.api.difficulty.stats().then(setDifficultyStats)
    window.api.achievements
      .list({ status: 'todo', obtainableOnly: true, sortBy: 'difficulty', sortDir: 'desc', limit: 10 })
      .then(setHardestTodo)
  }, [])

  if (!data) return <div className="p-6 text-slate-400">Chargement…</div>

  const completionPct = pct(data.completedAchievements, data.totalAchievements)
  const pointsPct = pct(data.earnedPoints, data.totalPoints)

  return (
    <div className="flex-1 overflow-auto p-6">
      <h2 className="mb-4 text-lg font-bold">Tableau de bord</h2>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="Hauts faits"
          value={`${data.completedAchievements} / ${data.totalAchievements}`}
          sub={`${completionPct}% complété`}
        />
        <Stat label="Points" value={`${data.earnedPoints} / ${data.totalPoints}`} sub={`${pointsPct}%`} />
        <Stat label="Focus" value={String(data.focusCount)} sub="objectifs en cours" />
        <Stat
          label="Restants"
          value={String(data.totalAchievements - data.completedAchievements)}
          sub="à obtenir"
        />
      </div>

      <div className="mb-6 rounded border border-slate-800 bg-slate-950 p-4">
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">
          Historique de progression
        </h3>
        <ProgressChart />
      </div>

      {collections.some((c) => c.total > 0) && (
        <>
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-400">
            Collections
          </h3>
          <div className="mb-6 grid gap-2 sm:grid-cols-2">
            {collections
              .filter((c) => c.total > 0)
              .map((c) => {
                const p = pct(c.owned, c.total)
                return (
                  <div key={c.type} className="rounded border border-slate-800 bg-slate-950 p-3">
                    <div className="mb-1 flex justify-between text-sm">
                      <span>{COLLECTION_LABELS[c.type]}</span>
                      <span className="text-slate-400">
                        {c.owned}/{c.total} · {p}%
                      </span>
                    </div>
                    <Bar value={p} />
                  </div>
                )
              })}
          </div>
        </>
      )}

      <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-400">
        Progression par type
      </h3>
      <div className="mb-6 space-y-2">
        {data.byKind.map((k) => {
          const p = pct(k.completed, k.total)
          return (
            <div key={k.kindId} className="rounded border border-slate-800 bg-slate-950 p-3">
              <div className="mb-1 flex justify-between text-sm">
                <span>{k.kindName}</span>
                <span className="text-slate-400">
                  {k.completed}/{k.total} · {p}%
                </span>
              </div>
              <Bar value={p} />
            </div>
          )
        })}
      </div>

      <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-400">
        Progression par catégorie
      </h3>
      <div className="mb-6 space-y-3">
        {data.byKind.map((k) => {
          const cats = data.byCategory.filter((c) => c.kindId === k.kindId)
          if (!cats.length) return null
          return (
            <details key={k.kindId} className="rounded border border-slate-800 bg-slate-950 p-3">
              <summary className="cursor-pointer text-sm font-medium">
                {k.kindName}{' '}
                <span className="text-xs text-slate-500">
                  ({k.completed}/{k.total})
                </span>
              </summary>
              <div className="mt-2 space-y-2">
                {cats.map((c) => (
                  <div key={c.categoryId}>
                    <div className="mb-0.5 flex justify-between text-xs text-slate-400">
                      <span>{c.categoryName}</span>
                      <span>
                        {c.completed}/{c.total}
                      </span>
                    </div>
                    <Bar value={pct(c.completed, c.total)} />
                  </div>
                ))}
              </div>
            </details>
          )
        })}
      </div>

      {difficultyStats && (
        <>
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-400">
            Répartition par difficulté
          </h3>
          <div className="mb-6 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {(Object.entries(difficultyStats.byLevel) as [DifficultyLevel, number][])
              .sort(([a], [b]) => {
                // Ordre personnalisé pour l'affichage
                const order: DifficultyLevel[] = ['very_easy', 'easy', 'medium', 'hard', 'very_hard', 'extreme']
                return order.indexOf(a) - order.indexOf(b)
              })
              .map(([level, count]) => {
                const p = pct(count, difficultyStats.total)
                return (
                  <div key={level} className="rounded border border-slate-800 bg-slate-950 p-3">
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span className="flex items-center gap-1">
                        <span style={{ color: DIFFICULTY_COLORS[level] }}>
                          {level === 'very_easy' ? '⭐' : 
                           level === 'easy' ? '⭐⭐' : 
                           level === 'medium' ? '⭐⭐⭐' : 
                           level === 'hard' ? '⭐⭐⭐⭐' : 
                           level === 'very_hard' ? '⭐⭐⭐⭐⭐' : '⭐⭐⭐⭐⭐⭐'}
                        </span>
                        <span>{DIFFICULTY_NAMES[level]}</span>
                      </span>
                      <span className="text-slate-400">
                        {count} · {p}%
                      </span>
                    </div>
                    <Bar value={p} />
                  </div>
                )
              })}
          </div>
          
          <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat
              label="Score moyen"
              value={difficultyStats.averageScore.toFixed(1)}
              sub="de difficulté"
            />
            {difficultyStats.hardest && (
              <Stat
                label="Le plus difficile"
                value={difficultyStats.hardest.name}
                sub={`Score: ${difficultyStats.hardest.score}`}
              />
            )}
            {difficultyStats.easiest && (
              <Stat
                label="Le plus facile"
                value={difficultyStats.easiest.name}
                sub={`Score: ${difficultyStats.easiest.score}`}
              />
            )}
          </div>
        </>
      )}

      {hardestTodo.length > 0 && (
        <>
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-400">
            Plus difficiles encore à faire
          </h3>
          <ul className="mb-6 space-y-1">
            {hardestTodo.map((r) => (
              <li key={r.id}>
                <button
                  onClick={() => select(r.id)}
                  className="flex w-full items-center gap-3 rounded bg-slate-800/60 px-3 py-1.5 text-left text-sm hover:bg-slate-700/60"
                >
                  <DifficultyBadge achievementId={r.id} />
                  <span className="flex-1 truncate">{r.name}</span>
                  <span className="text-xs text-slate-500">{r.categoryName}</span>
                  <span className="w-10 text-right font-mono text-amber-400">{r.points}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {data.recentCompletions.length > 0 && (
        <>
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-400">
            Derniers obtenus
          </h3>
          <ul className="space-y-1">
            {data.recentCompletions.map((r) => (
              <li
                key={r.id}
                className="flex items-center gap-3 rounded bg-slate-800/60 px-3 py-1.5 text-sm"
              >
                <span className="w-10 text-right font-mono text-amber-400">{r.points}</span>
                <span className="flex-1 truncate">{r.name}</span>
                <span className="text-xs text-slate-500">{r.completedDate}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
