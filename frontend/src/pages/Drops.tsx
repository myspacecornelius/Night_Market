
import React from 'react';
import WarRoomPane from '@/components/hyperlocal/WarRoomPane';

const Drops = () => {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Drops</h1>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="md:col-span-2">
          <div className="border rounded-lg p-4 bg-muted h-96 flex items-center justify-center">
            <p className="text-muted-foreground">Calendar component will be here.</p>
          </div>
        </div>
        <div>
          <WarRoomPane />
        </div>
      </div>
    </div>
  );
};

export default Drops;
