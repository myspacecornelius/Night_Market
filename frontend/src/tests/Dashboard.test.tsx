import { screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import Dashboard from '../app/routes/dashboard';
import { renderWithProviders } from './test-utils';

describe('Dashboard', () => {
  it('renders dashboard', async () => {
    renderWithProviders(<Dashboard />);
    const headline = await screen.findByText(/Welcome back/i);
    expect(headline).toBeInTheDocument();
  });
});
