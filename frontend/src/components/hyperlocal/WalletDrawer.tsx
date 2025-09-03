
import React from 'react';
import { wallet } from '@/mocks/wallet';
import {
  Sheet, 
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/Button';
import { Wallet } from 'lucide-react';

const WalletDrawer = () => {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline"> 
        <Wallet className="mr-2 h-4 w-4" />
        Open Wallet
        </Button>
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Wallet</SheetTitle>
        </SheetHeader>
        <div className="py-4">
          <div className="text-2xl font-bold">{wallet.balance} Coins</div>
          <div className="mt-4">
            <h3 className="font-semibold">Boosts</h3>
            <ul>
              {wallet.boosts.map(boost => (
                <li key={boost.id}>{boost.name}</li>
              ))}
            </ul>
          </div>
          <div className="mt-4">
            <h3 className="font-semibold">Bounties</h3>
            <ul>
              {wallet.bounties.map(bounty => (
                <li key={bounty.id}>{bounty.description}</li>
              ))}
            </ul>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default WalletDrawer;
