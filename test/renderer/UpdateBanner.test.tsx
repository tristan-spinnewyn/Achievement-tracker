import { describe, expect, it } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { UpdateStatus } from '@shared/types'
import UpdateBanner from '../../src/renderer/src/components/UpdateBanner'
import { api } from './api'

/** Renders the banner and returns a function pushing live statuses to it. */
async function renderBanner(initial: UpdateStatus = { state: 'idle' }) {
  let push: (s: UpdateStatus) => void = () => {}
  api().updater.status.mockResolvedValue(initial)
  api().updater.onStatusChange.mockImplementation(((cb: (s: UpdateStatus) => void) => {
    push = cb
    return () => {}
  }) as never)
  const view = render(<UpdateBanner />)
  await act(async () => {})
  return { ...view, push: (s: UpdateStatus) => act(() => push(s)) }
}

const banner = () => screen.queryByRole('complementary', { name: "Mise à jour de l'application" })

describe('UpdateBanner', () => {
  it('stays hidden while idle, checking or up to date', async () => {
    const { push } = await renderBanner()
    expect(banner()).not.toBeInTheDocument()
    push({ state: 'checking' })
    expect(banner()).not.toBeInTheDocument()
    push({ state: 'not-available', version: '1.0.1' })
    expect(banner()).not.toBeInTheDocument()
  })

  it('offers to download an available update, with its notes', async () => {
    const user = userEvent.setup()
    await renderBanner({ state: 'available', version: '2.0.0', releaseNotes: 'Corrections' })
    expect(screen.getByText('v2.0.0')).toBeInTheDocument()
    expect(screen.getByText('Corrections')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Télécharger' }))
    expect(api().updater.download).toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Plus tard' }))
    expect(banner()).not.toBeInTheDocument()
  })

  it('shows download progress and can be minimised', async () => {
    const user = userEvent.setup()
    await renderBanner({
      state: 'downloading',
      version: '2.0.0',
      progress: { percent: 40, bytesPerSecond: 2 * 1024 * 1024, transferred: 1024 * 1024, total: 0 }
    })
    expect(screen.getByText('Téléchargement de la v2.0.0')).toBeInTheDocument()
    expect(screen.getByText('40%')).toBeInTheDocument()
    expect(screen.getByText(/1\.0 Mo \/ 0 Mo/)).toBeInTheDocument()
    expect(screen.getByText('(2.0 Mo/s)')).toBeInTheDocument()
    await user.click(screen.getByTitle('Réduire'))
    expect(banner()).not.toBeInTheDocument()
  })

  it('reappears when an update becomes ready, then installs it', async () => {
    const user = userEvent.setup()
    const { push } = await renderBanner({ state: 'available', version: '2.0.0' })
    await user.click(screen.getByTitle("Ignorer pour l'instant"))
    expect(banner()).not.toBeInTheDocument()

    push({ state: 'downloaded', version: '2.0.0' })
    expect(screen.getByText('Mise à jour prête !')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Redémarrer et installer' }))
    expect(api().updater.install).toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Redémarrage…' })).toBeDisabled()
  })

  it('can postpone a downloaded update', async () => {
    const user = userEvent.setup()
    await renderBanner({ state: 'downloaded', version: '2.0.0' })
    await user.click(screen.getByTitle('Plus tard'))
    expect(banner()).not.toBeInTheDocument()
  })

  it('reports an error, retries and closes', async () => {
    const user = userEvent.setup()
    await renderBanner({ state: 'error', message: 'Réseau indisponible' })
    expect(screen.getByText('Réseau indisponible')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Réessayer' }))
    expect(api().updater.check).toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '✕' }))
    expect(banner()).not.toBeInTheDocument()
  })

  it('closes an error with "Fermer"', async () => {
    const user = userEvent.setup()
    await renderBanner({ state: 'error', message: 'x' })
    await user.click(screen.getByRole('button', { name: 'Fermer' }))
    expect(banner()).not.toBeInTheDocument()
  })
})
