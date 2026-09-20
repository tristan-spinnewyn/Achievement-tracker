import { useEffect, useState } from 'react'
import { SYNCABLE_COLLECTIONS } from '@shared/types'
import { useStore } from './store/useStore'
import Sidebar from './components/Sidebar'
import type { View } from './store/useStore'
import AchievementsView from './views/AchievementsView'
import DashboardView from './views/DashboardView'
import FocusView from './views/FocusView'
import SuggestionsView from './views/SuggestionsView'
import SettingsView from './views/SettingsView'
import RecurringView from './views/RecurringView'
import CollectionsView from './views/CollectionsView'
import NewPatchView from './views/NewPatchView'
import DetailDrawer from './components/DetailDrawer'
import LaunchAlert from './components/LaunchAlert'
import UpdateBanner from './components/UpdateBanner'

function App() {
  const view = useStore((s) => s.view)
  const setView = useStore((s) => s.setView)
  const init = useStore((s) => s.init)
  const error = useStore((s) => s.error)
  const select = useStore((s) => s.select)
  const [autoSyncing, setAutoSyncing] = useState(false)

  useEffect(() => {
    init()
  }, [init])

  // Écouter les messages de navigation depuis le main process (via le bridge préload)
  useEffect(() => {
    const unsubscribe = window.api.onNavigate((targetView) => {
      setView(targetView as View)
    })
    return unsubscribe
  }, [setView])

  // Gestion des raccourcis clavier
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+K ou Ctrl+F : focus sur la barre de recherche
      if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'f')) {
        e.preventDefault()
        const searchInput = document.getElementById('search-input')
        if (searchInput) {
          searchInput.focus()
          e.stopPropagation()
        }
      }
      
      // Ctrl+1 à Ctrl+9 : changer de vue
      if ((e.ctrlKey || e.metaKey) && e.key >= '1' && e.key <= '9') {
        e.preventDefault()
        const views: View[] = ['dashboard', 'achievements', 'focus', 'recurring', 'suggestions', 'settings']
        const index = parseInt(e.key) - 1
        if (index < views.length) {
          setView(views[index])
        }
      }
      
      // Échap : fermer le DetailDrawer
      if (e.key === 'Escape') {
        e.preventDefault()
        select(null)
      }
      
      // Ctrl+Z : undo
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        window.api.history.undo()
      }
      
      // Ctrl+Y ou Ctrl+Shift+Z : redo
      if (((e.ctrlKey || e.metaKey) && e.key === 'y') ||
          ((e.ctrlKey || e.metaKey) && e.key === 'z' && e.shiftKey)) {
        e.preventDefault()
        window.api.history.redo()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [setView, select])

  // Synchronisation automatique au démarrage (si activée et personnage configuré).
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const s = await window.api.settings.get()
      if (cancelled || !s.autoSync || !s.lodestoneCharacterId) return
      setAutoSyncing(true)
      try {
        await window.api.lodestone.sync()
        for (const t of SYNCABLE_COLLECTIONS) await window.api.collections.sync(t)
      } catch {
        // synchro best-effort
      }
      if (cancelled) return
      await useStore.getState().init()
      await useStore.getState().refreshCollectionPending()
      setAutoSyncing(false)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="flex h-screen overflow-hidden bg-slate-900 text-slate-100">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        {autoSyncing && (
          <div className="bg-sky-900/50 px-4 py-1.5 text-xs text-sky-200">
            ⟳ Synchronisation automatique depuis le Lodestone…
          </div>
        )}
        {error && (
          <div className="bg-red-900/50 px-4 py-2 text-sm text-red-200">Erreur : {error}</div>
        )}
        {view === 'dashboard' && <DashboardView />}
        {view === 'achievements' && <AchievementsView />}
        {view === 'newpatch' && <NewPatchView />}
        {view === 'focus' && <FocusView />}
        {view === 'recurring' && <RecurringView />}
        {view === 'mounts' && <CollectionsView type="mount" />}
        {view === 'minions' && <CollectionsView type="minion" />}
        {view === 'orchestrion' && <CollectionsView type="orchestrion" />}
        {view === 'emotes' && <CollectionsView type="emote" />}
        {view === 'faceaccessories' && <CollectionsView type="faceaccessory" />}
        {view === 'fashion' && <CollectionsView type="fashion" />}
        {view === 'hairstyles' && <CollectionsView type="hairstyle" />}
        {view === 'bardings' && <CollectionsView type="barding" />}
        {view === 'titles' && <CollectionsView type="title" />}
        {view === 'bluemagic' && <CollectionsView type="spell" />}
        {view === 'beasts' && <CollectionsView type="beast" />}
        {view === 'tripletriad' && <CollectionsView type="tripletriad" />}
        {view === 'suggestions' && <SuggestionsView />}
        {view === 'settings' && <SettingsView />}
      </div>
      <DetailDrawer />
      <LaunchAlert />
      <UpdateBanner />
    </div>
  )
}

export default App
