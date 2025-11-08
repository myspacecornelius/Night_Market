
import { screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import Quests from './Quests';
import { renderWithProviders } from '../tests/test-utils';

describe('Quests', () => {
  it('renders the quests page with quest cards', () => {
    renderWithProviders(<Quests />);
    expect(screen.getByText('Quest Board')).toBeInTheDocument();
    expect(screen.getAllByText(/Take a picture|Check in|Post a review/).length).toBe(3);
  });
});
