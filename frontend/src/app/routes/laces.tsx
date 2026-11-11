import { useEffect, useRef, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { UseQueryResult } from '@tanstack/react-query';
import { CircleAlert, CircleCheck, Clock, Coins, Gift, TrendingUp, Trophy, Zap } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/Skeleton';
import { useAuth } from '@/hooks/useAuth';
import { LacesAPI } from '@/lib/api/laces';
import type {
  EarningOpportunity,
  EarningOpportunityType,
  LacesLedgerParams,
  LacesTransaction,
  LacesTransactionType,
  Opportunities,
} from '@/lib/api/laces';

const LACES_KEY = ['laces'] as const;
const BALANCE_KEY = ['laces', 'balance'] as const;
const OPPORTUNITIES_KEY = ['laces', 'opportunities'] as const;

/**
 * Query keys of the other pages that show the LACES balance or what was earned: the dashboard
 * (dashboard.tsx), the profile and its stats (profile.tsx) and the LACES leaderboard
 * (leaderboard.tsx). They are read again after a claim, so no page shows the old balance.
 */
const OTHER_BALANCE_KEYS = [['dashboard'], ['profile'], ['leaderboard']] as const;

/**
 * How often the balance and the ledger page on screen are read again. Both change when
 * LACES arrive from elsewhere (a boost received, a reward, another device), and they are
 * refreshed together so the ledger does not fall behind the balance shown above it.
 */
const WALLET_REFRESH_MS = 30_000;
const OPPORTUNITIES_REFRESH_MS = 60_000;

const PAGE_SIZE = 20;
const ALL_TYPES = 'ALL';
type TypeFilter = LacesTransactionType | typeof ALL_TYPES;

/** The transaction types offered in the ledger filter, with the label shown for each. */
const TYPE_FILTERS: { value: LacesTransactionType; label: string }[] = [
  { value: 'DAILY_STIPEND', label: 'Daily stipend' },
  { value: 'BOOST_SENT', label: 'Boost sent' },
  { value: 'BOOST_RECEIVED', label: 'Boost received' },
  { value: 'SIGNAL_REWARD', label: 'Signal reward' },
  { value: 'POST_REWARD', label: 'Post reward' },
  { value: 'CHECKIN_REWARD', label: 'Check-in reward' },
  { value: 'QUEST_REWARD', label: 'Quest reward' },
  { value: 'CONTEST_REWARD', label: 'Contest reward' },
  { value: 'PURCHASE', label: 'Purchase' },
  { value: 'REFUND', label: 'Refund' },
  { value: 'ADMIN_ADD', label: 'Admin credit' },
  { value: 'ADMIN_REMOVE', label: 'Admin debit' },
];

function typeLabel(type: string): string {
  const known = TYPE_FILTERS.find((option) => option.value === type);
  if (known) return known.label;
  const words = type.toLowerCase().replaceAll('_', ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

const numberFormat = new Intl.NumberFormat('en-US');

function formatLaces(amount: number): string {
  return numberFormat.format(amount);
}

function formatSigned(amount: number): string {
  return `${amount > 0 ? '+' : ''}${numberFormat.format(amount)}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString();
}

function rewardLabel(opportunity: EarningOpportunity): string {
  if (typeof opportunity.reward === 'number') return `+${formatLaces(opportunity.reward)} LACES`;
  // A bare amount or range ("10-30") is a number of LACES; anything else already reads as a phrase.
  return /^\d+(\s*-\s*\d+)?$/.test(opportunity.reward)
    ? `+${opportunity.reward} LACES`
    : opportunity.reward;
}

function opportunityIcon(type: EarningOpportunityType) {
  switch (type) {
    case 'daily_stipend':
      return <Gift className="h-5 w-5 text-green-500" aria-hidden="true" />;
    case 'post_boosts':
      return <Zap className="h-5 w-5 text-blue-500" aria-hidden="true" />;
    case 'dropzone_checkin':
      return <Trophy className="h-5 w-5 text-yellow-500" aria-hidden="true" />;
    default:
      return <Coins className="h-5 w-5 text-gray-500" aria-hidden="true" />;
  }
}

function transactionIcon(transaction: LacesTransaction) {
  switch (transaction.transaction_type) {
    case 'DAILY_STIPEND':
      return <Gift className="h-4 w-4 text-green-500" aria-hidden="true" />;
    case 'BOOST_SENT':
      return <TrendingUp className="h-4 w-4 text-red-500" aria-hidden="true" />;
    case 'BOOST_RECEIVED':
      return <TrendingUp className="h-4 w-4 text-green-500" aria-hidden="true" />;
    case 'SIGNAL_REWARD':
    case 'POST_REWARD':
    case 'CHECKIN_REWARD':
    case 'QUEST_REWARD':
    case 'CONTEST_REWARD':
      return <Trophy className="h-4 w-4 text-yellow-500" aria-hidden="true" />;
    default:
      return <Coins className="h-4 w-4 text-gray-500" aria-hidden="true" />;
  }
}

function LoadingRows({ label, rows, rowClassName }: { label: string; rows: number; rowClassName: string }) {
  return (
    <div role="status" aria-label={label} className="space-y-2">
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} className={rowClassName} />
      ))}
    </div>
  );
}

function ErrorNotice({
  title,
  error,
  retryLabel,
  onRetry,
  isRetrying,
}: {
  title: string;
  error: Error;
  retryLabel: string;
  onRetry: () => void;
  isRetrying: boolean;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-destructive/40 p-3 sm:flex-row sm:items-center sm:justify-between">
      <div role="alert" className="flex items-start gap-3">
        <CircleAlert className="mt-0.5 h-5 w-5 shrink-0 text-destructive" aria-hidden="true" />
        <div>
          <p className="font-medium">{title}</p>
          <p className="text-sm text-muted-foreground">{error.message}</p>
        </div>
      </div>
      <Button variant="outline" size="sm" aria-label={retryLabel} onClick={onRetry} disabled={isRetrying}>
        Retry
      </Button>
    </div>
  );
}

function BalanceCard() {
  const balanceQuery = useQuery({
    queryKey: BALANCE_KEY,
    queryFn: () => LacesAPI.getBalance(),
    refetchInterval: WALLET_REFRESH_MS,
  });
  const balance = balanceQuery.data;

  return (
    <Card role="region" aria-labelledby="laces-balance-heading">
      <CardHeader>
        <CardTitle id="laces-balance-heading" className="flex items-center gap-2">
          <Coins className="h-5 w-5" aria-hidden="true" />
          Balance
        </CardTitle>
        <CardDescription>Your current LACES token balance</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {balanceQuery.isError && (
          <ErrorNotice
            title={
              balance
                ? 'Could not refresh your balance. Showing the last loaded values.'
                : 'Could not load your balance'
            }
            error={balanceQuery.error}
            retryLabel="Retry loading balance"
            onRetry={() => void balanceQuery.refetch()}
            isRetrying={balanceQuery.isFetching}
          />
        )}

        {balance ? (
          <>
            <div className="text-center">
              <div className="text-4xl font-bold text-primary">{formatLaces(balance.balance)}</div>
              <div className="text-sm text-muted-foreground">LACES</div>
            </div>

            <dl className="grid grid-cols-2 gap-4 text-sm">
              <div className="flex flex-col-reverse text-center">
                <dt className="text-muted-foreground">Total Earned</dt>
                <dd className="text-green-600 font-semibold">{formatLaces(balance.total_earned)}</dd>
              </div>
              <div className="flex flex-col-reverse text-center">
                <dt className="text-muted-foreground">Total Spent</dt>
                <dd className="text-red-600 font-semibold">{formatLaces(balance.total_spent)}</dd>
              </div>
            </dl>

            <p className="text-xs text-muted-foreground text-center">
              {balance.last_stipend ? (
                <>
                  Last stipend: <time dateTime={balance.last_stipend}>{formatDate(balance.last_stipend)}</time>
                </>
              ) : (
                'No daily stipend claimed yet'
              )}
            </p>
          </>
        ) : (
          balanceQuery.isPending && <LoadingRows label="Loading balance" rows={1} rowClassName="h-32 w-full" />
        )}
      </CardContent>
    </Card>
  );
}

function OpportunitiesCard({ opportunitiesQuery }: { opportunitiesQuery: UseQueryResult<Opportunities> }) {
  const queryClient = useQueryClient();
  const { refreshUser } = useAuth();
  const opportunities = opportunitiesQuery.data;

  const claimStipend = useMutation({
    mutationFn: () => LacesAPI.claimStipend(),
    onSuccess: () => {
      // The stipend is granted: take the claim off the list now instead of waiting for the refetch.
      queryClient.setQueryData<Opportunities>(
        OPPORTUNITIES_KEY,
        (current) =>
          current && {
            ...current,
            daily_stipend_claimed: true,
            opportunities: current.opportunities.filter((item) => item.type !== 'daily_stipend'),
          },
      );
      void queryClient.invalidateQueries({ queryKey: LACES_KEY });
      // The balance is also shown on other pages and on the signed-in user.
      for (const queryKey of OTHER_BALANCE_KEYS) {
        void queryClient.invalidateQueries({ queryKey });
      }
      // The claim itself succeeded, so a failed profile refresh is not an error to report here.
      refreshUser().catch(() => undefined);
    },
    onError: () => {
      // For example the stipend was already granted (another tab, or the daily distribution):
      // show what the server holds now.
      void queryClient.invalidateQueries({ queryKey: LACES_KEY });
    },
  });

  // The outcome of a claim belongs to the day it was made. When the API offers the stipend
  // again (a new UTC day began while the page stayed open), yesterday's confirmation or
  // "already claimed" message must not sit next to today's claim button.
  const claimedToday = opportunities?.daily_stipend_claimed;
  const wasClaimed = useRef(claimedToday);
  const resetClaim = claimStipend.reset;
  useEffect(() => {
    if (wasClaimed.current === true && claimedToday === false) resetClaim();
    wasClaimed.current = claimedToday;
  }, [claimedToday, resetClaim]);

  return (
    <Card role="region" aria-labelledby="laces-opportunities-heading">
      <CardHeader>
        <CardTitle id="laces-opportunities-heading" className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5" aria-hidden="true" />
          Earning Opportunities
        </CardTitle>
        <CardDescription>Ways to earn more LACES</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {opportunitiesQuery.isError && (
          <ErrorNotice
            title={
              opportunities
                ? 'Could not refresh earning opportunities. Showing the last loaded list.'
                : 'Could not load earning opportunities'
            }
            error={opportunitiesQuery.error}
            retryLabel="Retry loading earning opportunities"
            onRetry={() => void opportunitiesQuery.refetch()}
            isRetrying={opportunitiesQuery.isFetching}
          />
        )}

        {opportunities ? (
          <>
            {opportunities.daily_stipend_claimed && (
              <div className="flex items-center justify-between gap-3 p-3 border rounded-lg">
                <div className="flex items-center gap-3">
                  <CircleCheck className="h-5 w-5 text-green-500" aria-hidden="true" />
                  <div>
                    <div className="font-medium">Daily stipend claimed today</div>
                    <div className="text-sm text-muted-foreground">The next one unlocks at 00:00 UTC</div>
                  </div>
                </div>
                <Badge variant="secondary">Claimed</Badge>
              </div>
            )}

            {opportunities.opportunities.length > 0 ? (
              <ul className="space-y-3">
                {opportunities.opportunities.map((opportunity) => (
                  <li
                    key={opportunity.type}
                    className="flex items-center justify-between gap-3 p-3 border rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      {opportunityIcon(opportunity.type)}
                      <div>
                        <div className="font-medium">{opportunity.description}</div>
                        <div className="text-sm text-muted-foreground">{rewardLabel(opportunity)}</div>
                      </div>
                    </div>
                    {opportunity.type === 'daily_stipend' && (
                      <Button
                        size="sm"
                        onClick={() => claimStipend.mutate()}
                        disabled={claimStipend.isPending}
                      >
                        {claimStipend.isPending ? 'Claiming...' : 'Claim stipend'}
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <div className="text-center text-muted-foreground py-4">
                <Clock className="h-8 w-8 mx-auto mb-2 opacity-50" aria-hidden="true" />
                <p>No earning opportunities right now</p>
                <p className="text-sm">Check back tomorrow for more.</p>
              </div>
            )}
          </>
        ) : (
          opportunitiesQuery.isPending && (
            <LoadingRows label="Loading earning opportunities" rows={2} rowClassName="h-12 w-full" />
          )
        )}

        {/* Always mounted so screen readers announce the confirmation when it appears. */}
        <div role="status" className={claimStipend.isSuccess ? 'text-sm text-green-600' : 'sr-only'}>
          {claimStipend.isSuccess &&
            `${claimStipend.data.message} New balance: ${formatLaces(claimStipend.data.new_balance)} LACES.`}
        </div>
        {claimStipend.isError && (
          <p role="alert" className="text-sm text-destructive">
            {claimStipend.error.message}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function LedgerCard() {
  const [page, setPage] = useState(1);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>(ALL_TYPES);

  const params: LacesLedgerParams =
    typeFilter === ALL_TYPES
      ? { page, limit: PAGE_SIZE }
      : { page, limit: PAGE_SIZE, transaction_type: typeFilter };

  const ledgerQuery = useQuery({
    queryKey: ['laces', 'ledger', params],
    queryFn: () => LacesAPI.getLedger(params),
    placeholderData: keepPreviousData,
    refetchInterval: WALLET_REFRESH_MS,
  });
  const ledger = ledgerQuery.data;
  // The previous page or filter stays on screen, dimmed, while the requested one loads.
  const isSwitching = ledgerQuery.isPlaceholderData;
  const totalPages = ledger ? Math.max(1, Math.ceil(ledger.total_count / ledger.limit)) : 1;

  const changeFilter = (value: string) => {
    const match = TYPE_FILTERS.find((option) => option.value === value);
    setTypeFilter(match ? match.value : ALL_TYPES);
    setPage(1);
  };

  return (
    <Card role="region" aria-labelledby="laces-ledger-heading">
      <CardHeader>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-1.5">
            <CardTitle id="laces-ledger-heading" className="flex items-center gap-2">
              <Clock className="h-5 w-5" aria-hidden="true" />
              Transaction History
            </CardTitle>
            <CardDescription>Your LACES transactions, newest first</CardDescription>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="laces-ledger-type">Transaction type</Label>
            <select
              id="laces-ledger-type"
              value={typeFilter}
              onChange={(event) => changeFilter(event.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:w-56"
            >
              <option value={ALL_TYPES}>All types</option>
              {TYPE_FILTERS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {ledgerQuery.isError && (
          <ErrorNotice
            title={
              ledger
                ? 'Could not refresh your transactions. Showing the last loaded page.'
                : 'Could not load your transactions'
            }
            error={ledgerQuery.error}
            retryLabel="Retry loading transactions"
            onRetry={() => void ledgerQuery.refetch()}
            isRetrying={ledgerQuery.isFetching}
          />
        )}

        {ledger ? (
          <>
            {ledger.transactions.length > 0 ? (
              <ul className={`space-y-2 ${isSwitching ? 'opacity-60' : ''}`} aria-busy={isSwitching}>
                {ledger.transactions.map((transaction) => (
                  <li
                    key={transaction.id}
                    className="flex items-center justify-between gap-3 p-3 border rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      {transactionIcon(transaction)}
                      <div>
                        <div className="font-medium">
                          {transaction.description ?? typeLabel(transaction.transaction_type)}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          <time dateTime={transaction.created_at}>{formatDate(transaction.created_at)}</time>
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div
                        className={`font-semibold ${transaction.amount > 0 ? 'text-green-600' : 'text-red-600'}`}
                      >
                        {formatSigned(transaction.amount)}
                      </div>
                      <Badge variant={transaction.amount > 0 ? 'default' : 'secondary'} className="text-xs">
                        {typeLabel(transaction.transaction_type)}
                      </Badge>
                      {transaction.balance_after !== null && (
                        <div className="mt-1 text-xs text-muted-foreground">
                          Balance after: {formatLaces(transaction.balance_after)}
                        </div>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="text-center text-muted-foreground py-8">
                <Coins className="h-8 w-8 mx-auto mb-2 opacity-50" aria-hidden="true" />
                {typeFilter !== ALL_TYPES ? (
                  <>
                    <p>No {typeLabel(typeFilter).toLowerCase()} transactions</p>
                    <Button variant="link" size="sm" onClick={() => changeFilter(ALL_TYPES)}>
                      Show all types
                    </Button>
                  </>
                ) : page > 1 ? (
                  <p>No transactions on this page</p>
                ) : (
                  <>
                    <p>No transactions yet</p>
                    <p className="text-sm">Start earning LACES to see your transaction history!</p>
                  </>
                )}
              </div>
            )}
          </>
        ) : (
          ledgerQuery.isPending && <LoadingRows label="Loading transactions" rows={5} rowClassName="h-16 w-full" />
        )}

        {/* Also shown when a later page failed to load, so the user can still go back. */}
        {((ledger && ledger.total_count > 0) || page > 1) && (
          <nav aria-label="Transaction pages" className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <p className="text-sm text-muted-foreground">
              {ledger ? (
                <>
                  Page {formatLaces(ledger.page)} of {formatLaces(totalPages)} ·{' '}
                  {formatLaces(ledger.total_count)} {ledger.total_count === 1 ? 'transaction' : 'transactions'}
                </>
              ) : (
                <>Page {formatLaces(page)}</>
              )}
            </p>
            {(totalPages > 1 || page > 1) && (
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  disabled={page <= 1 || isSwitching}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((current) => current + 1)}
                  disabled={!ledger || page >= totalPages || isSwitching}
                >
                  Next
                </Button>
              </div>
            )}
          </nav>
        )}
      </CardContent>
    </Card>
  );
}

function ActivityCard({ opportunitiesQuery }: { opportunitiesQuery: UseQueryResult<Opportunities> }) {
  const opportunities = opportunitiesQuery.data;

  return (
    <Card role="region" aria-labelledby="laces-activity-heading">
      <CardHeader>
        <CardTitle id="laces-activity-heading">Today's Activity</CardTitle>
        <CardDescription>Counted since 00:00 UTC</CardDescription>
      </CardHeader>
      <CardContent>
        {opportunities ? (
          <dl className="grid grid-cols-2 gap-4 text-center">
            <div className="flex flex-col-reverse">
              <dt className="text-sm text-muted-foreground">Posts Shared</dt>
              <dd className="text-2xl font-bold text-blue-600">{formatLaces(opportunities.posts_today)}</dd>
            </div>
            <div className="flex flex-col-reverse">
              <dt className="text-sm text-muted-foreground">Zone Check-ins</dt>
              <dd className="text-2xl font-bold text-yellow-600">{formatLaces(opportunities.checkins_today)}</dd>
            </div>
          </dl>
        ) : opportunitiesQuery.isError ? (
          <ErrorNotice
            title="Could not load today's activity"
            error={opportunitiesQuery.error}
            retryLabel="Retry loading today's activity"
            onRetry={() => void opportunitiesQuery.refetch()}
            isRetrying={opportunitiesQuery.isFetching}
          />
        ) : (
          <LoadingRows label="Loading today's activity" rows={1} rowClassName="h-14 w-full" />
        )}
      </CardContent>
    </Card>
  );
}

export default function LacesPage() {
  const opportunitiesQuery = useQuery({
    queryKey: OPPORTUNITIES_KEY,
    queryFn: () => LacesAPI.getOpportunities(),
    refetchInterval: OPPORTUNITIES_REFRESH_MS,
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Coins className="h-6 w-6" aria-hidden="true" />
        <h1 className="text-2xl font-bold">LACES Wallet</h1>
      </div>

      <BalanceCard />
      <OpportunitiesCard opportunitiesQuery={opportunitiesQuery} />
      <LedgerCard />
      <ActivityCard opportunitiesQuery={opportunitiesQuery} />
    </div>
  );
}
