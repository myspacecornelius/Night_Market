import { screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import Heatmap from '../pages/Heatmap';
import { renderWithProviders } from './test-utils';

describe('Heatmap', () => {
  it('renders heatmap', () => {
    renderWithProviders(<Heatmap />);
    const headline = screen.getByText(/Heatmap/i);
    expect(headline).toBeInTheDocument();
  });
});
