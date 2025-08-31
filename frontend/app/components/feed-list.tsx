'use client';

import { useQuery } from '@tanstack/react-query';
import { getFeed } from '../lib/api';
import { Loader2, MapPin } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface FeedListProps {
  cellId: string;
  radiusKm: number;
}

interface FeedItem {
  id: string;
  body: string;
  created_at: string;
  score?: number;
  user?: {
    id: string;
    username: string;
  };
  cell_id?: string;
}

export function FeedList({ cellId, radiusKm }: FeedListProps) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['feed', cellId, radiusKm],
    queryFn: () => getFeed(cellId, radiusKm),
    refetchInterval: 30000, // Refetch every 30 seconds
  });

  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8">
        <p className="text-red-500 mb-2">Failed to load feed</p>
        <button
          onClick={() => refetch()}
          className="text-blue-500 hover:underline"
        >
          Try again
        </button>
      </div>
    );
  }

  const items = data?.items || [];

  if (items.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        <p className="mb-2">No posts in this area yet</p>
        <p className="text-sm">Be the first to share something!</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {items.map((item: FeedItem) => (
        <article
          key={item.id}
          className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
        >
          <div className="flex items-start justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="font-medium text-gray-900">
                {item.user?.username || 'Anonymous'}
              </span>
              <span className="text-gray-500 text-sm">
                · {formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}
              </span>
            </div>
            {item.cell_id && (
              <div className="flex items-center gap-1 text-gray-400 text-xs">
                <MapPin className="w-3 h-3" />
                <span>{item.cell_id}</span>
              </div>
            )}
          </div>
          
          <p className="text-gray-800 whitespace-pre-wrap break-words">
            {item.body}
          </p>
          
          {item.score !== undefined && (
            <div className="mt-2 text-sm text-gray-500">
              Score: {item.score}
            </div>
          )}
        </article>
      ))}
      
      {data?.next && (
        <div className="text-center py-4">
          <button
            className="text-blue-500 hover:underline"
            onClick={() => {
              // TODO: Implement pagination
              console.log('Load more:', data.next);
            }}
          >
            Load more
          </button>
        </div>
      )}
    </div>
  );
}
