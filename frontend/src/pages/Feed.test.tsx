
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import Feed from './Feed';

describe('Feed', () => {
  it('renders the feed with drop cards', () => {
    render(<Feed />);
    expect(screen.getByText('Hyperlocal Feed')).toBeInTheDocument();
    expect(screen.getAllByText(/SNKRS|Confirmed|Kith/).length).toBe(3);
  });
});
