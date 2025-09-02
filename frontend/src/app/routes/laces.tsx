import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/Skeleton';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { Coins, TrendingUp, Gift, Zap, Clock, Trophy } from 'lucide-react';
import { Laces } from '@/lib/api-experiments';

interface LacesBalance {
  balance: number;
  user_id: string;
  last_stipend?: string;
  total_earned: number;
  total_spent: number;
}

interface LacesTransaction {
  id: string;
  amount: number;
  transaction_type: string;
  related_post_id?: string;
  created_at: string;
  description?: string;
}

interface LacesLedger {
  transactions: LacesTransaction[];
  total_count: number;
  page: number;
  limit: number;
}

interface EarningOpportunity {
  type: string;
  reward: string | number;
  description: string;
}

interface Opportunities {
  opportunities: EarningOpportunity[];
  daily_stipend_claimed: boolean;
  posts_today: number;
  checkins_today: number;
}

export default function Laces() {
  const queryClient = useQueryClient();

  // Fetch balance data
  const { data: balance, isLoading: balanceLoading } = useQuery<LacesBalance>({
    queryKey: ['laces', 'balance'],
    queryFn: () => Laces.getBalance(),
    refetchInterval: 30000, // Refetch every 30 seconds
  });

  // Fetch transaction history
  const { data: ledger, isLoading: ledgerLoading } = useQuery<LacesLedger>({
    queryKey: ['laces', 'ledger'],
    queryFn: () => Laces.getLedger({ limit: 20 }),
  });

  // Fetch earning opportunities
  const { data: opportunities, isLoading: opportunitiesLoading } = useQuery<Opportunities>({
    queryKey: ['laces', 'opportunities'],
    queryFn: () => Laces.getOpportunities(),
    refetchInterval: 60000, // Refetch every minute
  });

  // Claim daily stipend mutation
  const claimStipendMutation = useMutation({
    mutationFn: () => Laces.claimStipend(),
    onSuccess: (data) => {
      toast.success(data.message || 'Daily stipend claimed! +100 LACES');
      queryClient.invalidateQueries({ queryKey: ['laces'] });
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to claim stipend');
    },
  });

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const getTransactionIcon = (type: string) => {
    switch (type) {
      case 'DAILY_STIPEND':
        return <Gift className="h-4 w-4 text-green-500" />;
      case 'BOOST_SENT':
        return <TrendingUp className="h-4 w-4 text-red-500" />;
      case 'BOOST_RECEIVED':
        return <TrendingUp className="h-4 w-4 text-green-500" />;
      case 'SIGNAL_REWARD':
        return <Trophy className="h-4 w-4 text-yellow-500" />;
      default:
        return <Coins className="h-4 w-4 text-gray-500" />;
    }
  };

  const getOpportunityIcon = (type: string) => {
    switch (type) {
      case 'daily_stipend':
        return <Gift className="h-5 w-5 text-green-500" />;
      case 'helpful_post':
        return <Zap className="h-5 w-5 text-blue-500" />;
      case 'dropzone_checkin':
        return <Trophy className="h-5 w-5 text-yellow-500" />;
      default:
        return <Coins className="h-5 w-5 text-gray-500" />;
    }
  };

  if (balanceLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-2">
          <Coins className="h-6 w-6" />
          <h1 className="text-2xl font-bold">LACES Wallet</h1>
        </div>
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Coins className="h-6 w-6" />
        <h1 className="text-2xl font-bold">LACES Wallet</h1>
      </div>

      {/* Balance Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Coins className="h-5 w-5" />
            Balance
          </CardTitle>
          <CardDescription>Your current LACES token balance</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-center">
            <div className="text-4xl font-bold text-primary">{balance?.balance || 0}</div>
            <div className="text-sm text-muted-foreground">LACES</div>
          </div>
          
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="text-center">
              <div className="text-green-600 font-semibold">{balance?.total_earned || 0}</div>
              <div className="text-muted-foreground">Total Earned</div>
            </div>
            <div className="text-center">
              <div className="text-red-600 font-semibold">{balance?.total_spent || 0}</div>
              <div className="text-muted-foreground">Total Spent</div>
            </div>
          </div>

          {balance?.last_stipend && (
            <div className="text-xs text-muted-foreground text-center">
              Last stipend: {formatDate(balance.last_stipend)}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Earning Opportunities */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Earning Opportunities
          </CardTitle>
          <CardDescription>Ways to earn more LACES</CardDescription>
        </CardHeader>
        <CardContent>
          {opportunitiesLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : (
            <div className="space-y-3">
              {opportunities?.opportunities.map((opportunity, index) => (
                <div key={index} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center gap-3">
                    {getOpportunityIcon(opportunity.type)}
                    <div>
                      <div className="font-medium">{opportunity.description}</div>
                      <div className="text-sm text-muted-foreground">
                        +{opportunity.reward} LACES
                      </div>
                    </div>
                  </div>
                  {opportunity.type === 'daily_stipend' && (
                    <Button
                      size="sm"
                      onClick={() => claimStipendMutation.mutate()}
                      disabled={claimStipendMutation.isPending || opportunities.daily_stipend_claimed}
                    >
                      {claimStipendMutation.isPending ? 'Claiming...' : 
                       opportunities.daily_stipend_claimed ? 'Claimed' : 'Claim'}
                    </Button>
                  )}
                </div>
              ))}

              {(!opportunities?.opportunities || opportunities.opportunities.length === 0) && (
                <div className="text-center text-muted-foreground py-4">
                  <Clock className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>All opportunities completed for today!</p>
                  <p className="text-sm">Check back tomorrow for more.</p>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Transaction History */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Transaction History
          </CardTitle>
          <CardDescription>Your recent LACES transactions</CardDescription>
        </CardHeader>
        <CardContent>
          {ledgerLoading ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {ledger?.transactions.map((transaction) => (
                <div key={transaction.id} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center gap-3">
                    {getTransactionIcon(transaction.transaction_type)}
                    <div>
                      <div className="font-medium">
                        {transaction.description || transaction.transaction_type.replace('_', ' ')}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {formatDate(transaction.created_at)}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`font-semibold ${transaction.amount > 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {transaction.amount > 0 ? '+' : ''}{transaction.amount}
                    </div>
                    <Badge variant={transaction.amount > 0 ? 'default' : 'secondary'} className="text-xs">
                      {transaction.transaction_type.toLowerCase().replace('_', ' ')}
                    </Badge>
                  </div>
                </div>
              ))}

              {(!ledger?.transactions || ledger.transactions.length === 0) && (
                <div className="text-center text-muted-foreground py-8">
                  <Coins className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>No transactions yet</p>
                  <p className="text-sm">Start earning LACES to see your transaction history!</p>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Quick Stats */}
      <Card>
        <CardHeader>
          <CardTitle>Today's Activity</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 text-center">
            <div>
              <div className="text-2xl font-bold text-blue-600">{opportunities?.posts_today || 0}</div>
              <div className="text-sm text-muted-foreground">Posts Shared</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-yellow-600">{opportunities?.checkins_today || 0}</div>
              <div className="text-sm text-muted-foreground">Zone Check-ins</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
