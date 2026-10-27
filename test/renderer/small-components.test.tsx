import { describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { RecurringTask } from '@shared/types'
import { DifficultyBadge } from '../../src/renderer/src/components/DifficultyBadge'
import Sidebar from '../../src/renderer/src/components/Sidebar'
import LaunchAlert from '../../src/renderer/src/components/LaunchAlert'
import { useStore } from '../../src/renderer/src/store/useStore'

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

const zeroPending = {
  mount: 0, minion: 0, orchestrion: 0, emote: 0, fashion: 0, hairstyle: 0,
  barding: 0, title: 0, faceaccessory: 0, spell: 0, tripletriad: 0, beast: 0
}

describe('DifficultyBadge', () => {
  it('shows a dash when the difficulty is unknown', () => {
    useStore.setState({ difficulties: new Map() })
    render(<DifficultyBadge achievementId={1} />)
    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('shows stars, level and score', () => {
    useStore.setState({
      difficulties: new Map([[1, { score: 55, level: 'hard', levelName: 'Difficile', color: '#f97316', stars: '★★★★' }]])
    })
    render(<DifficultyBadge achievementId={1} />)
    expect(screen.getByText('★★★★')).toBeInTheDocument()
    expect(screen.getByTitle('Difficulté: Difficile (Score: 55)')).toBeInTheDocument()
  })
})

describe('Sidebar', () => {
  it('highlights the current view, shows badges and navigates', async () => {
    const setView = vi.fn()
    useStore.setState({
      view: 'focus',
      setView,
      catalogStatus: { seeded: true, achievementCount: 123, gameVersion: null, generatedAt: null },
      recurring: [task({ id: 'a' }), task({ id: 'b', lastCompletedAt: new Date().toISOString() })],
      newPatchPending: 4,
      collectionPending: { ...zeroPending, mount: 2 }
    })
    const user = userEvent.setup()
    render(<Sidebar />)

    expect(screen.getByRole('button', { name: /Focus/ })).toHaveClass('bg-slate-800')
    expect(screen.getByRole('button', { name: /Quotidiens/ })).toHaveTextContent('1')
    expect(screen.getByRole('button', { name: /Nouveautés/ })).toHaveTextContent('4')
    expect(screen.getByRole('button', { name: /Montures/ })).toHaveTextContent('2')
    expect(screen.getByText('123 hauts faits')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Paramètres/ }))
    expect(setView).toHaveBeenCalledWith('settings')
  })

  it('hides the catalog footer before the status is loaded', () => {
    useStore.setState({ catalogStatus: null, recurring: [], newPatchPending: 0, collectionPending: zeroPending })
    render(<Sidebar />)
    expect(screen.queryByText(/hauts faits$/)).not.toBeInTheDocument()
  })

  it('lets the navigation scroll when the window is too short for every item', () => {
    useStore.setState({ catalogStatus: null, recurring: [], newPatchPending: 0, collectionPending: zeroPending })
    render(<Sidebar />)
    // A flex child only scrolls if it can shrink below its content height (min-h-0).
    expect(screen.getByRole('navigation')).toHaveClass('min-h-0', 'overflow-y-auto')
  })
})

describe('LaunchAlert', () => {
  it('stays hidden when there is nothing to do', () => {
    useStore.setState({ recurring: [] })
    const { container } = render(<LaunchAlert />)
    expect(container).toBeEmptyDOMElement()
  })

  it('lists pending tasks by period and lets the user check them', async () => {
    const setRecurringDone = vi.fn()
    useStore.setState({
      recurring: [
        task({ id: 'd', name: 'Roulette', type: 'daily' }),
        task({ id: 'r', name: 'Ravitaillement', type: 'daily22' }),
        task({ id: 'w', name: 'Défis hebdo', type: 'weekly' })
      ],
      setRecurringDone
    })
    const user = userEvent.setup()
    render(<LaunchAlert />)

    expect(screen.getByText(/Il te reste 3 tâche/)).toBeInTheDocument()
    expect(screen.getByText('Quotidiennes (1)')).toBeInTheDocument()
    expect(screen.getByText('Ravitaillement (22 h) (1)')).toBeInTheDocument()
    expect(screen.getByText('Hebdomadaires (1)')).toBeInTheDocument()
    expect(screen.getAllByText(/reset dans/)).toHaveLength(3)

    await user.click(screen.getAllByTitle('Marquer comme fait')[0])
    expect(setRecurringDone).toHaveBeenCalledWith('d', true)
  })

  it('closes with "Plus tard" or by clicking the backdrop', async () => {
    useStore.setState({ recurring: [task({})] })
    const user = userEvent.setup()
    const { container, unmount } = render(<LaunchAlert />)
    await user.click(screen.getByRole('button', { name: 'Plus tard' }))
    expect(container).toBeEmptyDOMElement()
    unmount()

    const second = render(<LaunchAlert />)
    await user.click(screen.getByText(/Tâches en attente/))
    expect(screen.getByText(/Tâches en attente/)).toBeInTheDocument()
    await user.click(second.container.firstChild as HTMLElement)
    expect(second.container).toBeEmptyDOMElement()
  })

  it('navigates to the recurring view', async () => {
    const setView = vi.fn()
    useStore.setState({ recurring: [task({})], setView })
    const user = userEvent.setup()
    render(<LaunchAlert />)
    await user.click(screen.getByRole('button', { name: 'Voir les tâches' }))
    expect(setView).toHaveBeenCalledWith('recurring')
  })

  it('congratulates once everything is checked while open', () => {
    useStore.setState({ recurring: [task({})] })
    render(<LaunchAlert />)
    act(() => useStore.setState({ recurring: [task({ lastCompletedAt: new Date().toISOString() })] }))
    expect(screen.getByText(/Tout est fait pour cette période/)).toBeInTheDocument()
  })
})
