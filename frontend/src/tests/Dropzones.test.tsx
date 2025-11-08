import { screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import Dropzones from '../pages/Dropzones';
import { renderWithProviders } from './test-utils';

describe('Dropzones', () => {
  it('renders dropzones', () => {
    renderWithProviders(<Dropzones />);
    const headline = screen.getByText(/Drop Zones/i);
    expect(headline).toBeInTheDocument();
  });
});
