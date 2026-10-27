import { useEffect, useState } from 'react'
import type { Settings } from '@shared/types'
import { useStore } from '../store/useStore'
import LodestoneSection from './settings/LodestoneSection'
import CatalogSection from './settings/CatalogSection'
import CollectionsSection, { type CollStatus } from './settings/CollectionsSection'
import DifficultySection from './settings/DifficultySection'
import BackupSection from './settings/BackupSection'
import UpdatesSection from './settings/UpdatesSection'

export default function SettingsView() {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [collStatus, setCollStatus] = useState<CollStatus | null>(null)
  const [collRefreshing, setCollRefreshing] = useState(false)
  const [logVersion, setLogVersion] = useState(0)

  const loadCollStatus = async () => {
    const s = await window.api.collections.status()
    setCollStatus({ counts: s.counts, generatedAt: s.generatedAt })
  }

  useEffect(() => {
    window.api.settings.get().then(setSettings)
    loadCollStatus()
  }, [])

  const update = async (patch: Partial<Settings>) => {
    setSettings(await window.api.settings.update(patch))
  }

  const reloadAfterSync = async () => {
    setSettings(await window.api.settings.get())
    await loadCollStatus()
  }

  const reloadAfterImport = async () => {
    setSettings(await window.api.settings.get())
    await loadCollStatus()
    await useStore.getState().init()
    await useStore.getState().refreshCollectionPending()
    setLogVersion((v) => v + 1)
  }

  const refreshCollections = async () => {
    setCollRefreshing(true)
    try {
      await window.api.collections.refresh()
      await loadCollStatus()
      await useStore.getState().refreshCollectionPending()
    } finally {
      setCollRefreshing(false)
    }
  }

  const refreshCatalog = async () => {
    setRefreshing(true)
    try {
      await window.api.catalog.refresh()
      await useStore.getState().init()
      await refreshCollections()
    } finally {
      setRefreshing(false)
    }
  }

  if (!settings) return <div className="p-6 text-slate-400">Chargement…</div>

  return (
    <div className="flex-1 overflow-auto p-6">
      <h2 className="mb-4 text-lg font-bold">Paramètres</h2>
      <LodestoneSection
        settings={settings}
        onUpdate={update}
        onSynced={reloadAfterSync}
        logVersion={logVersion}
      />
      <CatalogSection busy={refreshing || collRefreshing} onRefresh={refreshCatalog} />
      <DifficultySection />
      <CollectionsSection status={collStatus} refreshing={collRefreshing} onRefresh={refreshCollections} />
      <BackupSection settings={settings} onUpdate={update} onImported={reloadAfterImport} />
      <UpdatesSection />
    </div>
  )
}
