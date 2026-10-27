import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { virtualMock } from './virtual'
import { makeRow } from './api'

vi.mock('@tanstack/react-virtual', () => virtualMock)

const { default: AchievementsView } = await import('../../src/renderer/src/views/AchievementsView')
const { useStore, DEFAULT_FILTER } = await import('../../src/renderer/src/store/useStore')

function setup(over: Record<string, unknown> = {}) {
  const actions = {
    setFilter: vi.fn(),
    resetFilter: vi.fn(),
    toggleCompletion: vi.fn(),
    setPriority: vi.fn(),
    setFocus: vi.fn(),
    select: vi.fn()
  }
  useStore.setState({
    filter: { ...DEFAULT_FILTER },
    kinds: [
      { id: 1, name: 'Combats', order: 1 },
      { id: 2, name: 'Quêtes', order: 2 }
    ],
    categories: [
      { id: 10, kindId: 1, name: 'Donjons', order: 1 },
      { id: 20, kindId: 2, name: 'Scénario', order: 1 }
    ],
    rows: [],
    loading: false,
    difficulties: new Map(),
    ...actions,
    ...over
  } as never)
  return actions
}

describe('FilterBar', () => {
  it('forwards every filter change to the store', async () => {
    const a = setup()
    const user = userEvent.setup()
    render(<AchievementsView />)
    const [status, kind, , difficulty, sortBy, sortDir] = screen.getAllByRole('combobox')

    await user.type(screen.getByPlaceholderText('Rechercher… (AND, OR, NOT)'), 'a')
    expect(a.setFilter).toHaveBeenCalledWith({ search: 'a' })
    await user.selectOptions(status, 'todo')
    expect(a.setFilter).toHaveBeenCalledWith({ status: 'todo' })
    await user.selectOptions(kind, '2')
    expect(a.setFilter).toHaveBeenCalledWith({ kindId: 2, categoryId: null })
    await user.selectOptions(difficulty, 'hard')
    expect(a.setFilter).toHaveBeenCalledWith({ difficultyLevel: 'hard' })
    await user.type(screen.getByPlaceholderText('pts min'), '5')
    expect(a.setFilter).toHaveBeenCalledWith({ minPoints: 5 })
    await user.type(screen.getByPlaceholderText('pts max'), '9')
    expect(a.setFilter).toHaveBeenCalledWith({ maxPoints: 9 })
    await user.click(screen.getByLabelText('Obtenables'))
    expect(a.setFilter).toHaveBeenCalledWith({ obtainableOnly: true })
    await user.click(screen.getByLabelText('Avec note'))
    expect(a.setFilter).toHaveBeenCalledWith({ hasNote: true })
    await user.selectOptions(sortBy, 'points')
    expect(a.setFilter).toHaveBeenCalledWith({ sortBy: 'points' })
    await user.selectOptions(sortDir, 'asc')
    expect(a.setFilter).toHaveBeenCalledWith({ sortDir: 'asc' })
    await user.click(screen.getByRole('button', { name: 'Réinitialiser' }))
    expect(a.resetFilter).toHaveBeenCalled()
  })

  it('only offers the categories of the selected kind and clears empty values', async () => {
    const a = setup({ filter: { ...DEFAULT_FILTER, kindId: 1, categoryId: 10, minPoints: 5, maxPoints: 9 } })
    const user = userEvent.setup()
    render(<AchievementsView />)
    const category = screen.getAllByRole('combobox')[2]

    expect(screen.getByRole('option', { name: 'Donjons' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'Scénario' })).not.toBeInTheDocument()

    await user.selectOptions(category, '')
    expect(a.setFilter).toHaveBeenCalledWith({ categoryId: null })
    await user.selectOptions(screen.getAllByRole('combobox')[1], '')
    expect(a.setFilter).toHaveBeenCalledWith({ kindId: null, categoryId: null })
    await user.clear(screen.getByPlaceholderText('pts min'))
    expect(a.setFilter).toHaveBeenCalledWith({ minPoints: null })
    await user.clear(screen.getByPlaceholderText('pts max'))
    expect(a.setFilter).toHaveBeenCalledWith({ maxPoints: null })
  })

  it('clears the difficulty filter with null, not an empty level', async () => {
    const a = setup({ filter: { ...DEFAULT_FILTER, difficultyLevel: 'hard' } })
    const user = userEvent.setup()
    render(<AchievementsView />)
    await user.selectOptions(screen.getAllByRole('combobox')[3], '')
    expect(a.setFilter).toHaveBeenCalledWith({ difficultyLevel: null })
  })
})

describe('AchievementsTable', () => {
  const rows = [
    makeRow({ id: 1, name: 'Manuel', completed: true, source: 'manual', completedDate: '2026-10-01', priority: 2 }),
    makeRow({ id: 2, name: 'Lodestone', completed: true, source: 'lodestone', inFocus: true, iconPath: '/i/1.png' }),
    makeRow({ id: 3, name: 'À faire', patch: null })
  ]

  it('renders rows with count, loading state and row details', () => {
    setup({ rows, loading: true })
    render(<AchievementsView />)
    expect(screen.getByText('3 résultat(s)')).toBeInTheDocument()
    expect(screen.getByText('Chargement…')).toBeInTheDocument()
    expect(screen.getByText('2026-10-01')).toBeInTheDocument()
    expect(screen.getByText('M')).toBeInTheDocument()
    expect(screen.getByTitle('Retirer du focus')).toHaveTextContent('★')
    expect(screen.getAllByRole('checkbox')[3]).toBeDisabled()
  })

  it('toggles completion, priority, focus and opens the drawer', async () => {
    const a = setup({ rows })
    const user = userEvent.setup()
    render(<AchievementsView />)

    await user.click(screen.getAllByRole('checkbox')[4])
    expect(a.toggleCompletion).toHaveBeenCalledWith(rows[2])
    await user.click(screen.getAllByTitle('Cliquer pour changer la priorité')[0])
    expect(a.setPriority).toHaveBeenCalledWith(1, 3)
    await user.click(screen.getByTitle('Retirer du focus'))
    expect(a.setFocus).toHaveBeenCalledWith(2, false)
    await user.click(screen.getAllByTitle('Ajouter au focus')[0])
    expect(a.setFocus).toHaveBeenCalledWith(1, true)
    await user.click(screen.getByRole('button', { name: /À faire/ }))
    expect(a.select).toHaveBeenCalledWith(3)
  })

  it('sorts by clicking headers and flips the direction on the active column', async () => {
    const a = setup({ filter: { ...DEFAULT_FILTER, sortBy: 'points', sortDir: 'asc' } })
    const user = userEvent.setup()
    render(<AchievementsView />)

    expect(screen.getByRole('button', { name: 'Points↑' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Points↑' }))
    expect(a.setFilter).toHaveBeenCalledWith({ sortDir: 'desc' })
    await user.click(screen.getByRole('button', { name: 'Patch' }))
    expect(a.setFilter).toHaveBeenCalledWith({ sortBy: 'patch', sortDir: 'desc' })
    await user.click(screen.getByRole('button', { name: 'Haut fait' }))
    expect(a.setFilter).toHaveBeenCalledWith({ sortBy: 'name', sortDir: 'asc' })
    expect(screen.getByRole('button', { name: 'Difficulté' })).toBeDisabled()
  })

  it('hides a broken icon', () => {
    setup({ rows })
    const { container } = render(<AchievementsView />)
    const img = container.querySelector('img') as HTMLImageElement
    img.dispatchEvent(new Event('error'))
    expect(img.style.visibility).toBe('hidden')
  })
})
