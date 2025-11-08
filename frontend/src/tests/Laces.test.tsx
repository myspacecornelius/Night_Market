import { screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import Laces from '../pages/Laces';
import { renderWithProviders } from './test-utils';

describe('Laces', () => {
  it('renders laces', () => {
    renderWithProviders(<Laces />);
    const headline = screen.getByRole('heading', { name: /Laces/i });
    expect(headline).toBeInTheDocument();
  });
});
