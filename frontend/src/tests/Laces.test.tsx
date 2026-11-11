import { StrictMode } from 'react';
import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import LacesPage from '../app/routes/laces';
import { LacesAPI } from '@/lib/api/laces';
import { clearTokens, storeTokens } from '@/lib/auth-tokens';
import type {
  ClaimStipendResult,
  LacesBalance,
  LacesLedger,
  LacesLedgerParams,
  LacesTransaction,
  Opportunities,
} from '@/lib/api/laces';
import { renderWithProviders } from './test-utils';

vi.mock('@/lib/api/laces', () => ({
  LacesAPI: {
    getBalance: vi.fn(),
    getLedger: vi.fn(),
    getOpportunities: vi.fn(),
    claimStipend: vi.fn(),
    boostPost: vi.fn(),
  },
}));

const api = vi.mocked(LacesAPI);

const USER_ID = '2d41071f-5c3e-4c81-9de3-c90bd53abed8';

const balance: LacesBalance = {
  balance: 1234,
  user_id: USER_ID,
  last_stipend: '2026-11-10T09:30:00Z',
  total_earned: 5678,
  total_spent: 4444,
};

const openOpportunities: Opportunities = {
  opportunities: [
    { type: 'daily_stipend', reward: 100, description: 'Claim your daily LACES stipend' },
    {
      type: 'post_boosts',
      reward: '50% of each boost',
      description: 'Share signals others find useful: you receive half of every boost',
    },
    { type: 'dropzone_checkin', reward: '10-30', description: 'Check in to a drop zone (varies by streak)' },
  ],
  daily_stipend_claimed: false,
  posts_today: 3,
  checkins_today: 7,
};

const claimedOpportunities: Opportunities = {
  ...openOpportunities,
  opportunities: openOpportunities.opportunities.filter((item) => item.type !== 'daily_stipend'),
  daily_stipend_claimed: true,
};

const boostSent: LacesTransaction = {
  id: '3e35bbd6-8d57-4c61-ad6c-0d6583605630',
  amount: -15,
  transaction_type: 'BOOST_SENT',
  related_post_id: '62970374-4528-4f55-a3f9-0c4eb25bd707',
  created_at: '2026-11-10T10:00:00Z',
  description: 'Boosted post with 15 LACES',
  balance_after: 1234,
};

const stipend: LacesTransaction = {
  id: 'c4dad3d4-91a9-4473-82c0-bff653dc9e06',
  amount: 100,
  transaction_type: 'DAILY_STIPEND',
  related_post_id: null,
  created_at: '2026-11-10T09:30:00Z',
  description: 'Daily LACES stipend',
  balance_after: 1249,
};

const adminCredit: LacesTransaction = {
  id: '07547a5c-d084-4aed-a873-08e1d16724ff',
  amount: 2500,
  transaction_type: 'ADMIN_ADD',
  related_post_id: null,
  created_at: '2026-11-09T18:45:00Z',
  description: null,
  balance_after: null,
};

/** Answers getLedger the way the API does: filter by type, newest first, one page at a time. */
function ledgerOf(all: LacesTransaction[]) {
  return async ({ page = 1, limit = 20, transaction_type }: LacesLedgerParams = {}): Promise<LacesLedger> => {
    const matching = transaction_type
      ? all.filter((transaction) => transaction.transaction_type === transaction_type)
      : all;
    return {
      transactions: matching.slice((page - 1) * limit, page * limit),
      total_count: matching.length,
      page,
      limit,
    };
  };
}

/** 45 entries: every third one is a boost sent (15), the rest are signal rewards (30). */
const manyTransactions: LacesTransaction[] = Array.from({ length: 45 }, (_, index) => {
  const n = index + 1;
  const isBoost = n % 3 === 0;
  return {
    id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
    amount: isBoost ? -n : n,
    transaction_type: isBoost ? 'BOOST_SENT' : 'SIGNAL_REWARD',
    related_post_id: null,
    created_at: '2026-11-01T12:00:00Z',
    description: `Ledger entry ${n}`,
    balance_after: 10000 + n,
  };
});

const boostReceived: LacesTransaction = {
  id: '5b0f4b0e-8f0a-4f0c-9d55-6f6a4f1f2f10',
  amount: 7,
  transaction_type: 'BOOST_RECEIVED',
  related_post_id: '62970374-4528-4f55-a3f9-0c4eb25bd707',
  created_at: '2026-11-11T07:15:00Z',
  description: 'Received 7 LACES from post boost',
  balance_after: 1241,
};

// The API has no default description for a quest reward: the row arrives with description null.
const questReward: LacesTransaction = {
  id: '1c12a2c2-b535-4f72-beca-3d4a88ff8456',
  amount: 25,
  transaction_type: 'QUEST_REWARD',
  related_post_id: null,
  created_at: '2026-11-08T12:00:00Z',
  description: null,
  balance_after: 225,
};

const claimResult: ClaimStipendResult = {
  transaction_id: 'aa11bb22-0000-4000-8000-000000000001',
  new_balance: 1334,
  amount: 100,
  transaction_type: 'DAILY_STIPEND',
  message: 'Daily stipend claimed! +100 LACES',
};

/** The page as main.tsx mounts it: inside React.StrictMode, so every effect runs twice. */
function renderPage(options?: Parameters<typeof renderWithProviders>[1], beside?: ReactNode) {
  return renderWithProviders(
    <StrictMode>
      <LacesPage />
      {beside}
    </StrictMode>,
    options,
  );
}

/**
 * A stand-in for the server's side of the stipend: a claim succeeds once (or fails first with
 * the given errors), and from then on the opportunities read reports it as claimed.
 */
function stipendServer(...failuresFirst: Error[]) {
  const server = { claimed: false };
  api.getOpportunities.mockImplementation(async () => (server.claimed ? claimedOpportunities : openOpportunities));
  api.claimStipend.mockImplementation(async () => {
    const failure = failuresFirst.shift();
    if (failure) throw failure;
    server.claimed = true;
    return claimResult;
  });
  return server;
}

/** Stands in for another page's query that is mounted in the same app (same query cache). */
function OtherPageQuery({ queryKey, read }: { queryKey: string[]; read: () => Promise<number> }) {
  useQuery({ queryKey, queryFn: read });
  return null;
}

/** Let `ms` of the page's refresh timers elapse. Needs vi.useFakeTimers() first. */
async function elapse(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

function card(name: string) {
  return screen.getByRole('region', { name });
}

/** The value shown for a labelled figure (the <dd> of a <dt>). */
function figure(container: HTMLElement, label: string) {
  return within(container).getByText(label).nextElementSibling;
}

function row(text: string) {
  const item = screen.getByText(text).closest('li');
  if (!item) throw new Error(`"${text}" is not inside a list row`);
  return item;
}

beforeEach(() => {
  api.getBalance.mockReset().mockResolvedValue(balance);
  api.getOpportunities.mockReset().mockResolvedValue(openOpportunities);
  api.getLedger.mockReset().mockImplementation(ledgerOf([boostSent, stipend, adminCredit]));
  api.claimStipend.mockReset();
  api.boostPost.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('LACES page', () => {
  it('shows the balance, totals and last stipend returned by the API', async () => {
    renderPage();

    expect(screen.getByRole('status', { name: 'Loading balance' })).toBeInTheDocument();

    const balanceCard = card('Balance');
    expect(await within(balanceCard).findByText('1,234')).toBeInTheDocument();
    expect(figure(balanceCard, 'Total Earned')).toHaveTextContent('5,678');
    expect(figure(balanceCard, 'Total Spent')).toHaveTextContent('4,444');
    expect(within(balanceCard).getByText(/Last stipend:/).querySelector('time')).toHaveAttribute(
      'datetime',
      '2026-11-10T09:30:00Z',
    );
    expect(screen.queryByRole('status', { name: 'Loading balance' })).not.toBeInTheDocument();
    expect(api.getBalance).toHaveBeenCalledTimes(1);
  });

  it("lists the earning opportunities with their rewards and today's activity", async () => {
    renderPage();

    expect(screen.getByRole('status', { name: 'Loading earning opportunities' })).toBeInTheDocument();
    expect(screen.getByRole('status', { name: "Loading today's activity" })).toBeInTheDocument();

    await screen.findByText('Claim your daily LACES stipend');
    const stipendRow = row('Claim your daily LACES stipend');
    expect(within(stipendRow).getByText('+100 LACES')).toBeInTheDocument();
    expect(within(stipendRow).getByRole('button', { name: 'Claim stipend' })).toBeEnabled();

    const boostsRow = row('Share signals others find useful: you receive half of every boost');
    expect(within(boostsRow).getByText('50% of each boost')).toBeInTheDocument();
    expect(within(boostsRow).queryByRole('button')).not.toBeInTheDocument();

    const checkinRow = row('Check in to a drop zone (varies by streak)');
    expect(within(checkinRow).getByText('+10-30 LACES')).toBeInTheDocument();

    expect(screen.queryByText('Daily stipend claimed today')).not.toBeInTheDocument();

    const activityCard = card("Today's Activity");
    expect(figure(activityCard, 'Posts Shared')).toHaveTextContent('3');
    expect(figure(activityCard, 'Zone Check-ins')).toHaveTextContent('7');
  });

  it('renders each ledger transaction with its amount, type and balance afterwards', async () => {
    renderPage();

    expect(screen.getByRole('status', { name: 'Loading transactions' })).toBeInTheDocument();
    await screen.findByText('Boosted post with 15 LACES');
    expect(api.getLedger).toHaveBeenCalledWith({ page: 1, limit: 20 });

    const boostRow = row('Boosted post with 15 LACES');
    expect(within(boostRow).getByText('-15')).toBeInTheDocument();
    expect(within(boostRow).getByText('Boost sent')).toBeInTheDocument();
    expect(within(boostRow).getByText('Balance after: 1,234')).toBeInTheDocument();
    expect(boostRow.querySelector('time')).toHaveAttribute('datetime', '2026-11-10T10:00:00Z');

    const stipendRow = row('Daily LACES stipend');
    expect(within(stipendRow).getByText('+100')).toBeInTheDocument();
    expect(within(stipendRow).getByText('Daily stipend')).toBeInTheDocument();
    expect(within(stipendRow).getByText('Balance after: 1,249')).toBeInTheDocument();

    // No description and no balance_after from the API: the type names the row and no balance is invented.
    const adminRow = row('+2,500');
    expect(within(adminRow).getAllByText('Admin credit')).toHaveLength(2);
    expect(within(adminRow).queryByText(/Balance after/)).not.toBeInTheDocument();

    const pages = screen.getByRole('navigation', { name: 'Transaction pages' });
    expect(within(pages).getByText('Page 1 of 1 · 3 transactions')).toBeInTheDocument();
    expect(within(pages).queryByRole('button', { name: 'Next' })).not.toBeInTheDocument();
  });

  it('shows empty states for an account with no history and nothing to earn', async () => {
    api.getBalance.mockResolvedValue({
      balance: 100,
      user_id: USER_ID,
      last_stipend: null,
      total_earned: 0,
      total_spent: 0,
    });
    api.getOpportunities.mockResolvedValue({
      opportunities: [],
      daily_stipend_claimed: false,
      posts_today: 0,
      checkins_today: 0,
    });
    api.getLedger.mockImplementation(ledgerOf([]));

    renderPage();

    expect(await screen.findByText('No transactions yet')).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Transaction pages' })).not.toBeInTheDocument();

    expect(await screen.findByText('No earning opportunities right now')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Claim stipend' })).not.toBeInTheDocument();

    const balanceCard = card('Balance');
    expect(await within(balanceCard).findByText('100')).toBeInTheDocument();
    expect(figure(balanceCard, 'Total Earned')).toHaveTextContent('0');
    expect(figure(balanceCard, 'Total Spent')).toHaveTextContent('0');
    expect(within(balanceCard).getByText('No daily stipend claimed yet')).toBeInTheDocument();

    const activityCard = card("Today's Activity");
    expect(figure(activityCard, 'Posts Shared')).toHaveTextContent('0');
    expect(figure(activityCard, 'Zone Check-ins')).toHaveTextContent('0');
  });

  it('claims the daily stipend and reloads the balance, opportunities and ledger', async () => {
    const todaysStipend: LacesTransaction = {
      ...stipend,
      id: claimResult.transaction_id,
      created_at: '2026-11-11T08:00:00Z',
      description: "Today's stipend entry",
      balance_after: 1334,
    };

    // A small stand-in for the server: the claim changes what the three reads return.
    let claimed = false;
    let finishClaim: () => void = () => {};
    api.getBalance.mockImplementation(async () =>
      claimed
        ? { ...balance, balance: 1334, total_earned: 5778, last_stipend: '2026-11-11T08:00:00Z' }
        : balance,
    );
    api.getOpportunities.mockImplementation(async () => (claimed ? claimedOpportunities : openOpportunities));
    api.getLedger.mockImplementation((params) =>
      ledgerOf(claimed ? [todaysStipend, boostSent, stipend] : [boostSent, stipend])(params),
    );
    api.claimStipend.mockImplementation(
      () =>
        new Promise<ClaimStipendResult>((resolve) => {
          finishClaim = () => {
            claimed = true;
            resolve(claimResult);
          };
        }),
    );
    const refreshUser = vi.fn(async () => {});

    renderPage({ auth: { refreshUser } });

    const balanceCard = card('Balance');
    expect(await within(balanceCard).findByText('1,234')).toBeInTheDocument();
    await screen.findByText('Daily LACES stipend');

    fireEvent.click(await screen.findByRole('button', { name: 'Claim stipend' }));

    expect(await screen.findByRole('button', { name: 'Claiming...' })).toBeDisabled();
    expect(api.claimStipend).toHaveBeenCalledTimes(1);
    expect(api.claimStipend).toHaveBeenCalledWith();

    finishClaim();

    expect(
      await screen.findByText('Daily stipend claimed! +100 LACES New balance: 1,334 LACES.'),
    ).toHaveAttribute('role', 'status');

    // The claim is no longer on offer...
    expect(await screen.findByText('Daily stipend claimed today')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Claim/ })).not.toBeInTheDocument();
    expect(screen.queryByText('Claim your daily LACES stipend')).not.toBeInTheDocument();
    expect(screen.getByText('Share signals others find useful: you receive half of every boost')).toBeInTheDocument();

    // ...and the balance, totals and ledger are read again from the API.
    expect(await within(balanceCard).findByText('1,334')).toBeInTheDocument();
    expect(figure(balanceCard, 'Total Earned')).toHaveTextContent('5,778');
    expect(within(balanceCard).queryByText('1,234')).not.toBeInTheDocument();
    await screen.findByText("Today's stipend entry");
    const newRow = row("Today's stipend entry");
    expect(within(newRow).getByText('Balance after: 1,334')).toBeInTheDocument();

    expect(api.getBalance).toHaveBeenCalledTimes(2);
    expect(api.getOpportunities).toHaveBeenCalledTimes(2);
    expect(api.getLedger).toHaveBeenCalledTimes(2);
    expect(refreshUser).toHaveBeenCalledTimes(1);
  });

  it('shows the API message when the stipend was already claimed and reloads the wallet', async () => {
    // The stipend was granted elsewhere after the page loaded: the next reads show it.
    api.getOpportunities.mockResolvedValueOnce(openOpportunities).mockResolvedValue(claimedOpportunities);
    api.getBalance.mockResolvedValueOnce(balance).mockResolvedValue({ ...balance, balance: 1334 });
    api.claimStipend.mockRejectedValue(new Error('Daily stipend already claimed'));

    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Claim stipend' }));

    const opportunitiesCard = card('Earning Opportunities');
    expect(await within(opportunitiesCard).findByRole('alert')).toHaveTextContent(
      'Daily stipend already claimed',
    );
    expect(await screen.findByText('Daily stipend claimed today')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Claim stipend' })).not.toBeInTheDocument();
    expect(screen.queryByText(/New balance/)).not.toBeInTheDocument();

    expect(await within(card('Balance')).findByText('1,334')).toBeInTheDocument();

    expect(api.claimStipend).toHaveBeenCalledTimes(1);
    expect(api.getOpportunities).toHaveBeenCalledTimes(2);
    expect(api.getBalance).toHaveBeenCalledTimes(2);
    expect(api.getLedger).toHaveBeenCalledTimes(2);
  });

  it('shows an error for the balance and loads it on retry', async () => {
    api.getBalance.mockRejectedValueOnce(new Error('Rate limit exceeded. Try again in 12 seconds.'));

    renderPage();

    const balanceCard = card('Balance');
    const alert = await within(balanceCard).findByRole('alert');
    expect(alert).toHaveTextContent('Could not load your balance');
    expect(alert).toHaveTextContent('Rate limit exceeded. Try again in 12 seconds.');
    expect(within(balanceCard).queryByText('Total Earned')).not.toBeInTheDocument();
    expect(within(balanceCard).queryByText('LACES')).not.toBeInTheDocument();

    fireEvent.click(within(balanceCard).getByRole('button', { name: 'Retry loading balance' }));

    expect(await within(balanceCard).findByText('1,234')).toBeInTheDocument();
    expect(within(balanceCard).queryByRole('alert')).not.toBeInTheDocument();
    expect(api.getBalance).toHaveBeenCalledTimes(2);
  });

  it("shows an error for the opportunities and today's activity and loads them on retry", async () => {
    api.getOpportunities.mockRejectedValueOnce(new Error('Inactive user'));

    renderPage();

    const opportunitiesCard = card('Earning Opportunities');
    const activityCard = card("Today's Activity");
    const alert = await within(opportunitiesCard).findByRole('alert');
    expect(alert).toHaveTextContent('Could not load earning opportunities');
    expect(alert).toHaveTextContent('Inactive user');
    expect(within(activityCard).getByRole('alert')).toHaveTextContent("Could not load today's activity");
    expect(within(activityCard).queryByText('Posts Shared')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Claim stipend' })).not.toBeInTheDocument();

    fireEvent.click(
      within(opportunitiesCard).getByRole('button', { name: 'Retry loading earning opportunities' }),
    );

    expect(await screen.findByRole('button', { name: 'Claim stipend' })).toBeInTheDocument();
    expect(figure(activityCard, 'Posts Shared')).toHaveTextContent('3');
    expect(within(opportunitiesCard).queryByRole('alert')).not.toBeInTheDocument();
    expect(within(activityCard).queryByRole('alert')).not.toBeInTheDocument();
    expect(api.getOpportunities).toHaveBeenCalledTimes(2);
  });

  it('shows an error for the ledger and loads it on retry', async () => {
    api.getLedger.mockRejectedValueOnce(new Error('Could not load your transactions (HTTP 503)'));

    renderPage();

    const ledgerCard = card('Transaction History');
    const alert = await within(ledgerCard).findByRole('alert');
    expect(alert).toHaveTextContent('Could not load your transactions (HTTP 503)');
    expect(screen.queryByText('No transactions yet')).not.toBeInTheDocument();

    fireEvent.click(within(ledgerCard).getByRole('button', { name: 'Retry loading transactions' }));

    expect(await screen.findByText('Boosted post with 15 LACES')).toBeInTheDocument();
    expect(within(ledgerCard).queryByRole('alert')).not.toBeInTheDocument();
    expect(api.getLedger).toHaveBeenCalledTimes(2);
  });

  it('pages through the ledger', async () => {
    api.getLedger.mockImplementation(ledgerOf(manyTransactions));

    renderPage();

    expect(await screen.findByText('Ledger entry 1')).toBeInTheDocument();
    expect(screen.getByText('Ledger entry 20')).toBeInTheDocument();
    expect(screen.queryByText('Ledger entry 21')).not.toBeInTheDocument();
    expect(screen.getByText('Page 1 of 3 · 45 transactions')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    expect(await screen.findByText('Ledger entry 21')).toBeInTheDocument();
    expect(api.getLedger).toHaveBeenLastCalledWith({ page: 2, limit: 20 });
    expect(screen.getByText('Ledger entry 40')).toBeInTheDocument();
    expect(screen.queryByText('Ledger entry 1')).not.toBeInTheDocument();
    expect(screen.getByText('Page 2 of 3 · 45 transactions')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    expect(await screen.findByText('Ledger entry 45')).toBeInTheDocument();
    expect(api.getLedger).toHaveBeenLastCalledWith({ page: 3, limit: 20 });
    expect(screen.queryByText('Ledger entry 40')).not.toBeInTheDocument();
    expect(screen.getByText('Page 3 of 3 · 45 transactions')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Previous' }));

    expect(await screen.findByText('Ledger entry 21')).toBeInTheDocument();
    expect(api.getLedger).toHaveBeenLastCalledWith({ page: 2, limit: 20 });
    expect(screen.queryByText('Ledger entry 45')).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled());
  });

  it('lets the user go back when a later ledger page fails to load', async () => {
    const answer = ledgerOf(manyTransactions);
    api.getLedger.mockImplementation((params) =>
      params?.page === 2 ? Promise.reject(new Error('A value in the request is not valid')) : answer(params),
    );

    renderPage();

    await screen.findByText('Ledger entry 1');
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    const ledgerCard = card('Transaction History');
    expect(await within(ledgerCard).findByRole('alert')).toHaveTextContent('A value in the request is not valid');
    expect(screen.queryByText('Ledger entry 1')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Previous' }));

    expect(await screen.findByText('Ledger entry 1')).toBeInTheDocument();
    expect(within(ledgerCard).queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByText('Page 1 of 3 · 45 transactions')).toBeInTheDocument();
  });

  it('filters the ledger by transaction type, starting again from the first page', async () => {
    api.getLedger.mockImplementation(ledgerOf(manyTransactions));

    renderPage();

    const filter = screen.getByLabelText('Transaction type');
    expect(filter).toHaveValue('ALL');

    await screen.findByText('Ledger entry 1');
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await screen.findByText('Ledger entry 21');

    fireEvent.change(filter, { target: { value: 'BOOST_SENT' } });

    expect(await screen.findByText('Page 1 of 1 · 15 transactions')).toBeInTheDocument();
    expect(api.getLedger).toHaveBeenLastCalledWith({ page: 1, limit: 20, transaction_type: 'BOOST_SENT' });
    expect(filter).toHaveValue('BOOST_SENT');
    expect(screen.getByText('Ledger entry 3')).toBeInTheDocument();
    expect(screen.getByText('Ledger entry 45')).toBeInTheDocument();
    expect(screen.queryByText('Ledger entry 1')).not.toBeInTheDocument();
    expect(screen.queryByText('Ledger entry 22')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Next' })).not.toBeInTheDocument();

    fireEvent.change(filter, { target: { value: 'REFUND' } });

    expect(await screen.findByText('No refund transactions')).toBeInTheDocument();
    expect(api.getLedger).toHaveBeenLastCalledWith({ page: 1, limit: 20, transaction_type: 'REFUND' });
    expect(screen.queryByText('Ledger entry 3')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Show all types' }));

    expect(await screen.findByText('Page 1 of 3 · 45 transactions')).toBeInTheDocument();
    expect(api.getLedger).toHaveBeenLastCalledWith({ page: 1, limit: 20 });
    expect(filter).toHaveValue('ALL');
    expect(screen.getByText('Ledger entry 1')).toBeInTheDocument();
  });

  it('offers exactly the transaction types the API accepts as a filter, quest rewards included', async () => {
    api.getLedger.mockImplementation(ledgerOf([boostSent, questReward, stipend]));

    renderPage();

    const filter = screen.getByLabelText('Transaction type');
    const options = within(filter)
      .getAllByRole<HTMLOptionElement>('option')
      .map((option) => [option.value, option.textContent]);
    // The values are the API's transaction_type names, letter for letter: anything else is a 422.
    expect(options).toEqual([
      ['ALL', 'All types'],
      ['DAILY_STIPEND', 'Daily stipend'],
      ['BOOST_SENT', 'Boost sent'],
      ['BOOST_RECEIVED', 'Boost received'],
      ['SIGNAL_REWARD', 'Signal reward'],
      ['POST_REWARD', 'Post reward'],
      ['CHECKIN_REWARD', 'Check-in reward'],
      ['QUEST_REWARD', 'Quest reward'],
      ['CONTEST_REWARD', 'Contest reward'],
      ['PURCHASE', 'Purchase'],
      ['REFUND', 'Refund'],
      ['ADMIN_ADD', 'Admin credit'],
      ['ADMIN_REMOVE', 'Admin debit'],
    ]);

    // A quest reward has no description from the API: its type names the row.
    await screen.findByText('+25');
    const questRow = row('+25');
    expect(within(questRow).getAllByText('Quest reward')).toHaveLength(2);
    expect(within(questRow).getByText('Balance after: 225')).toBeInTheDocument();

    fireEvent.change(filter, { target: { value: 'QUEST_REWARD' } });

    expect(await screen.findByText('Page 1 of 1 · 1 transaction')).toBeInTheDocument();
    expect(api.getLedger).toHaveBeenLastCalledWith({ page: 1, limit: 20, transaction_type: 'QUEST_REWARD' });
    expect(screen.getByText('+25')).toBeInTheDocument();
    expect(screen.queryByText('Boosted post with 15 LACES')).not.toBeInTheDocument();
  });

  it('names a transaction of a type it has no label for instead of dropping it', async () => {
    const unknownType = { ...adminCredit, amount: -40, transaction_type: 'SEASON_PASS_FEE' } as unknown as LacesTransaction;
    api.getLedger.mockImplementation(ledgerOf([unknownType]));

    renderPage();

    await screen.findByText('-40');
    expect(within(row('-40')).getAllByText('Season pass fee')).toHaveLength(2);
  });

  it('lets the user claim again after a claim that did not reach the server', async () => {
    stipendServer(new Error('Could not reach the server. Check your connection and try again.'));

    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Claim stipend' }));

    const opportunitiesCard = card('Earning Opportunities');
    expect(await within(opportunitiesCard).findByRole('alert')).toHaveTextContent(
      'Could not reach the server. Check your connection and try again.',
    );
    // Nothing was granted: no confirmation, and the claim is still on offer.
    expect(screen.queryByText(/New balance/)).not.toBeInTheDocument();
    expect(screen.queryByText('Daily stipend claimed today')).not.toBeInTheDocument();
    const claimButton = await screen.findByRole('button', { name: 'Claim stipend' });
    await waitFor(() => expect(claimButton).toBeEnabled());

    fireEvent.click(claimButton);

    expect(
      await screen.findByText('Daily stipend claimed! +100 LACES New balance: 1,334 LACES.'),
    ).toBeInTheDocument();
    expect(within(opportunitiesCard).queryByRole('alert')).not.toBeInTheDocument();
    expect(await screen.findByText('Daily stipend claimed today')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Claim/ })).not.toBeInTheDocument();
    expect(api.claimStipend).toHaveBeenCalledTimes(2);
  });

  it('makes the other pages that show the balance read it again after a claim', async () => {
    stipendServer();
    // The query keys those pages use (dashboard.tsx, profile.tsx, leaderboard.tsx, heatmap.tsx).
    const readDashboard = vi.fn(async () => 1);
    const readProfile = vi.fn(async () => 1);
    const readProfileStats = vi.fn(async () => 1);
    const readLacesLeaderboard = vi.fn(async () => 1);
    const readHeatmap = vi.fn(async () => 1);
    const refreshUser = vi.fn(async () => {});

    renderPage(
      { auth: { refreshUser } },
      <>
        <OtherPageQuery queryKey={['dashboard', 'metrics']} read={readDashboard} />
        <OtherPageQuery queryKey={['profile', 'me']} read={readProfile} />
        <OtherPageQuery queryKey={['profile', 'stats']} read={readProfileStats} />
        <OtherPageQuery queryKey={['leaderboard', 'laces', '10']} read={readLacesLeaderboard} />
        <OtherPageQuery queryKey={['heatmap', 'bins']} read={readHeatmap} />
      </>,
    );

    await screen.findByRole('button', { name: 'Claim stipend' });
    await waitFor(() => expect(readHeatmap).toHaveBeenCalledTimes(1));
    expect(readDashboard).toHaveBeenCalledTimes(1);
    expect(refreshUser).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Claim stipend' }));
    await screen.findByText('Daily stipend claimed today');

    await waitFor(() => expect(readDashboard).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(readProfile).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(readProfileStats).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(readLacesLeaderboard).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(api.getBalance).toHaveBeenCalledTimes(2));
    expect(refreshUser).toHaveBeenCalledTimes(1);
    // A page that shows no LACES figures is left alone.
    expect(readHeatmap).toHaveBeenCalledTimes(1);
  });

  it('reads the balance and the ledger page on screen again every 30 seconds, and the opportunities every 60', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    api.getLedger.mockImplementation(ledgerOf(manyTransactions));

    renderPage();

    const balanceCard = card('Balance');
    expect(await within(balanceCard).findByText('1,234')).toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: 'Next' }));
    expect(await screen.findByText('Ledger entry 21')).toBeInTheDocument();
    await screen.findByRole('button', { name: 'Claim stipend' });

    // LACES arrive from elsewhere: someone boosts one of this user's posts.
    api.getBalance.mockResolvedValue({ ...balance, balance: 1241, total_earned: 5685 });
    api.getLedger.mockImplementation(ledgerOf([boostReceived, ...manyTransactions]));
    api.getOpportunities.mockResolvedValue({ ...claimedOpportunities, posts_today: 4 });
    api.getBalance.mockClear();
    api.getLedger.mockClear();
    api.getOpportunities.mockClear();

    await elapse(25_000);
    expect(api.getBalance).not.toHaveBeenCalled();
    expect(api.getLedger).not.toHaveBeenCalled();

    await elapse(6_000);

    // The balance and the ledger change together: the new entry pushed "20" onto the page on screen.
    expect(await within(balanceCard).findByText('1,241')).toBeInTheDocument();
    expect(figure(balanceCard, 'Total Earned')).toHaveTextContent('5,685');
    expect(await screen.findByText('Ledger entry 20')).toBeInTheDocument();
    expect(screen.getByText('Page 2 of 3 · 46 transactions')).toBeInTheDocument();
    expect(api.getLedger).toHaveBeenLastCalledWith({ page: 2, limit: 20 });
    expect(api.getBalance).toHaveBeenCalledTimes(1);
    expect(api.getLedger).toHaveBeenCalledTimes(1);
    expect(api.getOpportunities).not.toHaveBeenCalled();

    await elapse(30_000);

    // The stipend was granted elsewhere (the daily distribution): the claim is withdrawn.
    expect(await screen.findByText('Daily stipend claimed today')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Claim stipend' })).not.toBeInTheDocument();
    expect(figure(card("Today's Activity"), 'Posts Shared')).toHaveTextContent('4');
    expect(api.getOpportunities).toHaveBeenCalledTimes(1);
    expect(api.getBalance).toHaveBeenCalledTimes(2);
    expect(api.getLedger).toHaveBeenCalledTimes(2);
  });

  it('keeps the last loaded figures on screen, with a notice, when a refresh fails', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });

    renderPage();

    const balanceCard = card('Balance');
    const ledgerCard = card('Transaction History');
    const opportunitiesCard = card('Earning Opportunities');
    expect(await within(balanceCard).findByText('1,234')).toBeInTheDocument();
    await screen.findByText('Boosted post with 15 LACES');
    await screen.findByRole('button', { name: 'Claim stipend' });

    api.getBalance.mockRejectedValue(new Error('Rate limit exceeded. Try again in 12 seconds.'));
    api.getLedger.mockRejectedValue(new Error('Could not load your transactions (HTTP 503)'));
    api.getOpportunities.mockRejectedValue(new Error('Could not load earning opportunities (HTTP 503)'));

    await elapse(60_000);

    const balanceAlert = await within(balanceCard).findByRole('alert');
    expect(balanceAlert).toHaveTextContent('Could not refresh your balance. Showing the last loaded values.');
    expect(balanceAlert).toHaveTextContent('Rate limit exceeded. Try again in 12 seconds.');
    expect(within(balanceCard).getByText('1,234')).toBeInTheDocument();
    expect(figure(balanceCard, 'Total Spent')).toHaveTextContent('4,444');

    const ledgerAlert = await within(ledgerCard).findByRole('alert');
    expect(ledgerAlert).toHaveTextContent('Could not refresh your transactions. Showing the last loaded page.');
    expect(ledgerAlert).toHaveTextContent('Could not load your transactions (HTTP 503)');
    expect(within(row('Boosted post with 15 LACES')).getByText('-15')).toBeInTheDocument();
    expect(screen.getByText('Page 1 of 1 · 3 transactions')).toBeInTheDocument();

    const opportunitiesAlert = await within(opportunitiesCard).findByRole('alert');
    expect(opportunitiesAlert).toHaveTextContent(
      'Could not refresh earning opportunities. Showing the last loaded list.',
    );
    expect(screen.getByRole('button', { name: 'Claim stipend' })).toBeEnabled();
    const activityCard = card("Today's Activity");
    expect(figure(activityCard, 'Posts Shared')).toHaveTextContent('3');
    expect(within(activityCard).queryByRole('alert')).not.toBeInTheDocument();

    // Each notice has its own retry, and goes away once the read succeeds.
    api.getBalance.mockResolvedValue({ ...balance, balance: 1300 });
    fireEvent.click(within(balanceCard).getByRole('button', { name: 'Retry loading balance' }));
    expect(await within(balanceCard).findByText('1,300')).toBeInTheDocument();
    expect(within(balanceCard).queryByRole('alert')).not.toBeInTheDocument();
    expect(within(ledgerCard).getByRole('alert')).toBeInTheDocument();

    api.getLedger.mockImplementation(ledgerOf([boostReceived, boostSent, stipend, adminCredit]));
    fireEvent.click(within(ledgerCard).getByRole('button', { name: 'Retry loading transactions' }));
    expect(await screen.findByText('Received 7 LACES from post boost')).toBeInTheDocument();
    expect(within(ledgerCard).queryByRole('alert')).not.toBeInTheDocument();
  });

  it("clears yesterday's claim confirmation when the API offers the stipend again", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const server = stipendServer();

    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Claim stipend' }));
    expect(
      await screen.findByText('Daily stipend claimed! +100 LACES New balance: 1,334 LACES.'),
    ).toBeInTheDocument();
    expect(await screen.findByText('Daily stipend claimed today')).toBeInTheDocument();

    // Still the same day: the confirmation stays through a refresh.
    await elapse(60_000);
    expect(screen.getByText('Daily stipend claimed! +100 LACES New balance: 1,334 LACES.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Claim stipend' })).not.toBeInTheDocument();

    // 00:00 UTC passes with the page open: the API offers the stipend again.
    server.claimed = false;
    await elapse(60_000);

    expect(await screen.findByRole('button', { name: 'Claim stipend' })).toBeEnabled();
    expect(screen.queryByText(/Daily stipend claimed!/)).not.toBeInTheDocument();
    expect(screen.queryByText(/New balance/)).not.toBeInTheDocument();
    expect(screen.queryByText('Daily stipend claimed today')).not.toBeInTheDocument();

    // ...and can be claimed again.
    fireEvent.click(screen.getByRole('button', { name: 'Claim stipend' }));
    expect(
      await screen.findByText('Daily stipend claimed! +100 LACES New balance: 1,334 LACES.'),
    ).toBeInTheDocument();
    expect(api.claimStipend).toHaveBeenCalledTimes(2);
  });

  it('clears an "already claimed" refusal when the API offers the stipend again', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    // The stipend was granted elsewhere after the page loaded, so the claim is refused.
    const server = stipendServer();
    api.claimStipend.mockImplementation(async () => {
      server.claimed = true;
      throw new Error('Daily stipend already claimed');
    });

    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Claim stipend' }));
    const opportunitiesCard = card('Earning Opportunities');
    expect(await within(opportunitiesCard).findByRole('alert')).toHaveTextContent('Daily stipend already claimed');
    expect(await screen.findByText('Daily stipend claimed today')).toBeInTheDocument();

    server.claimed = false;
    await elapse(60_000);

    expect(await screen.findByRole('button', { name: 'Claim stipend' })).toBeEnabled();
    expect(within(opportunitiesCard).queryByRole('alert')).not.toBeInTheDocument();
  });
});

// The page tests above replace LacesAPI. These run the real module against a stubbed fetch,
// with answers copied from the running API (services/routers/laces.py).
describe('LacesAPI', () => {
  let real: typeof import('@/lib/api/laces');
  const fetchMock = vi.fn();

  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

  const lastRequest = () => {
    const [url, init] = fetchMock.mock.lastCall as [string, RequestInit | undefined];
    const target = new URL(url);
    return {
      path: target.pathname + target.search,
      method: init?.method ?? 'GET',
      body: init?.body ?? null,
      authorization: new Headers(init?.headers).get('Authorization'),
    };
  };

  beforeAll(async () => {
    real = await vi.importActual<typeof import('@/lib/api/laces')>('@/lib/api/laces');
  });

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    storeTokens({ access_token: 'access-1', token_type: 'bearer' });
  });

  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
    clearTokens();
  });

  it('reads the balance and the opportunities with the bearer token', async () => {
    const freshBalance: LacesBalance = {
      balance: 100,
      user_id: 'a896b6f2-6b31-4d02-9bdd-6e3ca36f30f4',
      last_stipend: null,
      total_earned: 0,
      total_spent: 0,
    };
    fetchMock.mockImplementationOnce(async () => json(200, freshBalance));

    await expect(real.LacesAPI.getBalance()).resolves.toEqual(freshBalance);
    expect(lastRequest()).toEqual({
      path: '/v1/laces/balance',
      method: 'GET',
      body: null,
      authorization: 'Bearer access-1',
    });

    fetchMock.mockImplementationOnce(async () => json(200, openOpportunities));

    await expect(real.LacesAPI.getOpportunities()).resolves.toEqual(openOpportunities);
    expect(lastRequest()).toEqual({
      path: '/v1/laces/opportunities',
      method: 'GET',
      body: null,
      authorization: 'Bearer access-1',
    });
  });

  it('sends page, limit and transaction_type to the ledger only when they are given', async () => {
    const page: LacesLedger = { transactions: [questReward], total_count: 1, page: 2, limit: 20 };
    fetchMock.mockImplementation(async () => json(200, page));

    await expect(
      real.LacesAPI.getLedger({ page: 2, limit: 20, transaction_type: 'QUEST_REWARD' }),
    ).resolves.toEqual(page);
    expect(lastRequest()).toEqual({
      path: '/v1/laces/ledger?page=2&limit=20&transaction_type=QUEST_REWARD',
      method: 'GET',
      body: null,
      authorization: 'Bearer access-1',
    });

    await real.LacesAPI.getLedger({ page: 1, limit: 20 });
    expect(lastRequest().path).toBe('/v1/laces/ledger?page=1&limit=20');

    await real.LacesAPI.getLedger();
    expect(lastRequest().path).toBe('/v1/laces/ledger');
  });

  it('claims the stipend with POST /v1/laces/daily-stipend', async () => {
    fetchMock.mockImplementationOnce(async () => json(200, claimResult));

    await expect(real.LacesAPI.claimStipend()).resolves.toEqual(claimResult);
    expect(lastRequest()).toEqual({
      path: '/v1/laces/daily-stipend',
      method: 'POST',
      body: null,
      authorization: 'Bearer access-1',
    });
  });

  it("rejects with the API's detail when the stipend was already claimed", async () => {
    fetchMock.mockImplementationOnce(async () => json(400, { detail: 'Daily stipend already claimed' }));

    const failure = await real.LacesAPI.claimStipend().catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(real.LacesApiError);
    expect(failure).toMatchObject({ message: 'Daily stipend already claimed', status: 400 });
  });

  it('boosts a post with POST, sending boost_amount only when one is given', async () => {
    const postId = '50d2f6bd-b190-4cfb-90ca-474e7a112243';
    const boosted = { success: true, boost_amount: 15, author_reward: 7, new_boost_score: 15, remaining_balance: 245 };
    fetchMock.mockImplementation(async () => json(200, boosted));

    await expect(real.LacesAPI.boostPost(postId, 15)).resolves.toEqual(boosted);
    expect(lastRequest()).toEqual({
      path: `/v1/laces/boost-post/${postId}?boost_amount=15`,
      method: 'POST',
      body: null,
      authorization: 'Bearer access-1',
    });

    await real.LacesAPI.boostPost(postId);
    expect(lastRequest()).toMatchObject({ path: `/v1/laces/boost-post/${postId}`, method: 'POST' });
  });

  it('names the rejected fields of a 422, whose detail is a list', async () => {
    fetchMock.mockImplementationOnce(async () =>
      json(422, {
        detail: [
          {
            type: 'greater_than_equal',
            loc: ['query', 'page'],
            msg: 'Input should be greater than or equal to 1',
            input: '0',
          },
          {
            type: 'less_than_equal',
            loc: ['query', 'limit'],
            msg: 'Input should be less than or equal to 100',
            input: '101',
          },
        ],
      }),
    );

    await expect(real.LacesAPI.getLedger({ page: 0, limit: 101 })).rejects.toMatchObject({
      message:
        'page: Input should be greater than or equal to 1; limit: Input should be less than or equal to 100',
      status: 422,
    });
  });

  it('passes on string details such as a rate limit, a refused account or a missing post', async () => {
    fetchMock.mockImplementationOnce(async () =>
      json(429, { detail: 'Rate limit exceeded. Try again in 12 seconds.', retry_after: 12 }),
    );
    await expect(real.LacesAPI.getBalance()).rejects.toMatchObject({
      message: 'Rate limit exceeded. Try again in 12 seconds.',
      status: 429,
    });

    fetchMock.mockImplementationOnce(async () => json(403, { detail: 'Inactive user' }));
    await expect(real.LacesAPI.getOpportunities()).rejects.toMatchObject({ message: 'Inactive user', status: 403 });

    fetchMock.mockImplementationOnce(async () => json(404, { detail: 'Post not found' }));
    await expect(real.LacesAPI.boostPost('c10a93fc-f96c-4ea3-85e3-d2224a8bd97b')).rejects.toMatchObject({
      message: 'Post not found',
      status: 404,
    });
  });

  it('says what failed, with the status, when the answer carries no detail', async () => {
    fetchMock.mockImplementationOnce(async () => new Response('Internal Server Error', { status: 500 }));
    await expect(real.LacesAPI.getLedger()).rejects.toMatchObject({
      message: 'Could not load your transactions (HTTP 500)',
      status: 500,
    });

    fetchMock.mockImplementationOnce(async () => json(503, { detail: '   ' }));
    await expect(real.LacesAPI.claimStipend()).rejects.toMatchObject({
      message: 'Could not claim the daily stipend (HTTP 503)',
      status: 503,
    });
  });

  it('gives a readable error, not "Failed to fetch", when the API cannot be reached', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));

    await expect(real.LacesAPI.claimStipend()).rejects.toMatchObject({
      message: 'Could not reach the server. Check your connection and try again.',
      status: 0,
    });
  });

  it('gives a readable error when a successful answer is not JSON', async () => {
    fetchMock.mockImplementationOnce(async () => new Response('<html>gateway</html>', { status: 200 }));

    await expect(real.LacesAPI.getBalance()).rejects.toMatchObject({
      message: "Could not load your LACES balance: the server's answer could not be read",
      status: 200,
    });
  });
});
