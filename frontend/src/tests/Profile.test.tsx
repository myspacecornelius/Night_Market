import { screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import Profile from '../pages/Profile';
import { renderWithProviders } from './test-utils';

describe('Profile', () => {
  it('renders profile', () => {
    renderWithProviders(<Profile />);
    const headline = screen.getByRole('heading', { name: /Profile/i });
    expect(headline).toBeInTheDocument();
  });
});
