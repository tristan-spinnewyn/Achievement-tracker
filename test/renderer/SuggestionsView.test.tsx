import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import SuggestionsView from '../../src/renderer/src/views/SuggestionsView'
import { useStore } from '../../src/renderer/src/store/useStore'
import { api, makeRow, makeSettings } from './api'

describe('SuggestionsView', () => {
  it('shows a loader until settings arrive', () => {
    api().settings.get.mockReturnValue(new Promise(() => {}))
    render(<SuggestionsView />)
    expect(screen.getByText('Chargement…')).toBeInTheDocument()
  })

  it('lists suggestions with their reasons and opens one', async () => {
    const select = vi.fn()
    useStore.setState({ select } as never)
    api().suggestions.mockResolvedValue([
      { achievement: makeRow({ id: 5, name: 'Suggestion A' }), score: 3, reasons: ['Priorité haute', 'Catégorie presque finie'] }
    ] as never)
    const user = userEvent.setup()
    render(<SuggestionsView />)

    expect(await screen.findByText('Suggestion A')).toBeInTheDocument()
    expect(screen.getByText('Priorité haute')).toBeInTheDocument()
    expect(api().suggestions).toHaveBeenCalledWith({ priority: 1, points: 1, categoryProximity: 1 })
    await user.click(screen.getByRole('button', { name: 'Suggestion A' }))
    expect(select).toHaveBeenCalledWith(5)
  })

  it('says when there is nothing to suggest', async () => {
    render(<SuggestionsView />)
    expect(await screen.findByText(/Aucune suggestion/)).toBeInTheDocument()
  })

  it('saves new weights and recomputes the ranking', async () => {
    api().settings.update.mockImplementation(async (patch) => makeSettings(patch))
    render(<SuggestionsView />)
    const [, points] = await screen.findAllByRole('slider')

    fireEvent.change(points, { target: { value: '4' } })

    expect(api().settings.update).toHaveBeenCalledWith({
      suggestionWeights: { priority: 1, points: 4, categoryProximity: 1 }
    })
    await waitFor(() =>
      expect(api().suggestions).toHaveBeenLastCalledWith({ priority: 1, points: 4, categoryProximity: 1 })
    )
  })
})
