import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import Profile from '../pages/Profile';

describe('Profile', () => {
  it('renders profile', () => {
    render(<Profile />);
    const headline = screen.getByRole('heading', { name: /Profile/i });
    expect(headline).toBeInTheDocument();
  });
});
