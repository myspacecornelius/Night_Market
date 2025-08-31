
import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const WarRoomPane = () => {
  return (
    <div className="bg-card border rounded-lg p-4 shadow-sm h-full flex flex-col">
      <h2 className="text-lg font-bold">War Room</h2>
      <div className="mt-4">
        <h3 className="font-semibold">Status</h3>
        <div className="flex gap-2 mt-2">
          <span className="inline-block bg-green-500 text-white text-xs px-2 rounded-full">Live</span>
          <span className="inline-block bg-yellow-500 text-white text-xs px-2 rounded-full">10 mins left</span>
        </div>
      </div>
      <div className="mt-4">
        <h3 className="font-semibold">Checklist</h3>
        <ul className="list-disc list-inside">
          <li>Enter raffle</li>
          <li>Confirm entry</li>
          <li>Wait for results</li>
        </ul>
      </div>
      <div className="mt-4 flex-1 flex flex-col">
        <h3 className="font-semibold">Chat</h3>
        <div className="flex-1 mt-2 border rounded-lg p-2 overflow-y-auto">
          <p className="text-sm">[2:30 PM] User1: Good luck everyone!</p>
          <p className="text-sm">[2:31 PM] User2: You too!</p>
        </div>
        <div className="mt-2 flex gap-2">
          <Input placeholder="Type a message..." />
          <Button>Send</Button>
        </div>
      </div>
    </div>
  );
};

export default WarRoomPane;
