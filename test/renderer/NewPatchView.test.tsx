import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import NewPatchView from '../../src/renderer/src/views/NewPatchView'
import { useStore } from '../../src/renderer/src/store/useStore'
import { api, makeRow } from './api'

function setup() {
  const actions = {
    select: vi.fn(),
    refreshStatus: vi.fn(),
    refreshNewPatch: vi.fn(),
    loadRows: vi.fn()
  }
  useStore.setState(actions as never)
  return actions
}

const rows = [
  makeRow({ id: 1, name: 'Obtenu', completed: true, source: 'lodestone', points: 10, iconPath: '/i.png' }),
  makeRow({ id: 2, name: 'À obtenir', points: 30 })
]

describe('NewPatchView', () => {
  it('explains how to fetch patches when the catalog has none', async () => {
    setup()
    render(<NewPatchView />)
    expect(await screen.findByText(/Aucune donnée de patch/)).toBeInTheDocument()
  })

  it('selects the latest patch and shows its progress', async () => {
    setup()
    api().meta.patches.mockResolvedValue(['7.3', '7.2'])
    api().achievements.list.mockResolvedValue(rows)
    render(<NewPatchView />)

    expect(await screen.findByText('1 / 2 obtenu(s) · 10/40 pts')).toBeInTheDocument()
    expect(screen.getByText('50%')).toBeInTheDocument()
    expect(api().achievements.list).toHaveBeenCalledWith({ patch: '7.3', sortBy: 'category', sortDir: 'asc' })
    expect(screen.getAllByRole('checkbox')[0]).toBeDisabled()
  })

  it('switches patch and shows the empty state', async () => {
    setup()
    api().meta.patches.mockResolvedValue(['7.3', '7.2'])
    api().achievements.list.mockResolvedValueOnce(rows).mockResolvedValue([])
    const user = userEvent.setup()
    render(<NewPatchView />)
    await screen.findByText('Obtenu')

    await user.selectOptions(screen.getByRole('combobox'), '7.2')

    expect(await screen.findByText('Aucun haut fait pour ce patch.')).toBeInTheDocument()
    expect(api().achievements.list).toHaveBeenLastCalledWith({ patch: '7.2', sortBy: 'category', sortDir: 'asc' })
  })

  it('checks an achievement and refreshes the related counters', async () => {
    const a = setup()
    api().meta.patches.mockResolvedValue(['7.3'])
    api().achievements.list.mockResolvedValue(rows)
    const user = userEvent.setup()
    render(<NewPatchView />)
    await screen.findByText('À obtenir')

    await user.click(screen.getAllByRole('checkbox')[1])

    expect(api().achievements.setCompletion).toHaveBeenCalledWith(2, true)
    expect(await screen.findByText('2 / 2 obtenu(s) · 40/40 pts')).toBeInTheDocument()
    expect(a.refreshStatus).toHaveBeenCalled()
    expect(a.refreshNewPatch).toHaveBeenCalled()
    expect(a.loadRows).toHaveBeenCalled()
  })

  it('opens the detail of an achievement and hides broken icons', async () => {
    const a = setup()
    api().meta.patches.mockResolvedValue(['7.3'])
    api().achievements.list.mockResolvedValue(rows)
    const user = userEvent.setup()
    const { container } = render(<NewPatchView />)

    await user.click(await screen.findByRole('button', { name: 'À obtenir' }))
    expect(a.select).toHaveBeenCalledWith(2)

    const img = container.querySelector('img') as HTMLImageElement
    img.dispatchEvent(new Event('error'))
    await waitFor(() => expect(img.style.visibility).toBe('hidden'))
  })
})
