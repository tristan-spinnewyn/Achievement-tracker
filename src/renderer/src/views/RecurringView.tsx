import { useEffect, useState } from 'react'
import type { AchievementRow, RecurringTask, RecurringType } from '@shared/types'
import { isDoneThisPeriod, nextDailyReset, nextWeeklyReset, nextDaily22Reset } from '@shared/resets'
import { useStore } from '../store/useStore'
import { iconUrl } from '../lib/icons'
import { formatCountdown } from '../lib/time'

const PRESETS: { name: string; type: RecurringType }[] = [
  { name: 'Roulette : Expert', type: 'daily' },
  { name: 'Roulette : Niveau maximal', type: 'daily' },
  { name: 'Roulette : Alliance', type: 'daily' },
  { name: 'Roulette : Défis (primordiaux)', type: 'daily' },
  { name: 'Roulette : Donjons de la dévastation', type: 'daily' },
  { name: 'Roulette : Frontline (JcJ)', type: 'daily' },
  { name: 'Mini Loto', type: 'daily' },
  { name: 'Quêtes de tribus', type: 'daily' },
  { name: 'Échoppe de Doma', type: 'daily' },
  { name: 'Missions de ravitaillement (grande compagnie)', type: 'daily22' },
  { name: 'Livraisons clientes', type: 'weekly' },
  { name: 'Carnet d’aventures (Wondrous Tails)', type: 'weekly' },
  { name: 'Rapport de mode (Fashion Report)', type: 'weekly' },
  { name: 'Jumbo Loto', type: 'weekly' },
  { name: 'Marques de chasse (hebdo)', type: 'weekly' },
  { name: 'Tomes hebdomadaires plafonnés', type: 'weekly' }
]

const typeLabel = (t: RecurringType): string =>
  t === 'weekly' ? 'Hebdomadaire' : t === 'daily22' ? 'Ravitaillement (22 h)' : 'Quotidien'
const typeBadge = (t: RecurringType): string => (t === 'weekly' ? 'H' : t === 'daily22' ? 'R' : 'J')

function ResetCard({ label, target, now }: { label: string; target: Date; now: Date }) {
  return (
    <div className="rounded border border-slate-800 bg-slate-950 p-4">
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 font-mono text-xl text-emerald-400">
        {formatCountdown(target.getTime() - now.getTime())}
      </div>
      <div className="text-xs text-slate-500">{target.toLocaleString('fr-FR')}</div>
    </div>
  )
}

export default function RecurringView() {
  const recurring = useStore((s) => s.recurring)
  const addRecurring = useStore((s) => s.addRecurring)
  const deleteRecurring = useStore((s) => s.deleteRecurring)
  const setRecurringDone = useStore((s) => s.setRecurringDone)
  const select = useStore((s) => s.select)

  const [now, setNow] = useState(() => new Date())
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<AchievementRow[]>([])
  const [type, setType] = useState<RecurringType>('daily')

  useEffect(() => {
    const i = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(i)
  }, [])

  // Autocomplétion : recherche de hauts faits non obtenus à lier.
  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) {
      setResults([])
      return
    }
    const id = setTimeout(async () => {
      setResults(await window.api.achievements.list({ search: q, status: 'todo', limit: 8 }))
    }, 250)
    return () => clearTimeout(id)
  }, [query])

  const addFree = () => {
    const n = query.trim()
    if (!n) return
    addRecurring({ name: n, type })
    setQuery('')
    setResults([])
  }

  const addLinked = (r: AchievementRow) => {
    addRecurring({ name: r.name, type, achievementId: r.id, iconPath: r.iconPath })
    setQuery('')
    setResults([])
  }

  const daily = recurring.filter((t) => t.type === 'daily')
  const weekly = recurring.filter((t) => t.type === 'weekly')
  const daily22 = recurring.filter((t) => t.type === 'daily22')
  const pendingCount = (list: RecurringTask[]) =>
    list.filter((t) => !isDoneThisPeriod(t.type, t.lastCompletedAt, now)).length

  const renderTask = (t: RecurringTask) => {
    const done = isDoneThisPeriod(t.type, t.lastCompletedAt, now)
    const url = iconUrl(t.iconPath)
    return (
      <li key={t.id} className="flex items-center gap-3 rounded bg-slate-800/60 px-3 py-2">
        <input
          type="checkbox"
          checked={done}
          onChange={() => setRecurringDone(t.id, !done)}
          className="h-4 w-4 accent-emerald-500"
        />
        {url && (
          <img
            src={url}
            className="h-6 w-6 rounded"
            onError={(e) => {
              e.currentTarget.style.visibility = 'hidden'
            }}
          />
        )}
        {t.achievementId != null ? (
          <button
            onClick={() => select(t.achievementId!)}
            title="Voir le haut fait"
            className={`flex-1 truncate text-left hover:text-white ${done ? 'text-slate-500 line-through' : ''}`}
          >
            {t.name}
          </button>
        ) : (
          <span className={`flex-1 ${done ? 'text-slate-500 line-through' : ''}`}>{t.name}</span>
        )}
        {(t.streak ?? 0) >= 2 && (
          <span
            className="shrink-0 text-xs text-orange-400"
            title={`Série : ${t.streak} périodes consécutives`}
          >
            🔥 {t.streak}
          </span>
        )}
        {t.achievementId != null && (
          <span className="text-xs text-slate-600" title="Lié à un haut fait (disparaît une fois obtenu)">
            🔗
          </span>
        )}
        <button
          onClick={() => deleteRecurring(t.id)}
          className="text-slate-500 hover:text-red-400"
          title="Supprimer"
        >
          ✕
        </button>
      </li>
    )
  }

  return (
    <div className="flex-1 overflow-auto p-6">
      <h2 className="mb-1 text-lg font-bold">Quotidiens &amp; Hebdomadaires</h2>
      <p className="mb-4 text-xs text-slate-500">
        Coche tes tâches quand tu les as faites ; elles se réinitialisent automatiquement au reset du
        jeu (quotidien 17 h, hebdo mardi 10 h — heure de Paris en été). Les missions de
        ravitaillement se réinitialisent à 22&nbsp;h (heure de Paris en été, 21&nbsp;h en hiver).
      </p>

      <div className="mb-6 grid max-w-2xl grid-cols-3 gap-3">
        <ResetCard label="Reset quotidien dans" target={nextDailyReset(now)} now={now} />
        <ResetCard label="Reset ravitaillement (22 h) dans" target={nextDaily22Reset(now)} now={now} />
        <ResetCard label="Reset hebdo (mardi) dans" target={nextWeeklyReset(now)} now={now} />
      </div>

      <div className="mb-6 max-w-lg">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') addFree()
              }}
              placeholder="Rechercher un haut fait, ou saisir une tâche libre…"
              className="w-full rounded bg-slate-800 px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-emerald-500"
            />
            {results.length > 0 && (
              <ul className="absolute z-10 mt-1 max-h-72 w-full overflow-auto rounded border border-slate-700 bg-slate-900 shadow-xl">
                {results.map((r) => {
                  const u = iconUrl(r.iconPath)
                  return (
                    <li key={r.id}>
                      <button
                        onClick={() => addLinked(r)}
                        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-slate-800"
                      >
                        {u && (
                          <img
                            src={u}
                            className="h-5 w-5 rounded"
                            onError={(e) => {
                              e.currentTarget.style.visibility = 'hidden'
                            }}
                          />
                        )}
                        <span className="flex-1 truncate">{r.name}</span>
                        <span className="shrink-0 text-xs text-slate-500">{r.categoryName}</span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as RecurringType)}
            className="rounded bg-slate-800 px-2 text-sm text-slate-200"
          >
            <option value="daily">Quotidien (jeu)</option>
            <option value="daily22">Ravitaillement (22 h)</option>
            <option value="weekly">Hebdo</option>
          </select>
          <button
            onClick={addFree}
            className="rounded bg-emerald-600 px-3 py-1.5 text-sm font-medium hover:bg-emerald-500"
          >
            Ajouter
          </button>
        </div>
        <p className="mt-1 text-xs text-slate-500">
          Choisis un haut fait dans la liste pour <b>lier</b> la tâche — elle disparaîtra
          automatiquement une fois le haut fait obtenu.
        </p>

        <details className="mt-3">
          <summary className="cursor-pointer text-xs text-slate-400 hover:text-slate-200">
            Ajouter un préréglage courant…
          </summary>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {PRESETS.map((p) => {
              const added = recurring.some(
                (t) => t.name.toLowerCase() === p.name.toLowerCase()
              )
              return (
                <button
                  key={p.name}
                  disabled={added}
                  onClick={() => addRecurring({ name: p.name, type: p.type })}
                  title={typeLabel(p.type)}
                  className={`rounded-full border px-2 py-0.5 text-xs ${
                    added
                      ? 'cursor-default border-slate-800 text-slate-600'
                      : 'border-slate-700 text-slate-300 hover:border-emerald-500 hover:text-white'
                  }`}
                >
                  {added ? '✓ ' : '+ '}
                  {p.name}
                  <span className="ml-1 text-[10px] text-slate-500">{typeBadge(p.type)}</span>
                </button>
              )
            })}
          </div>
        </details>
      </div>

      <div className="grid max-w-5xl gap-6 md:grid-cols-3">
        <div>
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-400">
            Quotidiens (jeu) <span className="text-amber-400">({pendingCount(daily)} à faire)</span>
          </h3>
          <ul className="space-y-1">
            {daily.map(renderTask)}
            {daily.length === 0 && (
              <li className="text-sm text-slate-500">Aucune tâche quotidienne.</li>
            )}
          </ul>
        </div>
        <div>
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-400">
            Ravitaillement (22 h){' '}
            <span className="text-amber-400">({pendingCount(daily22)} à faire)</span>
          </h3>
          <ul className="space-y-1">
            {daily22.map(renderTask)}
            {daily22.length === 0 && (
              <li className="text-sm text-slate-500">Aucune mission de ravitaillement.</li>
            )}
          </ul>
        </div>
        <div>
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-400">
            Hebdomadaires <span className="text-amber-400">({pendingCount(weekly)} à faire)</span>
          </h3>
          <ul className="space-y-1">
            {weekly.map(renderTask)}
            {weekly.length === 0 && (
              <li className="text-sm text-slate-500">Aucune tâche hebdomadaire.</li>
            )}
          </ul>
        </div>
      </div>
    </div>
  )
}
