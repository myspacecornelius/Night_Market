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
    expect(screen.getByText('Signals posted · 1 check-ins')).toBeInTheDocument();
    expect(await screen.findByText('Restock on the wall at the Newbury St store')).toBeInTheDocument();
    expect(screen.queryByText(/12,847/)).not.toBeInTheDocument();
  });

  it('does not show counters the API never fills, or a stray zero for them', async () => {
    renderWithProviders(<Dashboard />);

    const activity = await screen.findByText('Restock on the wall at the Newbury St store');
    // views and replies are always 0 in the API; the mocked item has boostScore 0 as well
    expect(screen.queryByText('Total Views')).not.toBeInTheDocument();
    const row = activity.closest('div')?.parentElement?.parentElement;
    expect(row).not.toBeNull();
    expect(row?.textContent).not.toMatch(/store0|store4/); // no "0" boosts, no "4" views appended
  });

  it('sends every quick action somewhere that exists', async () => {
    renderWithProviders(<Dashboard />);

    await screen.findByText(/Welcome back/i);
    const destinations = screen
      .getAllByRole('link')
      .map((link) => link.getAttribute('href'))
      .filter((href): href is string => href !== null);
    const known = ['/', '/feed', '/heatmap', '/drops', '/dropzones', '/quests', '/laces', '/leaderboard', '/profile', '/map'];
    expect(destinations.length).toBeGreaterThan(0);
    for (const href of destinations) {
      expect(known, `quick action points at ${href}`).toContain(href);
    }
    expect(screen.queryByText('Scan Sneaker')).not.toBeInTheDocument();
  });
});
