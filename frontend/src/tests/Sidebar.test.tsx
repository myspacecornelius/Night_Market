import { fireEvent, screen, within } from '@testing-library/react'
import { act } from 'react'
import { beforeEach, describe, expect, it } from 'vitest'

import { Sidebar } from '@/layouts/_components/Sidebar'
import { useUiStore } from '@/store/ui'

import { renderWithProviders } from './test-utils'

describe('Sidebar', () => {
  beforeEach(() => {
    act(() => useUiStore.setState({ isMobileNavOpen: false }))
  })

  it('always shows full labels in the desktop sidebar', () => {
    renderWithProviders(<Sidebar />)

    // The phone menu button used to flip the flag that collapses this sidebar, and
    // the collapsed state was saved, so a tap on a phone shrank it on a laptop too.
    act(() => useUiStore.getState().toggleSidebar())

    const desktop = screen.getByRole('complementary', { name: 'Sidebar' })
    expect(within(desktop).getByRole('link', { name: 'LACES' })).toBeInTheDocument()
    expect(within(desktop).getByText('Dharma')).toBeInTheDocument()
  })

  it('opens a navigation drawer from the menu button and closes it after a choice', () => {
    renderWithProviders(<Sidebar />)
    expect(screen.queryByRole('dialog', { name: 'Navigation' })).not.toBeInTheDocument()

    act(() => useUiStore.getState().toggleSidebar()) // what the menu button in the top bar calls

    const drawer = screen.getByRole('dialog', { name: 'Navigation' })
    for (const label of ['Dashboard', 'LACES', 'Feed', 'Profile', 'Leaderboard', 'Quests']) {
      expect(within(drawer).getByRole('link', { name: label })).toBeInTheDocument()
    }

    fireEvent.click(within(drawer).getByRole('link', { name: 'Feed' }))
    expect(screen.queryByRole('dialog', { name: 'Navigation' })).not.toBeInTheDocument()
  })

  it('closes the drawer with Escape or a tap outside it', () => {
    renderWithProviders(<Sidebar />)

    act(() => useUiStore.getState().toggleSidebar())
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: 'Navigation' })).not.toBeInTheDocument()

    act(() => useUiStore.getState().toggleSidebar())
    fireEvent.click(screen.getByRole('button', { name: 'Close navigation' }))
    expect(screen.queryByRole('dialog', { name: 'Navigation' })).not.toBeInTheDocument()
  })

  it('does not remember an open drawer across visits', () => {
    act(() => useUiStore.getState().toggleSidebar())

    const saved = JSON.parse(localStorage.getItem('ui-preferences-storage') ?? '{}')
    expect(saved.state ?? {}).not.toHaveProperty('isMobileNavOpen')
    expect(saved.state ?? {}).toHaveProperty('viewMode')
  })
})
