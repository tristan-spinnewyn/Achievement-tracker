import { describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { api, makeSettings } from './api'

// Views and overlays are tested on their own: stub them to test App's own logic.
const stub = (name: string) => ({ default: () => <div data-testid={name} /> })
vi.mock('../../src/renderer/src/views/AchievementsView', () => stub('achievements'))
vi.mock('../../src/renderer/src/views/DashboardView', () => stub('dashboard'))
vi.mock('../../src/renderer/src/views/FocusView', () => stub('focus'))
vi.mock('../../src/renderer/src/views/SuggestionsView', () => stub('suggestions'))
vi.mock('../../src/renderer/src/views/SettingsView', () => stub('settings'))
vi.mock('../../src/renderer/src/views/RecurringView', () => stub('recurring'))
vi.mock('../../src/renderer/src/views/NewPatchView', () => stub('newpatch'))
vi.mock('../../src/renderer/src/views/CollectionsView', () => ({
  default: ({ type }: { type: string }) => <div data-testid={`collection-${type}`} />
}))
vi.mock('../../src/renderer/src/components/Sidebar', () => stub('sidebar'))
vi.mock('../../src/renderer/src/components/DetailDrawer', () => stub('drawer'))
vi.mock('../../src/renderer/src/components/LaunchAlert', () => stub('alert'))
vi.mock('../../src/renderer/src/components/UpdateBanner', () => stub('banner'))

const { default: App } = await import('../../src/renderer/src/App')
const { useStore } = await import('../../src/renderer/src/store/useStore')

function setup(over: Record<string, unknown> = {}) {
  const actions = {
    init: vi.fn(async () => {}),
    refreshCollectionPending: vi.fn(async () => {}),
    select: vi.fn(),
    setView: vi.fn((view) => useStore.setState({ view })),
    error: null,
    view: 'achievements'
  }
  useStore.setState({ ...actions, ...over } as never)
  return actions
}

const key = (k: string, opts: KeyboardEventInit = {}) => fireEvent.keyDown(window, { key: k, ...opts })

describe('App', () => {
  it('initialises the store and renders the current view with its overlays', async () => {
    const a = setup()
    render(<App />)
    expect(a.init).toHaveBeenCalled()
    expect(screen.getByTestId('achievements')).toBeInTheDocument()
    for (const id of ['sidebar', 'drawer', 'alert', 'banner']) expect(screen.getByTestId(id)).toBeInTheDocument()
    await act(async () => {})
  })

  it.each([
    ['dashboard', 'dashboard'],
    ['newpatch', 'newpatch'],
    ['focus', 'focus'],
    ['recurring', 'recurring'],
    ['suggestions', 'suggestions'],
    ['settings', 'settings'],
    ['mounts', 'collection-mount'],
    ['minions', 'collection-minion'],
    ['orchestrion', 'collection-orchestrion'],
    ['emotes', 'collection-emote'],
    ['faceaccessories', 'collection-faceaccessory'],
    ['fashion', 'collection-fashion'],
    ['hairstyles', 'collection-hairstyle'],
    ['bardings', 'collection-barding'],
    ['titles', 'collection-title'],
    ['bluemagic', 'collection-spell'],
    ['beasts', 'collection-beast'],
    ['tripletriad', 'collection-tripletriad']
  ])('routes the "%s" view', async (view, testId) => {
    setup({ view })
    render(<App />)
    expect(screen.getByTestId(testId)).toBeInTheDocument()
    await act(async () => {})
  })

  it('shows store errors', async () => {
    setup({ error: 'Catalogue illisible' })
    render(<App />)
    expect(screen.getByText('Erreur : Catalogue illisible')).toBeInTheDocument()
    await act(async () => {})
  })

  it('follows navigation requests from the main process', async () => {
    const a = setup()
    let navigate: (v: string) => void = () => {}
    api().onNavigate.mockImplementation(((cb: (v: string) => void) => {
      navigate = cb
      return () => {}
    }) as never)
    render(<App />)
    act(() => navigate('settings'))
    expect(a.setView).toHaveBeenCalledWith('settings')
    expect(screen.getByTestId('settings')).toBeInTheDocument()
    await act(async () => {})
  })

  it('handles keyboard shortcuts', async () => {
    const a = setup()
    render(
      <>
        <input id="search-input" />
        <App />
      </>
    )
    await act(async () => {})

    key('k', { ctrlKey: true })
    expect(document.activeElement?.id).toBe('search-input')
    key('2', { ctrlKey: true })
    expect(a.setView).toHaveBeenLastCalledWith('achievements')
    key('6', { metaKey: true })
    expect(a.setView).toHaveBeenLastCalledWith('settings')
    a.setView.mockClear()
    key('9', { ctrlKey: true })
    expect(a.setView).not.toHaveBeenCalled()
    key('Escape')
    expect(a.select).toHaveBeenCalledWith(null)
    key('z', { ctrlKey: true })
    expect(api().history.undo).toHaveBeenCalledTimes(1)
    key('y', { ctrlKey: true })
    key('z', { ctrlKey: true, shiftKey: true })
    expect(api().history.redo).toHaveBeenCalledTimes(2)
  })

  it('ignores the search shortcut when no search bar is shown', async () => {
    setup({ view: 'dashboard' })
    render(<App />)
    await act(async () => {})
    key('f', { ctrlKey: true })
    expect(document.activeElement).toBe(document.body)
  })

  it('does not auto-sync unless enabled with a character', async () => {
    setup()
    api().settings.get.mockResolvedValue(makeSettings({ autoSync: true, lodestoneCharacterId: null }))
    render(<App />)
    await act(async () => {})
    expect(api().lodestone.sync).not.toHaveBeenCalled()
  })

  it('auto-syncs achievements and collections at startup, then reloads', async () => {
    const a = setup()
    api().settings.get.mockResolvedValue(makeSettings({ autoSync: true, lodestoneCharacterId: '42' }))
    let finish: () => void = () => {}
    api().lodestone.sync.mockReturnValue(new Promise((r) => (finish = () => r({} as never))) as never)
    render(<App />)

    expect(await screen.findByText(/Synchronisation automatique/)).toBeInTheDocument()
    await act(async () => finish())
    await waitFor(() => expect(screen.queryByText(/Synchronisation automatique/)).not.toBeInTheDocument())
    expect(api().collections.sync).toHaveBeenCalledTimes(4)
    expect(a.refreshCollectionPending).toHaveBeenCalled()
    expect(a.init).toHaveBeenCalledTimes(2)
  })

  it('keeps going when the auto-sync fails', async () => {
    const a = setup()
    api().settings.get.mockResolvedValue(makeSettings({ autoSync: true, lodestoneCharacterId: '42' }))
    api().lodestone.sync.mockRejectedValue(new Error('hors ligne'))
    render(<App />)
    await waitFor(() => expect(a.refreshCollectionPending).toHaveBeenCalled())
    expect(screen.queryByText(/Synchronisation automatique/)).not.toBeInTheDocument()
  })

  it('stops the auto-sync follow-up after unmount', async () => {
    const a = setup()
    api().settings.get.mockResolvedValue(makeSettings({ autoSync: true, lodestoneCharacterId: '42' }))
    let finish: () => void = () => {}
    api().lodestone.sync.mockReturnValue(new Promise((r) => (finish = () => r({} as never))) as never)
    const { unmount } = render(<App />)
    await screen.findByText(/Synchronisation automatique/)
    unmount()
    await act(async () => finish())
    expect(a.refreshCollectionPending).not.toHaveBeenCalled()
  })
})
