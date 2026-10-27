import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { api, makeDashboard, makeRow } from './api'

/** Canvas is not available in jsdom: capture what the chart receives instead. */
const chart = vi.hoisted(() => ({ props: null as null | { data: any; options: any } }))
vi.mock('react-chartjs-2', () => ({
  Line: (props: { data: unknown; options: unknown }) => {
    chart.props = props as never
    return <canvas data-testid="line-chart" />
  }
}))

const { default: DashboardView } = await import('../../src/renderer/src/views/DashboardView')
const { default: ProgressChart } = await import('../../src/renderer/src/components/ProgressChart')
const { useStore } = await import('../../src/renderer/src/store/useStore')

describe('ProgressChart', () => {
  it('says when there is no history', async () => {
    render(<ProgressChart />)
    expect(screen.getByText('Chargement du graphique…')).toBeInTheDocument()
    expect(await screen.findByText('Aucune donnée historique disponible.')).toBeInTheDocument()
  })

  it('also says so when only failed syncs exist, or the log cannot be read', async () => {
    api().lodestone.syncLog.mockResolvedValueOnce([
      { at: '2026-01-01T00:00:00Z', ok: false, newlyCompleted: 0, totalCompleted: 0, message: '' }
    ])
    const { unmount } = render(<ProgressChart />)
    expect(await screen.findByText('Aucune donnée historique disponible.')).toBeInTheDocument()
    unmount()

    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    api().lodestone.syncLog.mockRejectedValueOnce(new Error('ipc'))
    render(<ProgressChart />)
    expect(await screen.findByText('Aucune donnée historique disponible.')).toBeInTheDocument()
    expect(error).toHaveBeenCalled()
    error.mockRestore()
  })

  it('plots cumulative completions of successful syncs, oldest first', async () => {
    api().lodestone.syncLog.mockResolvedValue([
      { at: '2026-03-01T00:00:00Z', ok: true, newlyCompleted: 5, totalCompleted: 15, message: '' },
      { at: '2026-02-01T00:00:00Z', ok: false, newlyCompleted: 0, totalCompleted: 0, message: '' },
      { at: '2026-01-01T00:00:00Z', ok: true, newlyCompleted: 10, totalCompleted: 10, message: '' }
    ])
    render(<ProgressChart />)
    expect(await screen.findByTestId('line-chart')).toBeInTheDocument()

    const { data, options } = chart.props!
    expect(data.datasets[0].data).toEqual([10, 15])
    expect(data.datasets[1].data).toEqual([10, 15])
    expect(data.labels).toHaveLength(2)
    const label = options.plugins.tooltip.callbacks.label
    expect(label({ dataset: { label: 'Points' }, raw: 3 })).toBe('Points: 3')
    expect(label({ dataset: {}, raw: 3 })).toBe(': 3')
  })
})

describe('DashboardView', () => {
  it('shows a loader until data arrives', () => {
    api().dashboard.mockReturnValue(new Promise(() => {}))
    render(<DashboardView />)
    expect(screen.getByText('Chargement…')).toBeInTheDocument()
  })

  it('shows totals, progress by kind and category, and recent completions', async () => {
    render(<DashboardView />)
    expect(await screen.findByText('4 / 10')).toBeInTheDocument()
    expect(screen.getByText('40% complété')).toBeInTheDocument()
    expect(screen.getByText('40 / 100')).toBeInTheDocument()
    expect(screen.getByText('6')).toBeInTheDocument()
    expect(screen.getAllByText('4/10 · 40%')).toHaveLength(1)
    expect(screen.getByText('Donjons')).toBeInTheDocument()
    expect(screen.getByText('Derniers obtenus')).toBeInTheDocument()
    expect(screen.getByText('2026-10-01')).toBeInTheDocument()
  })

  it('handles an empty catalog and skips kinds without categories', async () => {
    api().dashboard.mockResolvedValue(
      makeDashboard({
        totalAchievements: 0,
        completedAchievements: 0,
        totalPoints: 0,
        earnedPoints: 0,
        byCategory: [],
        recentCompletions: []
      })
    )
    render(<DashboardView />)
    expect(await screen.findByText('0% complété')).toBeInTheDocument()
    expect(screen.queryByText('Derniers obtenus')).not.toBeInTheDocument()
    expect(screen.queryByText('Donjons')).not.toBeInTheDocument()
  })

  it('lists only non-empty collections', async () => {
    api().collections.allProgress.mockResolvedValue([
      { type: 'mount', owned: 1, total: 4 },
      { type: 'minion', owned: 0, total: 0 }
    ])
    render(<DashboardView />)
    expect(await screen.findByText('Montures')).toBeInTheDocument()
    expect(screen.getByText('1/4 · 25%')).toBeInTheDocument()
    expect(screen.queryByText('Mascottes')).not.toBeInTheDocument()
  })

  it('shows the difficulty breakdown in level order with extremes', async () => {
    api().difficulty.stats.mockResolvedValue({
      total: 6,
      byLevel: { extreme: 1, hard: 1, very_easy: 1, medium: 1, easy: 1, very_hard: 1 },
      averageScore: 51.25,
      hardest: { id: 1, name: 'Le Mur', score: 99 },
      easiest: { id: 2, name: 'Bonjour', score: 1 }
    })
    render(<DashboardView />)
    expect(await screen.findByText('51.3')).toBeInTheDocument()
    expect(screen.getByText('Le Mur')).toBeInTheDocument()
    expect(screen.getByText('Score: 1')).toBeInTheDocument()
    const levels = screen
      .getAllByText(/^(Très facile|Facile|Moyenne|Difficile|Très difficile|Extrême)$/)
      .map((e) => e.textContent)
    expect(levels).toEqual(['Très facile', 'Facile', 'Moyenne', 'Difficile', 'Très difficile', 'Extrême'])
  })

  it('omits missing hardest/easiest and opens one of the hardest to-dos', async () => {
    const select = vi.fn()
    useStore.setState({ select, difficulties: new Map() } as never)
    api().achievements.list.mockResolvedValue([makeRow({ id: 8, name: 'Défi ultime' })])
    const user = userEvent.setup()
    render(<DashboardView />)

    const heading = await screen.findByText('Plus difficiles encore à faire')
    expect(screen.queryByText('Le plus difficile')).not.toBeInTheDocument()
    await user.click(within(heading.nextElementSibling as HTMLElement).getByRole('button'))
    expect(select).toHaveBeenCalledWith(8)
    expect(api().achievements.list).toHaveBeenCalledWith({
      status: 'todo',
      obtainableOnly: true,
      sortBy: 'difficulty',
      sortDir: 'desc',
      limit: 10
    })
  })
})
