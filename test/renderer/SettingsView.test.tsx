import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import SettingsView from '../../src/renderer/src/views/SettingsView'
import { useStore } from '../../src/renderer/src/store/useStore'
import { api, makeSettings } from './api'

function stubStore() {
  const init = vi.fn(async () => {})
  const refreshCollectionPending = vi.fn(async () => {})
  useStore.setState({ init, refreshCollectionPending } as never)
  return { init, refreshCollectionPending }
}

const section = (title: string): HTMLElement =>
  screen.getByRole('heading', { name: title }).closest('section') as HTMLElement

async function renderView() {
  render(<SettingsView />)
  await screen.findByRole('heading', { name: 'Paramètres' })
}

describe('SettingsView', () => {
  it('shows a loader until settings arrive', () => {
    api().settings.get.mockReturnValue(new Promise(() => {}))
    render(<SettingsView />)
    expect(screen.getByText('Chargement…')).toBeInTheDocument()
  })

  it('renders every section', async () => {
    stubStore()
    await renderView()
    for (const title of [
      'Synchronisation Lodestone',
      'Catalogue',
      'Difficulté',
      'Collections',
      'Sauvegarde automatique dans « Mes Documents »',
      'Application & Mises à jour'
    ]) {
      expect(screen.getByRole('heading', { name: title })).toBeInTheDocument()
    }
  })
})

describe('LodestoneSection', () => {
  it('disables sync without a character id', async () => {
    stubStore()
    await renderView()
    expect(within(section('Synchronisation Lodestone')).getByRole('button', { name: 'Synchroniser' })).toBeDisabled()
  })

  it('saves region, character id and auto-sync changes', async () => {
    stubStore()
    const user = userEvent.setup()
    await renderView()
    const s = within(section('Synchronisation Lodestone'))

    await user.selectOptions(s.getByRole('combobox'), 'ja')
    expect(api().settings.update).toHaveBeenCalledWith({ region: 'ja' })

    await user.type(s.getByPlaceholderText('ex. 6125331'), '7')
    expect(api().settings.update).toHaveBeenCalledWith({ lodestoneCharacterId: '7' })

    await user.click(s.getByRole('checkbox'))
    expect(api().settings.update).toHaveBeenCalledWith({ autoSync: true })
  })

  it('syncs achievements and every syncable collection, then reloads', async () => {
    const store = stubStore()
    api().settings.get.mockResolvedValue(makeSettings({ lodestoneCharacterId: '42' }))
    api().lodestone.syncLog
      .mockResolvedValueOnce([])
      .mockResolvedValue([{ at: '2026-10-01T10:00:00Z', ok: false, newlyCompleted: 0, totalCompleted: 0, message: 'Oups' }])
    const user = userEvent.setup()
    await renderView()

    await user.click(screen.getByRole('button', { name: 'Synchroniser' }))

    expect(await screen.findByText('Synchro OK')).toHaveClass('text-emerald-400')
    expect(api().collections.sync.mock.calls.map((c) => c[0])).toEqual(['mount', 'minion', 'emote', 'faceaccessory'])
    expect(store.init).toHaveBeenCalled()
    expect(store.refreshCollectionPending).toHaveBeenCalled()
    expect(await screen.findByText('Journal de synchro (1)')).toBeInTheDocument()
    expect(screen.getByText(/Oups/)).toHaveClass('text-red-400/80')
  })
})

describe('CatalogSection & CollectionsSection', () => {
  it('refreshes the catalog, then the collections', async () => {
    const store = stubStore()
    const user = userEvent.setup()
    await renderView()

    await user.click(screen.getByRole('button', { name: 'Mettre à jour depuis XIVAPI' }))

    await waitFor(() => expect(api().collections.refresh).toHaveBeenCalled())
    expect(api().catalog.refresh).toHaveBeenCalled()
    expect(store.init).toHaveBeenCalled()
    expect(await screen.findByRole('button', { name: 'Mettre à jour depuis XIVAPI' })).toBeEnabled()
  })

  it('shows collection counts and refreshes them alone', async () => {
    const store = stubStore()
    api().collections.status.mockResolvedValue({
      seeded: true,
      counts: { ...(await api().collections.pending()), mount: 3, minion: 5, orchestrion: 7 },
      generatedAt: null,
      gameVersion: null
    })
    const user = userEvent.setup()
    await renderView()

    expect(await screen.findByText('3 montures · 5 mascottes · 7 orchestrions')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Mettre à jour les collections' }))
    await waitFor(() => expect(store.refreshCollectionPending).toHaveBeenCalled())
    expect(api().catalog.refresh).not.toHaveBeenCalled()
  })
})

describe('DifficultySection', () => {
  it('shows stats and kind weights, and recalculates', async () => {
    const store = stubStore()
    api().difficulty.stats.mockResolvedValue({
      total: 4,
      byLevel: { very_easy: 1, easy: 1, medium: 1, hard: 1, very_hard: 0, extreme: 0 },
      averageScore: 42,
      hardest: { id: 9, name: 'Ultime', score: 99 },
      easiest: null
    })
    api().difficulty.weights.mockResolvedValue({ kind: { 0: 1, 1: 1.5, 99: 2 }, category: {}, patch: {} })
    const user = userEvent.setup()
    await renderView()
    const s = within(section('Difficulté'))

    expect(await s.findByText('42')).toBeInTheDocument()
    expect(s.getByText('Ultime')).toBeInTheDocument()
    expect(s.getByText('Combats')).toBeInTheDocument()
    expect(s.queryByText('Non classé')).not.toBeInTheDocument()

    await user.click(s.getByRole('button', { name: 'Recalculer les scores' }))
    await waitFor(() => expect(store.init).toHaveBeenCalled())
    expect(api().difficulty.recalculate).toHaveBeenCalled()
  })
})

describe('BackupSection', () => {
  it('shows the mirror file and opens its folder', async () => {
    stubStore()
    const user = userEvent.setup()
    await renderView()
    const s = within(section('Sauvegarde automatique dans « Mes Documents »'))

    expect(await s.findByText('C:/Docs/backup.json')).toBeInTheDocument()
    expect(s.getByText('✓ Actif & à jour')).toBeInTheDocument()
    expect(s.getByText(/\(2 ko\)/)).toBeInTheDocument()
    await user.click(s.getByRole('button', { name: /Ouvrir le dossier/ }))
    expect(api().data.openDocumentsFolder).toHaveBeenCalled()
  })

  it('toggles the documents backup and reloads its info', async () => {
    stubStore()
    const user = userEvent.setup()
    await renderView()
    await screen.findByText('C:/Docs/backup.json')
    const calls = api().data.autoBackupInfo.mock.calls.length

    await user.click(within(section('Sauvegarde automatique dans « Mes Documents »')).getByRole('checkbox'))

    expect(api().settings.update).toHaveBeenCalledWith({ autoBackupDocuments: false })
    await waitFor(() => expect(api().data.autoBackupInfo.mock.calls.length).toBeGreaterThan(calls))
  })

  it('reports export success and failure, and ignores a cancel', async () => {
    stubStore()
    const user = userEvent.setup()
    await renderView()

    await user.click(screen.getByRole('button', { name: 'Exporter…' }))
    expect(await screen.findByText('Exporté : C:/b.json')).toBeInTheDocument()

    api().data.export.mockResolvedValueOnce({ ok: false, error: 'Disque plein' })
    await user.click(screen.getByRole('button', { name: 'Exporter…' }))
    expect(await screen.findByText('Disque plein')).toHaveClass('text-red-400')

    api().data.export.mockResolvedValueOnce({ ok: false, canceled: true })
    await user.click(screen.getByRole('button', { name: 'Exporter…' }))
    await waitFor(() => expect(screen.queryByText('Disque plein')).not.toBeInTheDocument())
  })

  it('reloads everything after an import, and reports a failed one', async () => {
    const store = stubStore()
    const user = userEvent.setup()
    await renderView()
    const logCalls = api().lodestone.syncLog.mock.calls.length

    await user.click(screen.getByRole('button', { name: 'Importer…' }))
    expect(await screen.findByText('Sauvegarde importée. Données rechargées.')).toBeInTheDocument()
    expect(store.init).toHaveBeenCalled()
    await waitFor(() => expect(api().lodestone.syncLog.mock.calls.length).toBeGreaterThan(logCalls))

    api().data.import.mockResolvedValueOnce({ ok: false })
    await user.click(screen.getByRole('button', { name: 'Importer…' }))
    expect(await screen.findByText('Échec de l’import.')).toBeInTheDocument()
  })
})

describe('UpdatesSection', () => {
  it('shows the version and checks for updates', async () => {
    stubStore()
    const user = userEvent.setup()
    await renderView()

    expect(await screen.findByText('v1.0.1')).toBeInTheDocument()
    expect(screen.getByText('Aucune recherche effectuée.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Rechercher des mises à jour' }))
    expect(await screen.findByText('✓ Vous utilisez la version la plus récente.')).toBeInTheDocument()
  })

  it('follows pushed statuses and installs a downloaded update', async () => {
    stubStore()
    let push: (s: unknown) => void = () => {}
    api().updater.onStatusChange.mockImplementation(((cb: (s: unknown) => void) => {
      push = cb
      return () => {}
    }) as never)
    const user = userEvent.setup()
    await renderView()

    const { act } = await import('@testing-library/react')
    act(() => push({ state: 'downloading', version: '2.0.0', progress: { percent: 50 } }))
    expect(screen.getByText('Téléchargement en cours (50%)…')).toBeInTheDocument()
    act(() => push({ state: 'available', version: '2.0.0' }))
    expect(screen.getByText('Une mise à jour (v2.0.0) est disponible !')).toBeInTheDocument()
    act(() => push({ state: 'error', message: 'réseau' }))
    expect(screen.getByText('Erreur : réseau')).toBeInTheDocument()
    act(() => push({ state: 'checking' }))
    expect(screen.getByText('Recherche de mise à jour en cours…')).toBeInTheDocument()
    act(() => push({ state: 'downloaded', version: '2.0.0' }))
    await user.click(screen.getByRole('button', { name: 'Redémarrer et installer' }))
    expect(api().updater.install).toHaveBeenCalled()
  })
})
