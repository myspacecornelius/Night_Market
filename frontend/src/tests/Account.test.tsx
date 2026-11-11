import { fireEvent, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ChangePasswordCard } from '@/components/account/ChangePasswordCard'
import { apiClient } from '@/lib/api-client'
import LoginPage from '@/pages/LoginPage'
import RegisterPage from '@/pages/RegisterPage'

import { renderWithProviders } from './test-utils'

const type = (label: string | RegExp, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } })

const signedOut = { isAuthenticated: false, user: null }
const GOOD_PASSWORD = 'Sup3r-Secret-Pass!'

describe('LoginPage', () => {
  it('links to the sign-up page and offers nothing it cannot do', () => {
    renderWithProviders(<LoginPage />, { auth: signedOut })

    expect(screen.getByRole('link', { name: 'Sign up' })).toHaveAttribute('href', '/register')
    // there is no password reset; the old link went nowhere
    expect(screen.queryByText(/forgot password/i)).not.toBeInTheDocument()
    for (const link of screen.getAllByRole('link')) {
      expect(link.getAttribute('href')).not.toBe('#')
    }
  })

  it('signs in with a username as well as an email address', async () => {
    const login = vi.fn(async () => {})
    renderWithProviders(<LoginPage />, { auth: { ...signedOut, login } })

    type('Email or username', 'night_owl')
    type('Password', 'whatever-it-is')
    fireEvent.click(screen.getByRole('button', { name: 'Login' }))

    await waitFor(() => expect(login).toHaveBeenCalledWith({ email: 'night_owl', password: 'whatever-it-is' }))
  })
})

describe('RegisterPage', () => {
  const fill = (overrides: Record<string, string> = {}) => {
    const values = {
      Username: 'night_owl',
      'Display name': 'Night Owl',
      Email: 'owl@example.com',
      Password: GOOD_PASSWORD,
      'Confirm password': GOOD_PASSWORD,
      ...overrides,
    }
    for (const [label, value] of Object.entries(values)) type(label, value)
  }

  it('creates the account and then signs in', async () => {
    const calls: string[] = []
    const register = vi.fn(async () => { calls.push('register') })
    const login = vi.fn(async () => { calls.push('login') })
    renderWithProviders(<RegisterPage />, { auth: { ...signedOut, register, login } })

    fill()
    fireEvent.click(screen.getByRole('button', { name: 'Sign up' }))

    await waitFor(() => expect(login).toHaveBeenCalled())
    expect(register).toHaveBeenCalledWith({
      username: 'night_owl', displayName: 'Night Owl', email: 'owl@example.com', password: GOOD_PASSWORD,
    })
    expect(login).toHaveBeenCalledWith({ email: 'owl@example.com', password: GOOD_PASSWORD })
    expect(calls).toEqual(['register', 'login'])
  })

  it('explains what is wrong before sending anything', async () => {
    const register = vi.fn(async () => {})
    renderWithProviders(<RegisterPage />, { auth: { ...signedOut, register } })

    fill({ Password: 'short', 'Confirm password': 'different' })
    fireEvent.click(screen.getByRole('button', { name: 'Sign up' }))

    expect(await screen.findByText('Password must be at least 12 characters')).toBeInTheDocument()
    expect(screen.getByText("Passwords don't match")).toBeInTheDocument()
    expect(register).not.toHaveBeenCalled()
  })

  it('does not try to sign in when the account could not be created', async () => {
    const register = vi.fn(async () => { throw new Error('Username already registered') })
    const login = vi.fn(async () => {})
    renderWithProviders(<RegisterPage />, { auth: { ...signedOut, register, login } })

    fill()
    fireEvent.click(screen.getByRole('button', { name: 'Sign up' }))

    await waitFor(() => expect(register).toHaveBeenCalled())
    expect(login).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Username')).toHaveValue('night_owl') // what was typed is kept
  })

  it('links back to the login page', () => {
    renderWithProviders(<RegisterPage />, { auth: signedOut })

    expect(screen.getByRole('link', { name: 'Log in' })).toHaveAttribute('href', '/login')
  })
})

describe('ChangePasswordCard', () => {
  const changePassword = vi.mocked(apiClient.changePassword)

  beforeEach(() => {
    changePassword.mockReset()
  })

  const fill = (current: string, next: string, confirm = next) => {
    type('Current password', current)
    type('New password', next)
    type('Confirm new password', confirm)
  }

  it('sends both passwords and says how many other sessions were ended', async () => {
    changePassword.mockResolvedValue({ message: 'Password changed', other_sessions_ended: 2 })
    renderWithProviders(<ChangePasswordCard />)

    fill('Old-Secret-Pass-1!', GOOD_PASSWORD)
    fireEvent.click(screen.getByRole('button', { name: 'Change password' }))

    expect(await screen.findByRole('status')).toHaveTextContent('Password changed. Signed out of 2 other sessions.')
    expect(changePassword).toHaveBeenCalledWith('Old-Secret-Pass-1!', GOOD_PASSWORD)
    expect(screen.getByLabelText('Current password')).toHaveValue('') // the form is cleared
  })

  it("shows the server's reason when the change is refused", async () => {
    changePassword.mockRejectedValue({ response: { status: 400, data: { detail: 'The current password is incorrect' } } })
    renderWithProviders(<ChangePasswordCard />)

    fill('Wrong-Secret-Pass-1!', GOOD_PASSWORD)
    fireEvent.click(screen.getByRole('button', { name: 'Change password' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('The current password is incorrect')
  })

  it('checks the new password before sending anything', async () => {
    renderWithProviders(<ChangePasswordCard />)

    fill('Old-Secret-Pass-1!', GOOD_PASSWORD, 'Something-Else-123!')
    fireEvent.click(screen.getByRole('button', { name: 'Change password' }))

    expect(await screen.findByText("Passwords don't match")).toBeInTheDocument()
    expect(changePassword).not.toHaveBeenCalled()
  })
})
