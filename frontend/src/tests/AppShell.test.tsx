import { screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import AppShell from '../layouts/AppShell';
import { renderWithProviders } from './test-utils';

describe('AppShell', () => {
  it('renders the navigation with a link for each main section', () => {
    renderWithProviders(<AppShell />);

    for (const [label, href] of [
      ['Dashboard', '/'],
      ['LACES', '/laces'],
      ['DropZones', '/dropzones'],
      ['Feed', '/feed'],
      ['Profile', '/profile'],
    ]) {
      expect(screen.getByRole('link', { name: label })).toHaveAttribute('href', href);
    }
  });
});
