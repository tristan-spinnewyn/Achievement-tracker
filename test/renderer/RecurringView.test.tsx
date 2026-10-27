import { describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { RecurringTask } from '@shared/types'
import RecurringView from '../../src/renderer/src/views/RecurringView'
import { useStore } from '../../src/renderer/src/store/useStore'
import { api, makeRow } from './api'

const task = (over: Partial<RecurringTask>): RecurringTask => ({
  id: 't',
  name: 'Tâche',
  type: 'daily',
  achievementId: null,
  iconPath: null,
  lastCompletedAt: null,
  createdAt: '',
  ...over
})

function setup(recurring: RecurringTask[] = []) {
  const actions = {
    addRecurring: vi.fn(),
    deleteRecurring: vi.fn(),
    setRecurringDone: vi.fn(),
    select: vi.fn()
  }
  useStore.setState({ recurring, ...actions } as never)
  return actions
}

describe('RecurringView', () => {
  it('shows the three reset countdowns and empty lists', () => {
    setup()
    render(<RecurringView />)
    expect(screen.getByText('Reset quotidien dans')).toBeInTheDocument()
    expect(screen.getByText('Reset ravitaillement (22 h) dans')).toBeInTheDocument()
    expect(screen.getByText('Reset hebdo (mardi) dans')).toBeInTheDocument()
    expect(screen.getByText('Aucune tâche quotidienne.')).toBeInTheDocument()
    expect(screen.getByText('Aucune mission de ravitaillement.')).toBeInTheDocument()
    expect(screen.getByText('Aucune tâche hebdomadaire.')).toBeInTheDocument()
  })

  it('ticks the countdowns every second', () => {
    vi.useFakeTimers()
    try {
      setup()
      render(<RecurringView />)
      const before = screen.getAllByText(/\d\d:\d\d:\d\d|\dj/)[0].textContent
      act(() => vi.advanceTimersByTime(2000))
      expect(screen.getAllByText(/\d\d:\d\d:\d\d|\dj/)[0].textContent).not.toBe(before)
    } finally {
      vi.useRealTimers()
    }
  })

  it('groups tasks by period with pending counts, streaks and links', async () => {
    const a = setup([
      task({ id: 'd1', name: 'Roulette', streak: 3 }),
      task({ id: 'd2', name: 'Fait', lastCompletedAt: new Date().toISOString() }),
      task({ id: 'r', name: 'Ravito', type: 'daily22' }),
      task({ id: 'w', name: 'Lié', type: 'weekly', achievementId: 9, iconPath: '/i.png' })
    ])
    const user = userEvent.setup()
    render(<RecurringView />)

    expect(screen.getAllByText('(1 à faire)')).toHaveLength(3)
    expect(screen.getByTitle('Série : 3 périodes consécutives')).toHaveTextContent('🔥 3')
    expect(screen.getByText('Fait')).toHaveClass('line-through')
    expect(screen.getByTitle('Lié à un haut fait (disparaît une fois obtenu)')).toBeInTheDocument()

    await user.click(screen.getByTitle('Voir le haut fait'))
    expect(a.select).toHaveBeenCalledWith(9)
    await user.click(screen.getAllByRole('checkbox')[0])
    expect(a.setRecurringDone).toHaveBeenCalledWith('d1', true)
    await user.click(screen.getAllByRole('checkbox')[1])
    expect(a.setRecurringDone).toHaveBeenCalledWith('d2', false)
    await user.click(screen.getAllByTitle('Supprimer')[0])
    expect(a.deleteRecurring).toHaveBeenCalledWith('d1')
  })

  it('adds a free task with the chosen period, via button or Enter', async () => {
    const a = setup()
    const user = userEvent.setup()
    render(<RecurringView />)
    const input = screen.getByPlaceholderText(/Rechercher un haut fait/)

    await user.click(screen.getByRole('button', { name: 'Ajouter' }))
    expect(a.addRecurring).not.toHaveBeenCalled()

    await user.selectOptions(screen.getByRole('combobox'), 'weekly')
    await user.type(input, 'Ma tâche')
    await user.click(screen.getByRole('button', { name: 'Ajouter' }))
    expect(a.addRecurring).toHaveBeenCalledWith({ name: 'Ma tâche', type: 'weekly' })
    expect(input).toHaveValue('')

    await user.type(input, 'Autre{Enter}')
    expect(a.addRecurring).toHaveBeenLastCalledWith({ name: 'Autre', type: 'weekly' })
  })

  it('searches unobtained achievements to link a task', async () => {
    const a = setup()
    api().achievements.list.mockResolvedValue([makeRow({ id: 4, name: 'Chasseur', iconPath: '/c.png' })])
    const user = userEvent.setup()
    render(<RecurringView />)
    const input = screen.getByPlaceholderText(/Rechercher un haut fait/)

    await user.type(input, 'c')
    expect(api().achievements.list).not.toHaveBeenCalled()
    await user.type(input, 'h')

    await user.click(await screen.findByRole('button', { name: /Chasseur/ }))
    expect(api().achievements.list).toHaveBeenCalledWith({ search: 'ch', status: 'todo', limit: 8 })
    expect(a.addRecurring).toHaveBeenCalledWith({ name: 'Chasseur', type: 'daily', achievementId: 4, iconPath: '/c.png' })
    await waitFor(() => expect(screen.queryByRole('button', { name: /Chasseur/ })).not.toBeInTheDocument())
  })

  it('adds presets and disables those already added', async () => {
    const a = setup([task({ name: 'mini loto' })])
    const user = userEvent.setup()
    render(<RecurringView />)
    await user.click(screen.getByText('Ajouter un préréglage courant…'))

    expect(screen.getByRole('button', { name: /✓ Mini Loto/ })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: /Jumbo Loto/ }))
    expect(a.addRecurring).toHaveBeenCalledWith({ name: 'Jumbo Loto', type: 'weekly' })
    expect(screen.getByRole('button', { name: /Missions de ravitaillement/ })).toHaveAttribute('title', 'Ravitaillement (22 h)')
    expect(screen.getByRole('button', { name: /Roulette : Expert/ })).toHaveAttribute('title', 'Quotidien')
  })

  it('hides broken icons', async () => {
    setup([task({ iconPath: '/i.png' })])
    api().achievements.list.mockResolvedValue([makeRow({ id: 4, name: 'Chasseur', iconPath: '/c.png' })])
    const user = userEvent.setup()
    const { container } = render(<RecurringView />)
    await user.type(screen.getByPlaceholderText(/Rechercher un haut fait/), 'ch')
    await screen.findByRole('button', { name: /Chasseur/ })

    for (const img of container.querySelectorAll('img')) {
      img.dispatchEvent(new Event('error'))
      expect(img.style.visibility).toBe('hidden')
    }
  })
})
