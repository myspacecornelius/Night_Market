'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createPost } from '../lib/api';
import { Loader2 } from 'lucide-react';

interface PostComposerProps {
  cellId: string;
  onSuccess?: () => void;
}

export function PostComposer({ cellId, onSuccess }: PostComposerProps) {
  const [body, setBody] = useState('');
  const queryClient = useQueryClient();
  
  const mutation = useMutation({
    mutationFn: (postBody: string) => 
      createPost({ body: postBody, cell_id: cellId }),
    onSuccess: () => {
      setBody('');
      queryClient.invalidateQueries({ queryKey: ['feed', cellId] });
      onSuccess?.();
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedBody = body.trim();
    
    if (!trimmedBody) return;
    
    mutation.mutate(trimmedBody);
  };

  const charCount = body.length;
  const isOverLimit = charCount > 400;
  const showWarning = charCount > 280;

  return (
    <form onSubmit={handleSubmit} className="w-full">
      <div className="relative">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Share drop intel, W/L, sightings..."
          className="w-full p-4 border border-gray-300 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          rows={3}
          disabled={mutation.isPending}
          aria-label="Post content"
        />
        <div className="absolute bottom-2 right-2 text-sm">
          <span className={`${showWarning ? (isOverLimit ? 'text-red-500' : 'text-yellow-500') : 'text-gray-400'}`}>
            {charCount}
          </span>
          <span className="text-gray-400">/400</span>
        </div>
      </div>
      
      <div className="mt-2 flex justify-between items-center">
        <span className="text-xs text-gray-500">
          Posting to cell: {cellId}
        </span>
        <button
          type="submit"
          disabled={mutation.isPending || !body.trim() || isOverLimit}
          className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
        >
          {mutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
          {mutation.isPending ? 'Posting...' : 'Post'}
        </button>
      </div>
      
      {mutation.isError && (
        <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-red-600 text-sm">
          Failed to create post. Please try again.
        </div>
      )}
    </form>
  );
}
