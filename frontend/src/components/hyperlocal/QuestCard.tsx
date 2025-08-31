
import React from 'react';
import { quests } from '@/mocks/quests';
import { Button } from '@/components/ui/button';

// Define the type for a single quest
export type Quest = typeof quests[0];

interface QuestCardProps {
  quest: Quest;
}

const QuestCard: React.FC<QuestCardProps> = ({ quest }) => {
  return (
    <div className="bg-card border rounded-lg p-4 shadow-sm">
      <p className="my-2">{quest.description}</p>
      <div className="flex justify-between items-center text-sm">
        <span>Reward: {quest.reward} coins</span>
        <Button>Accept</Button>
      </div>
    </div>
  );
};

export default QuestCard;
