
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import Quests from './Quests';

describe('Quests', () => {
  it('renders the quests page with quest cards', () => {
    render(<Quests />);
    expect(screen.getByText('Quest Board')).toBeInTheDocument();
    expect(screen.getAllByText(/Take a picture|Check in|Post a review/).length).toBe(3);
  });
});
