import { useEffect, useState } from 'react'
import type { DifficultyLevel } from '@shared/types'
import { useStore } from '../../store/useStore'
import { sectionClass } from './shared'

/** Display metadata of difficulty levels (aligned with difficulty.ts). */
const DIFFICULTY_LEVELS: { key: DifficultyLevel; label: string; color: string }[] = [
  { key: 'very_easy', label: 'Très facile', color: '#22c55e' },
  { key: 'easy', label: 'Facile', color: '#84cc16' },
  { key: 'medium', label: 'Moyenne', color: '#eab308' },
  { key: 'hard', label: 'Difficile', color: '#f97316' },
  { key: 'very_hard', label: 'Très difficile', color: '#ef4444' },
  { key: 'extreme', label: 'Extrême', color: '#64748b' }
]

/** Labels of achievement kinds (kindId) for the weights view. */
const KIND_LABELS: Record<number, string> = {
  0: 'Non classé',
  1: 'Combats',
  2: 'JcJ',
  3: 'Personnage',
  4: 'Objets',
  5: 'Synthèse & récolte',
  8: 'Quêtes',
  11: 'Exploration',
  12: 'Grandes compagnies',
  13: 'Legacy'
}

type DifficultyStats = {
  total: number
  byLevel: Record<DifficultyLevel, number>
  averageScore: number
  hardest: { id: number; name: string; score: number } | null
  easiest: { id: number; name: string; score: number } | null
}

export default function DifficultySection() {
  const [diffStats, setDiffStats] = useState<DifficultyStats | null>(null)
  const [diffWeights, setDiffWeights] = useState<Record<number, number> | null>(null)
  const [recalculating, setRecalculating] = useState(false)

  const loadDifficulty = async () => {
    setDiffStats(await window.api.difficulty.stats())
    setDiffWeights((await window.api.difficulty.weights()).kind)
  }

  useEffect(() => {
    loadDifficulty()
  }, [])

  const recalcDifficulty = async () => {
    setRecalculating(true)
    try {
      await window.api.difficulty.recalculate()
      await loadDifficulty()
      await useStore.getState().init()
    } finally {
      setRecalculating(false)
    }
  }

  return (
    <section className={`mt-6 ${sectionClass}`}>
      <h3 className="font-semibold">Difficulté</h3>
      <p className="text-xs text-slate-500">
        Score additif borné : <b>points</b> + <b>palier</b> (Ultime/Sadique/Extrême) +{' '}
        <b>grind</b> + <b>défi</b> (no-hit/solo) + contexte (type) + récence + saisonnier. Les scores
        sont calculés au démarrage ; recalcule-les après une mise à jour du catalogue.
      </p>

      {diffStats && (
        <>
          <p className="text-sm text-slate-400">
            {diffStats.total} hauts faits notés · score moyen{' '}
            <span className="font-mono text-slate-200">{diffStats.averageScore}</span>
          </p>
          <div className="space-y-1">
            {DIFFICULTY_LEVELS.map((lvl) => {
              const n = diffStats.byLevel[lvl.key] ?? 0
              const pct = diffStats.total > 0 ? (n / diffStats.total) * 100 : 0
              return (
                <div key={lvl.key} className="flex items-center gap-2 text-xs">
                  <span className="w-24 shrink-0 text-slate-400">{lvl.label}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded bg-slate-800">
                    <div
                      className="h-full rounded"
                      style={{ width: `${pct}%`, backgroundColor: lvl.color }}
                    />
                  </div>
                  <span className="w-10 shrink-0 text-right font-mono text-slate-500">{n}</span>
                </div>
              )
            })}
          </div>
          {diffStats.hardest && (
            <p className="text-xs text-slate-500">
              Le plus dur : <span className="text-slate-300">{diffStats.hardest.name}</span> (
              {diffStats.hardest.score})
            </p>
          )}
        </>
      )}

      <button
        onClick={recalcDifficulty}
        disabled={recalculating}
        className="rounded bg-slate-700 px-3 py-1.5 text-sm hover:bg-slate-600 disabled:opacity-50"
      >
        {recalculating ? 'Recalcul…' : 'Recalculer les scores'}
      </button>

      {diffWeights && (
        <details className="text-xs text-slate-500">
          <summary className="cursor-pointer hover:text-slate-300">
            Poids par type de haut fait (valeurs calibrées)
          </summary>
          <ul className="mt-2 grid grid-cols-2 gap-x-4 gap-y-0.5">
            {Object.entries(diffWeights)
              .filter(([id]) => (KIND_LABELS[Number(id)] ?? '') !== '' && Number(id) !== 0)
              .sort((a, b) => b[1] - a[1])
              .map(([id, w]) => (
                <li key={id} className="flex justify-between">
                  <span>{KIND_LABELS[Number(id)] ?? `Type ${id}`}</span>
                  <span className="font-mono text-slate-400">{w}</span>
                </li>
              ))}
          </ul>
        </details>
      )}
    </section>
  )
}
