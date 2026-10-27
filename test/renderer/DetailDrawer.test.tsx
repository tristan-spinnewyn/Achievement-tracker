import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import DetailDrawer from '../../src/renderer/src/components/DetailDrawer'
import { useStore } from '../../src/renderer/src/store/useStore'
import { api, makeRow } from './api'

function setup(row = makeRow({ id: 7, iconPath: '/i/7.png', note: 'Vieille note', tags: ['raid'] }), over = {}) {
  const actions = {
    select: vi.fn(),
    toggleCompletion: vi.fn(),
    setPriority: vi.fn(),
    setFocus: vi.fn(),
    setNote: vi.fn(),
    setTags: vi.fn(),
    setDeadline: vi.fn(),
    addRecurring: vi.fn()
  }
  api().achievements.get.mockResolvedValue(row)
  useStore.setState({ selectedId: 7, rows: [], recurring: [], ...actions, ...over } as never)
  return { row, ...actions }
}

describe('DetailDrawer', () => {
  it('renders nothing without a selection', () => {
    useStore.setState({ selectedId: null })
    const { container } = render(<DetailDrawer />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows a loader, then the achievement details', async () => {
    setup()
    render(<DetailDrawer />)
    expect(screen.getByText('Chargement…')).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: 'Premier pas' })).toBeInTheDocument()
    expect(screen.getByText('Combats · Donjons')).toBeInTheDocument()
    expect(screen.getByText('Non obtenu')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Note personnelle…')).toHaveValue('Vieille note')
    expect(screen.getByRole('link', { name: /Voir en ligne/ })).toHaveAttribute('href')
  })

  it('locks an achievement obtained on the Lodestone', async () => {
    setup(makeRow({ id: 7, completed: true, source: 'lodestone', completedDate: '2026-01-02' }))
    render(<DetailDrawer />)
    expect(await screen.findByText('Obtenu le 2026-01-02')).toBeInTheDocument()
    expect(screen.getByText('(Lodestone — verrouillé)')).toBeInTheDocument()
    expect(screen.getByRole('checkbox')).toBeDisabled()
  })

  it('edits completion, priority, focus, deadline and note', async () => {
    const a = setup()
    const user = userEvent.setup()
    render(<DetailDrawer />)
    await screen.findByRole('heading', { name: 'Premier pas' })

    await user.click(screen.getByRole('checkbox'))
    expect(a.toggleCompletion).toHaveBeenCalledWith(a.row)
    await user.click(screen.getByRole('button', { name: 'Haute' }))
    expect(a.setPriority).toHaveBeenCalledWith(7, 3)
    await user.click(screen.getByRole('button', { name: '☆ Ajouter au focus' }))
    expect(a.setFocus).toHaveBeenCalledWith(7, true)

    const date = screen.getByLabelText('Échéance')
    fireEvent.change(date, { target: { value: '2026-12-24' } })
    expect(a.setDeadline).toHaveBeenCalledWith(7, '2026-12-24')

    const note = screen.getByPlaceholderText('Note personnelle…')
    await user.clear(note)
    await user.type(note, 'Nouvelle')
    await user.tab()
    expect(a.setNote).toHaveBeenCalledWith(7, 'Nouvelle')
  })

  it('adds the achievement to each recurring checklist', async () => {
    const a = setup()
    const user = userEvent.setup()
    render(<DetailDrawer />)
    await screen.findByRole('heading', { name: 'Premier pas' })

    await user.click(screen.getByRole('button', { name: '+ Quotidien' }))
    await user.click(screen.getByRole('button', { name: '+ Ravito' }))
    await user.click(screen.getByRole('button', { name: '+ Hebdo' }))
    expect(a.addRecurring.mock.calls.map((c) => c[0].type)).toEqual(['daily', 'daily22', 'weekly'])
    expect(a.addRecurring).toHaveBeenCalledWith({ name: 'Premier pas', type: 'daily', achievementId: 7, iconPath: '/i/7.png' })
  })

  it('says when the achievement is already in the checklist', async () => {
    setup(undefined, { recurring: [{ id: 'r', achievementId: 7 }] })
    render(<DetailDrawer />)
    expect(await screen.findByText('Déjà dans la checklist (voir Quotidiens).')).toBeInTheDocument()
  })

  it('adds new tags on Enter, ignores duplicates and blanks, and removes tags', async () => {
    const a = setup()
    const user = userEvent.setup()
    render(<DetailDrawer />)
    await screen.findByText('raid')
    const input = screen.getByPlaceholderText('Ajouter un tag puis Entrée')

    await user.type(input, ' farm {Enter}')
    expect(a.setTags).toHaveBeenCalledWith(7, ['raid', 'farm'])
    expect(input).toHaveValue('')
    await user.type(input, 'raid{Enter}')
    await user.type(input, '   {Enter}')
    expect(a.setTags).toHaveBeenCalledTimes(1)

    await user.click(screen.getByText('raid').querySelector('button') as HTMLElement)
    expect(a.setTags).toHaveBeenLastCalledWith(7, [])
  })

  it('shows "Aucun tag" and the focus state', async () => {
    setup(makeRow({ id: 7, inFocus: true, source: 'manual', completed: true }))
    render(<DetailDrawer />)
    expect(await screen.findByText('Aucun tag')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '★ Dans le focus' })).toBeInTheDocument()
    expect(screen.getByText('(manuel)')).toBeInTheDocument()
    expect(screen.getByText('Obtenu')).toBeInTheDocument()
  })

  it('closes with the cross or the backdrop', async () => {
    const a = setup()
    const user = userEvent.setup()
    const { container } = render(<DetailDrawer />)
    await screen.findByRole('heading', { name: 'Premier pas' })

    await user.click(screen.getAllByRole('button', { name: '✕' })[0])
    await user.click(container.firstChild as HTMLElement)
    expect(a.select).toHaveBeenCalledTimes(2)
    expect(a.select).toHaveBeenCalledWith(null)
  })

  it('clears the row when the selection is removed and hides a broken icon', async () => {
    setup()
    const { container } = render(<DetailDrawer />)
    await screen.findByRole('heading', { name: 'Premier pas' })
    const img = container.querySelector('img') as HTMLImageElement
    img.dispatchEvent(new Event('error'))
    expect(img.style.visibility).toBe('hidden')

    const { act } = await import('@testing-library/react')
    act(() => useStore.setState({ selectedId: null }))
    expect(container).toBeEmptyDOMElement()
  })
})
