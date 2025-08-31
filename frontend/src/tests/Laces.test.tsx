import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import Laces from '../pages/Laces';

describe('Laces', () => {
  it('renders laces', () => {
    render(<Laces />);
    const headline = screen.getByRole('heading', { name: /Laces/i });
    expect(headline).toBeInTheDocument();
  });
});
