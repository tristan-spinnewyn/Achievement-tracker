import { isDoneThisPeriod } from '@shared/resets'
import { useStore, type View } from '../store/useStore'

const items: { id: View; label: string; icon: string }[] = [
  { id: 'dashboard', label: 'Tableau de bord', icon: '📊' },
  { id: 'achievements', label: 'Hauts faits', icon: '🏆' },
  { id: 'newpatch', label: 'Nouveautés', icon: '✨' },
  { id: 'focus', label: 'Focus', icon: '🎯' },
  { id: 'recurring', label: 'Quotidiens', icon: '🔁' },
  { id: 'mounts', label: 'Montures', icon: '🐎' },
  { id: 'minions', label: 'Mascottes', icon: '🐾' },
  { id: 'orchestrion', label: 'Orchestrion', icon: '🎵' },
  { id: 'emotes', label: 'Emotes', icon: '😄' },
  { id: 'faceaccessories', label: 'Accessoires de visage', icon: '👓' },
  { id: 'fashion', label: 'Accessoires de mode', icon: '🕶️' },
  { id: 'hairstyles', label: 'Coiffures', icon: '💇' },
  { id: 'bardings', label: 'Bardes', icon: '🛡️' },
  { id: 'titles', label: 'Titres', icon: '🎖️' },
  { id: 'bluemagic', label: 'Magie bleue', icon: '🔵' },
  { id: 'tripletriad', label: 'Triple Triade', icon: '🃏' },
  { id: 'suggestions', label: 'Suggestions', icon: '💡' },
  { id: 'settings', label: 'Paramètres', icon: '⚙️' }
]

export default function Sidebar() {
  const view = useStore((s) => s.view)
  const setView = useStore((s) => s.setView)
  const status = useStore((s) => s.catalogStatus)
  const recurring = useStore((s) => s.recurring)
  const newPatchPending = useStore((s) => s.newPatchPending)
  const collectionPending = useStore((s) => s.collectionPending)

  const collectionBadge: Record<string, number> = {
    mounts: collectionPending.mount,
    minions: collectionPending.minion,
    orchestrion: collectionPending.orchestrion,
    emotes: collectionPending.emote,
    fashion: collectionPending.fashion,
    hairstyles: collectionPending.hairstyle,
    bardings: collectionPending.barding,
    titles: collectionPending.title,
    faceaccessories: collectionPending.faceaccessory,
    bluemagic: collectionPending.spell,
    tripletriad: collectionPending.tripletriad
  }

  const pendingRecurring = recurring.filter(
    (t) => !isDoneThisPeriod(t.type, t.lastCompletedAt)
  ).length

  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-slate-800 bg-slate-950">
      <div className="px-4 py-4">
        <h1 className="text-sm font-bold leading-tight">
          FFXIV
          <br />
          <span className="text-emerald-400">Achievement Tracker</span>
        </h1>
      </div>
      <nav className="flex-1 space-y-1 px-2">
        {items.map((it) => (
          <button
            key={it.id}
            onClick={() => setView(it.id)}
            className={`flex w-full items-center gap-2 rounded px-3 py-2 text-left text-sm transition-colors ${
              view === it.id ? 'bg-slate-800 text-white' : 'text-slate-400 hover:bg-slate-800/50'
            }`}
          >
            <span>{it.icon}</span>
            <span className="flex-1">{it.label}</span>
            {it.id === 'recurring' && pendingRecurring > 0 && (
              <span className="rounded-full bg-amber-500 px-1.5 text-xs font-semibold text-slate-900">
                {pendingRecurring}
              </span>
            )}
            {it.id === 'newpatch' && newPatchPending > 0 && (
              <span className="rounded-full bg-sky-500 px-1.5 text-xs font-semibold text-slate-900">
                {newPatchPending}
              </span>
            )}
            {collectionBadge[it.id] > 0 && (
              <span className="rounded-full bg-sky-500 px-1.5 text-xs font-semibold text-slate-900">
                {collectionBadge[it.id]}
              </span>
            )}
          </button>
        ))}
      </nav>
      {status && (
        <div className="border-t border-slate-800 px-4 py-3 text-xs text-slate-500">
          {status.achievementCount} hauts faits
        </div>
      )}
    </aside>
  )
}
