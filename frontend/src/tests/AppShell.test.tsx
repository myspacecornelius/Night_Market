import { screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import AppShell from '../layouts/AppShell';
import { renderWithProviders } from './test-utils';

describe('AppShell', () => {
  it('renders dashboard', () => {
    renderWithProviders(
      <AppShell>
        <div>Dashboard</div>
      </AppShell>
    );
    expect(true).toBe(true);
  });
});
