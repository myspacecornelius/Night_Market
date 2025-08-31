
import React from 'react';
import DropCard from '@/components/hyperlocal/DropCard';
import { drops } from '@/mocks/drops';

const Feed = () => {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Hyperlocal Feed</h1>
      <div>
        {/* TODO: Add radius slider and filter chips */}
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {drops.map(drop => (
          <DropCard key={drop.id} drop={drop} />
        ))}
      </div>
    </div>
  );
};

export default Feed;
