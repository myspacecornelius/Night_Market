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

  it('shows metrics and activity from the API instead of placeholders', async () => {
    renderWithProviders(<Dashboard />);

    expect(await screen.findByText('#2')).toBeInTheDocument();
    expect(screen.getByText('Out of 31 members')).toBeInTheDocument();
    expect(screen.getByText('+40 earned today')).toBeInTheDocument();
    expect(screen.getByText('+50%')).toBeInTheDocument();
    expect(screen.getByText('Across your 3 signals')).toBeInTheDocument();
    expect(await screen.findByText('Restock on the wall at the Newbury St store')).toBeInTheDocument();
    expect(screen.queryByText(/12,847/)).not.toBeInTheDocument();
  });
});
