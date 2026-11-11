import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AuthProvider, useAuth } from '@/hooks/useAuth'
import { apiClient } from '@/lib/api-client'
import { clearTokens, storeTokens } from '@/lib/auth-tokens'

const getCurrentUser = vi.mocked(apiClient.getCurrentUser)
const logout = vi.mocked(apiClient.logout)

function Status() {
  const { isAuthenticated, user } = useAuth()
  return <p>{isAuthenticated ? `signed in${user ? ` as ${user.username}` : ''}` : 'signed out'}</p>
}

function renderWithAuth(children: ReactNode) {
  const queryClient = new QueryClient()
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <AuthProvider>{children}</AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const failure = (status: number) => Object.assign(new Error(`HTTP ${status}`), { response: { status } })

describe('AuthProvider', () => {
  beforeEach(() => {
    storeTokens({ access_token: 'access-1', refresh_token: 'refresh-1', token_type: 'bearer' })
    getCurrentUser.mockReset()
    logout.mockReset()
  })

  afterEach(() => {
    clearTokens()
  })

  it('keeps the session when the profile cannot be loaded for a reason other than 401', async () => {
    // the API is restarting: every attempt fails with a 503
    getCurrentUser.mockRejectedValue(failure(503))

    renderWithAuth(<Status />)

    await waitFor(() => expect(getCurrentUser).toHaveBeenCalled())
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(logout).not.toHaveBeenCalled()
    expect(screen.getByText('signed in')).toBeInTheDocument()
  })

  it('signs out when the server says the session is over', async () => {
    getCurrentUser.mockRejectedValue(failure(401))

    renderWithAuth(<Status />)

    await waitFor(() => expect(screen.getByText('signed out')).toBeInTheDocument())
    expect(getCurrentUser).toHaveBeenCalledTimes(1) // not retried: nothing will change
  })

  it('shows the signed-in user once the profile loads', async () => {
    getCurrentUser.mockResolvedValue({ username: 'night_owl' } as Awaited<ReturnType<typeof apiClient.getCurrentUser>>)

    renderWithAuth(<Status />)

    await waitFor(() => expect(screen.getByText('signed in as night_owl')).toBeInTheDocument())
  })
})
