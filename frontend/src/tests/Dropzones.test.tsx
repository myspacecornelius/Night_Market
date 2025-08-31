import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import Dropzones from '../pages/Dropzones';

describe('Dropzones', () => {
  it('renders dropzones', () => {
    render(<Dropzones />);
    const headline = screen.getByText(/Dropzones/i);
    expect(headline).toBeInTheDocument();
  });
});
