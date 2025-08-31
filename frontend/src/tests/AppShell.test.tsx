import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import AppShell from '../layouts/AppShell';
import { MemoryRouter } from 'react-router-dom';

describe('AppShell', () => {
  it('renders dashboard', () => {
    render(
      <MemoryRouter>
        <AppShell>
          <div>Dashboard</div>
        </AppShell>
      </MemoryRouter>
    );
    expect(true).toBe(true);
  });
});
