import { useEffect, useState } from 'react'
import type { Settings, Suggestion, SuggestionWeights } from '@shared/types'
import { useStore } from '../store/useStore'

export default function SuggestionsView() {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [items, setItems] = useState<Suggestion[]>([])
  const select = useStore((s) => s.select)

  useEffect(() => {
    window.api.settings.get().then(setSettings)
  }, [])

  useEffect(() => {
    if (settings) {
      window.api.suggestions(settings.suggestionWeights).then(setItems)
    }
  }, [settings])

  const updateWeights = (newWeights: SuggestionWeights) => {
    window.api.settings.update({ suggestionWeights: newWeights }).then(setSettings)
  }

  if (!settings) return <div className="p-6 text-slate-400">Chargement…</div>

  const slider = (key: keyof SuggestionWeights, label: string) => (
    <label className="flex items-center gap-3 text-xs text-slate-400">
      <span className="w-44">{label}</span>
      <input
        type="range"
        min={0}
        max={5}
        step={1}
        value={settings.suggestionWeights[key]}
        onChange={(e) => updateWeights({ ...settings.suggestionWeights, [key]: Number(e.target.value) })}
        className="accent-emerald-500"
      />
      <span className="w-4 text-slate-300">{settings.suggestionWeights[key]}</span>
    </label>
  )

  return (
    <div className="flex-1 overflow-auto p-6">
      <h2 className="mb-1 text-lg font-bold">Suggestions — à faire ensuite</h2>
      <p className="mb-4 text-xs text-slate-500">
        Hauts faits non obtenus (hors Legacy et non-obtenables), classés par heuristique. Ajuste les
        poids ci-dessous pour personnaliser le classement.
      </p>
      <div className="mb-5 max-w-md space-y-2 rounded border border-slate-800 bg-slate-950 p-3">
        {slider('priority', 'Priorité')}
        {slider('points', 'Points')}
        {slider('categoryProximity', 'Catégorie presque finie')}
      </div>

      <ul className="space-y-1">
        {items.map((s) => (
          <li
            key={s.achievement.id}
            className="flex items-center gap-3 rounded bg-slate-800/60 px-3 py-2 text-sm"
          >
            <span className="w-10 text-right font-mono text-amber-400">{s.achievement.points}</span>
            <button
              onClick={() => select(s.achievement.id)}
              className="flex-1 truncate text-left hover:text-white"
            >
              {s.achievement.name}
            </button>
            <span className="hidden gap-1 lg:flex">
              {s.reasons.map((r, i) => (
                <span
                  key={i}
                  className="rounded bg-slate-700/70 px-1.5 py-0.5 text-[10px] text-slate-300"
                >
                  {r}
                </span>
              ))}
            </span>
            <span className="hidden w-40 truncate text-right text-xs text-slate-500 md:block">
              {s.achievement.categoryName}
            </span>
          </li>
        ))}
        {items.length === 0 && (
          <li className="text-slate-400">Aucune suggestion — tout est obtenu, ou le catalogue est vide.</li>
        )}
      </ul>
    </div>
  )
}
