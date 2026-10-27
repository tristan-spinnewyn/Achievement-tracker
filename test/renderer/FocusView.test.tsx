import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { api, makeRow } from './api'

/** jsdom cannot drag: capture the context's onDragEnd to drive it directly. */
const dnd = vi.hoisted(() => ({ onDragEnd: null as null | ((e: unknown) => Promise<void>) }))
vi.mock('@dnd-kit/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@dnd-kit/core')>()
  return {
    ...actual,
    DndContext: (props: { onDragEnd: (e: unknown) => Promise<void>; children: ReactNode }) => {
      dnd.onDragEnd = props.onDragEnd
      return <actual.DndContext {...(props as never)} />
    }
  }
})

const { default: FocusView } = await import('../../src/renderer/src/views/FocusView')
const { useStore } = await import('../../src/renderer/src/store/useStore')

const rows = [
  makeRow({ id: 1, name: 'Alpha', completed: true }),
  makeRow({ id: 2, name: 'Bêta' }),
  makeRow({ id: 3, name: 'Gamma' })
]

function setup() {
  const select = vi.fn()
  const loadRows = vi.fn(async () => {})
  useStore.setState({ select, loadRows, rows: [] } as never)
  return { select, loadRows }
}

describe('FocusView', () => {
  it('explains how to add goals when the list is empty', async () => {
    setup()
    render(<FocusView />)
    expect(await screen.findByText(/Aucun objectif en focus/)).toBeInTheDocument()
  })

  it('lists focus goals and opens one', async () => {
    const a = setup()
    api().achievements.focusList.mockResolvedValue(rows)
    const user = userEvent.setup()
    render(<FocusView />)

    expect(await screen.findByText('(3)')).toBeInTheDocument()
    expect(screen.getByText('✓')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Bêta' }))
    expect(a.select).toHaveBeenCalledWith(2)
  })

  it('removes a goal and reloads', async () => {
    const a = setup()
    api().achievements.focusList.mockResolvedValueOnce(rows).mockResolvedValue(rows.slice(1))
    const user = userEvent.setup()
    render(<FocusView />)
    await screen.findByText('Alpha')

    await user.click(screen.getAllByTitle('Retirer du focus')[0])

    expect(api().achievements.setFocus).toHaveBeenCalledWith(1, false)
    await waitFor(() => expect(screen.queryByText('Alpha')).not.toBeInTheDocument())
    expect(a.loadRows).toHaveBeenCalled()
  })

  it('persists the new order after a drag, and ignores no-op drops', async () => {
    setup()
    api().achievements.focusList.mockResolvedValue(rows)
    render(<FocusView />)
    await screen.findByText('Alpha')

    await act(() => dnd.onDragEnd!({ active: { id: 1 }, over: null }))
    await act(() => dnd.onDragEnd!({ active: { id: 1 }, over: { id: 1 } }))
    expect(api().achievements.reorderFocus).not.toHaveBeenCalled()

    await act(() => dnd.onDragEnd!({ active: { id: 1 }, over: { id: 3 } }))
    expect(api().achievements.reorderFocus).toHaveBeenCalledWith([2, 3, 1])
    const names = screen.getAllByRole('listitem').map((li) => li.textContent)
    expect(names[2]).toContain('Alpha')
  })
})
