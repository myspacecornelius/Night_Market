
import React from 'react';
import QuestCard from '@/components/hyperlocal/QuestCard';
import { quests } from '@/mocks/quests';

const Quests = () => {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Quest Board</h1>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {quests.map(quest => (
          <QuestCard key={quest.id} quest={quest} />
        ))}
      </div>
    </div>
  );
};

export default Quests;
