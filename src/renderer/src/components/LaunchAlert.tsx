import { useEffect, useState } from 'react'
import { isDoneThisPeriod, nextReset } from '@shared/resets'
import type { RecurringTask } from '@shared/types'
import { useStore } from '../store/useStore'
import { formatCountdown } from '../lib/time'

/**
 * Alerte affichée une seule fois au lancement si des tâches récurrentes restent
 * à faire pour la période en cours.
 */
export default function LaunchAlert() {
  const recurring = useStore((s) => s.recurring)
  const setView = useStore((s) => s.setView)
  const setRecurringDone = useStore((s) => s.setRecurringDone)
  const [open, setOpen] = useState(false)
  const [checked, setChecked] = useState(false)
  const now = new Date()

  // Déclenche une fois, après le chargement des tâches.
  useEffect(() => {
    if (checked || recurring.length === 0) return
    const pending = recurring.some((t) => !isDoneThisPeriod(t.type, t.lastCompletedAt))
    if (pending) setOpen(true)
    setChecked(true)
  }, [recurring, checked])

  if (!open) return null

  const pending = recurring.filter((t) => !isDoneThisPeriod(t.type, t.lastCompletedAt, now))
  const daily = pending.filter((t) => t.type === 'daily')
  const daily22 = pending.filter((t) => t.type === 'daily22')
  const weekly = pending.filter((t) => t.type === 'weekly')

  const Section = ({ title, items }: { title: string; items: RecurringTask[] }) => {
    if (items.length === 0) return null
    const reset = nextReset(items[0].type, now)
    return (
      <div className="mb-3">
        <div className="mb-1 flex items-baseline justify-between">
          <span className="text-sm font-semibold uppercase tracking-wide text-amber-400">
            {title} ({items.length})
          </span>
          <span className="font-mono text-xs text-slate-500">
            reset dans {formatCountdown(reset.getTime() - now.getTime())}
          </span>
        </div>
        <ul className="space-y-1">
          {items.map((t) => (
            <li key={t.id} className="flex items-center gap-2 rounded bg-slate-800/60 px-2 py-1 text-sm">
              <input
                type="checkbox"
                onChange={() => setRecurringDone(t.id, true)}
                className="h-3.5 w-3.5 accent-emerald-500"
                title="Marquer comme fait"
              />
              <span className="flex-1 truncate">{t.name}</span>
            </li>
          ))}
        </ul>
      </div>
    )
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-[28rem] max-w-full rounded-lg border border-slate-700 bg-slate-900 p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-1 text-lg font-bold">⏰ Tâches en attente</h2>
        {pending.length === 0 ? (
          <p className="mb-4 text-sm text-emerald-400">✅ Tout est fait pour cette période, bravo !</p>
        ) : (
          <>
            <p className="mb-4 text-sm text-slate-400">
              Il te reste {pending.length} tâche(s) récurrente(s) à faire pour cette période.
            </p>
            <div className="max-h-72 overflow-auto">
              <Section title="Quotidiennes" items={daily} />
              <Section title="Ravitaillement (22 h)" items={daily22} />
              <Section title="Hebdomadaires" items={weekly} />
            </div>
          </>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={() => setOpen(false)}
            className="rounded bg-slate-700 px-3 py-1.5 text-sm hover:bg-slate-600"
          >
            Plus tard
          </button>
          <button
            onClick={() => {
              setView('recurring')
              setOpen(false)
            }}
            className="rounded bg-emerald-600 px-3 py-1.5 text-sm font-medium hover:bg-emerald-500"
          >
            Voir les tâches
          </button>
        </div>
      </div>
    </div>
  )
}
