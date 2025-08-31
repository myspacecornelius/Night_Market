import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import Heatmap from '../pages/Heatmap';

describe('Heatmap', () => {
  it('renders heatmap', () => {
    render(<Heatmap />);
    const headline = screen.getByText(/Heatmap/i);
    expect(headline).toBeInTheDocument();
  });
});
