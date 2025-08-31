import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import Dashboard from '../pages/Dashboard';

describe('Dashboard', () => {
  it('renders dashboard', () => {
    render(<Dashboard />);
    const headline = screen.getByText(/Dashboard/i);
    expect(headline).toBeInTheDocument();
  });
});
