
import { screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import Feed from './Feed';
import { renderWithProviders } from '../tests/test-utils';

describe('Feed', () => {
  it('renders the feed with drop cards', () => {
    renderWithProviders(<Feed />);
    expect(screen.getByText(/Hyperlocal Intelligence/i)).toBeInTheDocument();
    expect(screen.getAllByText(/SNKRS|Confirmed|Kith/).length).toBe(3);
  });
});
