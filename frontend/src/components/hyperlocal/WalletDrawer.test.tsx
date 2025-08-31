
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import WalletDrawer from './WalletDrawer';

describe('WalletDrawer', () => {
  it('opens the wallet and shows the balance', () => {
    render(<WalletDrawer />);
    fireEvent.click(screen.getByText('Open Wallet'));
    expect(screen.getByText('Wallet')).toBeInTheDocument();
    expect(screen.getByText(/1250 Coins/)).toBeInTheDocument();
  });
});
