import { describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { virtualMock } from './virtual'
import { api, makeCollectionRow } from './api'

vi.mock('@tanstack/react-virtual', () => virtualMock)

const { default: CollectionsView } = await import('../../src/renderer/src/views/CollectionsView')
const { useStore } = await import('../../src/renderer/src/store/useStore')

function stubStore() {
  const refreshCollectionPending = vi.fn(async () => {})
  useStore.setState({ refreshCollectionPending } as never)
  return { refreshCollectionPending }
}

const manual = makeCollectionRow({ id: 1, name: 'Chocobo', owned: true, source: 'manual', patch: '2.0' })
const locked = makeCollectionRow({ id: 2, name: 'Licorne', owned: true, source: 'lodestone', iconPath: 'ui/i.png' })
const missing = makeCollectionRow({
  id: 3,
  name: 'Griffon',
  description: '',
  sources: ['Boutique', 'Événement'],
  categoryId: 5,
  categoryName: 'Rares'
})

describe('CollectionsView', () => {
  it('lists items with progress, badges and filters', async () => {
    stubStore()
    api().collections.list.mockResolvedValue([manual, locked, missing])
    api().collections.progress.mockResolvedValue({ type: 'mount', total: 4, owned: 2 })
    api().collections.categories.mockResolvedValue([{ type: 'mount', id: 5, name: 'Rares', order: 1 }] as never)
    api().collections.patches.mockResolvedValue(['7.0', '2.0'])
    render(<CollectionsView type="mount" />)

    expect(await screen.findByText('Chocobo')).toBeInTheDocument()
    expect(screen.getByText('2 / 4 obtenu(s)')).toBeInTheDocument()
    expect(screen.getByText('50%')).toBeInTheDocument()
    expect(screen.getByText('3 affiché(s)')).toBeInTheDocument()
    expect(screen.getByText('manuel')).toBeInTheDocument()
    expect(screen.getByText('✓ vérifié')).toBeInTheDocument()
    expect(screen.getByText('Boutique · Événement')).toBeInTheDocument()
    expect(await screen.findByRole('option', { name: 'Rares' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: '7.0' })).toBeInTheDocument()
  })

  it('passes status, category, patch and debounced search to the list query', async () => {
    stubStore()
    api().collections.categories.mockResolvedValue([{ type: 'mount', id: 5, name: 'Rares', order: 1 }] as never)
    api().collections.patches.mockResolvedValue(['7.0'])
    const user = userEvent.setup()
    render(<CollectionsView type="mount" />)
    await screen.findByRole('option', { name: 'Rares' })
    const [status, category, patch] = screen.getAllByRole('combobox')

    await user.selectOptions(status, 'missing')
    await user.selectOptions(category, '5')
    await user.selectOptions(patch, '7.0')
    await user.type(screen.getByPlaceholderText('Rechercher…'), 'cho')

    await waitFor(() =>
      expect(api().collections.list).toHaveBeenLastCalledWith({
        type: 'mount',
        search: 'cho',
        status: 'missing',
        categoryId: 5,
        patch: '7.0'
      })
    )
  })

  it('shows empty and loading states', async () => {
    stubStore()
    let resolve: (v: never[]) => void = () => {}
    api().collections.list.mockReturnValueOnce(new Promise((r) => (resolve = r)) as never)
    render(<CollectionsView type="orchestrion" />)
    expect(screen.getByText('Chargement…')).toBeInTheDocument()
    await act(async () => resolve([]))
    expect(await screen.findByText('Aucun résultat.')).toBeInTheDocument()
    // Orchestrion is not on the Lodestone: no sync button.
    expect(screen.queryByRole('button', { name: /Synchroniser/ })).not.toBeInTheDocument()
  })

  it('toggles an item, updates progress and refreshes sidebar badges', async () => {
    const store = stubStore()
    api().collections.list.mockResolvedValue([missing])
    api().collections.progress.mockResolvedValue({ type: 'mount', total: 4, owned: 2 })
    const user = userEvent.setup()
    render(<CollectionsView type="mount" />)
    await screen.findByText('Griffon')

    await user.click(screen.getByRole('checkbox'))

    expect(api().collections.setOwned).toHaveBeenCalledWith('mount', 3, true)
    expect(await screen.findByText('3 / 4 obtenu(s)')).toBeInTheDocument()
    expect(screen.getByText('manuel')).toBeInTheDocument()
    expect(store.refreshCollectionPending).toHaveBeenCalled()
  })

  it('drops a toggled item that no longer matches the status filter', async () => {
    stubStore()
    api().collections.list.mockResolvedValue([manual])
    const user = userEvent.setup()
    render(<CollectionsView type="mount" />)
    await screen.findByText('Chocobo')
    await user.selectOptions(screen.getAllByRole('combobox')[0], 'owned')
    await screen.findByText('Chocobo')

    await user.click(screen.getByRole('checkbox'))

    await waitFor(() => expect(screen.queryByText('Chocobo')).not.toBeInTheDocument())
    expect(api().collections.setOwned).toHaveBeenCalledWith('mount', 1, false)
  })

  it('never unchecks an item verified on the Lodestone', async () => {
    stubStore()
    api().collections.list.mockResolvedValue([locked])
    render(<CollectionsView type="mount" />)
    await screen.findByText('Licorne')
    expect(screen.getByRole('checkbox')).toBeDisabled()
  })

  it('syncs from the Lodestone and reloads on success', async () => {
    const store = stubStore()
    const user = userEvent.setup()
    render(<CollectionsView type="mount" />)
    await screen.findByText('Aucun résultat.')
    const listCalls = api().collections.list.mock.calls.length

    await user.click(screen.getByRole('button', { name: '⟳ Synchroniser (Lodestone)' }))

    expect(await screen.findByText('Collection OK')).toHaveClass('text-emerald-400')
    expect(api().collections.list.mock.calls.length).toBeGreaterThan(listCalls)
    expect(store.refreshCollectionPending).toHaveBeenCalled()
  })

  it('reports a failed or crashing sync', async () => {
    stubStore()
    api().collections.sync
      .mockResolvedValueOnce({ ok: false, type: 'mount', matched: 0, unmatched: 0, newly: 0, message: 'Privé', at: '' })
      .mockRejectedValueOnce(new Error('boom'))
    const user = userEvent.setup()
    render(<CollectionsView type="mount" />)
    const button = await screen.findByRole('button', { name: '⟳ Synchroniser (Lodestone)' })

    await user.click(button)
    expect(await screen.findByText('Privé')).toHaveClass('text-red-400')
    await user.click(button)
    expect(await screen.findByText('Error: boom')).toBeInTheDocument()
  })

  it('opens the detail panel and toggles from it', async () => {
    stubStore()
    api().collections.list.mockResolvedValue([missing, locked])
    const user = userEvent.setup()
    render(<CollectionsView type="mount" />)

    await user.click(await screen.findByText('Griffon'))
    const panel = within(screen.getByRole('complementary'))
    expect(panel.getByText('Rares')).toBeInTheDocument()
    expect(panel.getByText('Boutique')).toBeInTheDocument()
    expect(panel.getByText('Non obtenu')).toBeInTheDocument()
    expect(panel.getByRole('link', { name: /Voir en ligne/ })).toHaveAttribute('href')

    await user.click(panel.getByRole('button', { name: 'Marquer comme obtenu' }))
    expect(await panel.findByText('✓ Obtenu (manuel)')).toBeInTheDocument()
    expect(panel.getByRole('button', { name: 'Marquer comme non obtenu' })).toBeInTheDocument()

    await user.click(screen.getByText('Licorne'))
    expect(panel.getByText('✓ Vérifié (Lodestone)')).toBeInTheDocument()
    expect(panel.getByRole('button', { name: 'Verrouillé (vérifié Lodestone)' })).toBeDisabled()

    await user.click(panel.getByTitle('Fermer'))
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument()
  })

  it('describes acquisition from the description, or says it is undocumented', async () => {
    stubStore()
    const bare = makeCollectionRow({ id: 4, name: 'Mystère', description: '' })
    api().collections.list.mockResolvedValue([manual, bare])
    const user = userEvent.setup()
    render(<CollectionsView type="mount" />)

    await user.click(await screen.findByText('Chocobo'))
    expect(within(screen.getByRole('complementary')).getByText('Quête principale')).toBeInTheDocument()
    await user.click(screen.getByText('Mystère'))
    expect(screen.getByText('Non documenté.')).toBeInTheDocument()
  })

  it('resets filters and selection when the collection type changes', async () => {
    stubStore()
    api().collections.list.mockResolvedValue([manual])
    const user = userEvent.setup()
    const { rerender } = render(<CollectionsView type="mount" />)
    await user.click(await screen.findByText('Chocobo'))
    await user.type(screen.getByPlaceholderText('Rechercher…'), 'x')

    rerender(<CollectionsView type="minion" />)

    expect(screen.getByRole('heading', { name: 'Mascottes' })).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Rechercher…')).toHaveValue('')
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument()
  })

  it('hides a broken icon', async () => {
    stubStore()
    api().collections.list.mockResolvedValue([locked])
    const { container } = render(<CollectionsView type="mount" />)
    await screen.findByText('Licorne')
    const img = container.querySelector('img') as HTMLImageElement
    img.dispatchEvent(new Event('error'))
    expect(img.style.visibility).toBe('hidden')
  })
})
