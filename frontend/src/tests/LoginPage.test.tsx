import { screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import LoginPage from '../pages/LoginPage';
import { renderWithProviders } from './test-utils';

describe('LoginPage', () => {
  it('renders login page', () => {
    renderWithProviders(<LoginPage />, { auth: { isAuthenticated: false, user: null } });
    const headline = screen.getByRole('heading', { name: /Login/i });
    expect(headline).toBeInTheDocument();
  });
});
