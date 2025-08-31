import React from 'react';

interface EmptyStateProps {
    onAddItem: () => void;
}

const EmptyState: React.FC<EmptyStateProps> = ({ onAddItem }) => {
    return (
        <div className="flex flex-col items-center justify-center p-4">
            <svg
                className="h-12 w-12 text-gray-400"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
            >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            <h2 className="mt-2 text-lg font-medium text-gray-700">No items found</h2>
            <p className="mt-1 text-sm text-gray-500">Try adding a new item.</p>
            <button
                onClick={onAddItem}
                className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
                Add Item
            </button>
        </div>
    );
};

export default EmptyState;
