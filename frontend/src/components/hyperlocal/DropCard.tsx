
import React from 'react';
import { drops } from '@/mocks/drops';

// Define the type for a single drop
export type Drop = typeof drops[0];

interface DropCardProps {
  drop: Drop;
}

const DropCard: React.FC<DropCardProps> = ({ drop }) => {
  return (
    <div className="bg-card border rounded-lg p-4 shadow-sm">
      <div className="flex justify-between items-center">
        <span className="font-bold text-lg">{drop.retailer}</span>
        <span className="text-sm text-muted-foreground">{drop.sku}</span>
      </div>
      <p className="my-2">{drop.name}</p>
      <div className="flex justify-between items-center text-sm">
        <span>{new Date(drop.time).toLocaleString()}</span>
        <div className="flex items-center gap-2">
          <span>Difficulty:</span>
          <span className="font-semibold">{drop.diffMeter}</span>
        </div>
      </div>
    </div>
  );
};

export default DropCard;
