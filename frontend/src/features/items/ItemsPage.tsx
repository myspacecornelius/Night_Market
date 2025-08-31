import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, LayoutGrid, List, Search } from 'lucide-react';
import React, { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useDebounce } from 'use-debounce';

import { Button } from '@/components/ui/Button';
import { useUiStore } from '@/store/ui';
import { useGetItems } from './api';
import { ItemCard, ItemCardSkeleton } from './components/ItemCard';
import { ItemDrawer } from './components/ItemDrawer';
import { ItemTable } from './components/ItemTable';

const ItemsPage: React.FC = () => {
    const [searchParams, setSearchParams] = useSearchParams();
    const { viewMode, setViewMode } = useUiStore();

    const [selectedItemId, setSelectedItemId] = useState<string | null>(null);

    // Filter state
    const query = searchParams.get('query') || '';
    const status = searchParams.get('status') || '';
    const [debouncedQuery] = useDebounce(query, 300);

    const apiParams = useMemo(() => ({
        query: debouncedQuery,
        status: status || undefined,
        page: 1, // Add pagination later
        limit: 20,
    }), [debouncedQuery, status]);

    const { data, isLoading, isError, error, refetch } = useGetItems(apiParams);

    const handleFilterChange = (key: string, value: string) => {
        setSearchParams(prev => {
            if (value) {
                prev.set(key, value);
            } else {
                prev.delete(key);
            }
            return prev;
        });
    };

    const items = data?.items || [];

    const renderContent = () => {
        if (isLoading) {
            if (viewMode === 'card') {
                return (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                        {Array.from({ length: 8 }).map((_, i) => <ItemCardSkeleton key={i} />)}
                    </div>
                );
            }
            return <ItemTable items={[]} isLoading={true} onRowClick={() => { }} />;
        }

        if (isError) {
            return (
                <div className="flex flex-col items-center justify-center text-center py-12">
                    <AlertTriangle className="h-16 w-16 text-red-400" />
                    <h2 className="mt-4 text-xl font-semibold text-red-800 dark:text-red-300">Failed to load items</h2>
                    <p className="mt-2 text-gray-600 dark:text-gray-400">
                        {error instanceof Error ? error.message : 'An unexpected error occurred.'}
                    </p>
                    <Button onClick={() => refetch()} className="mt-6">
                        Try Again
                    </Button>
                </div>
            );
        }

        if (items.length === 0) {
            return (
                <div className="text-center py-12">
                    <h2 className="text-xl font-semibold">No items found</h2>
                    <p className="mt-2 text-gray-600 dark:text-gray-400">
                        Try adjusting your filters or creating a new item.
                    </p>
                </div>
            );
        }

        return viewMode === 'card' ? (
            <motion.div layout className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                <AnimatePresence>
                    {items.map(item => <ItemCard key={item.id} item={item} onSelect={() => setSelectedItemId(item.id)} />)}
                </AnimatePresence>
            </motion.div>
        ) : (
            <ItemTable items={items} isLoading={false} onRowClick={(item) => setSelectedItemId(item.id)} />
        );
    };

    return (
        <div className="space-y-6">
            <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 flex flex-col sm:flex-row items-center gap-4">
                <div className="relative w-full sm:w-auto sm:flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                    <input
                        type="text"
                        placeholder="Search items..."
                        value={query}
                        onChange={(e) => handleFilterChange('query', e.target.value)}
                        className="pl-10 pr-4 py-2 w-full border border-gray-300 dark:border-gray-600 rounded-md bg-gray-50 dark:bg-gray-700 focus:ring-2 focus:ring-blue-500"
                    />
                </div>
                <select
                    value={status}
                    onChange={(e) => handleFilterChange('status', e.target.value)}
                    className="w-full sm:w-auto border border-gray-300 dark:border-gray-600 rounded-md bg-gray-50 dark:bg-gray-700 p-2 focus:ring-2 focus:ring-blue-500"
                >
                    <option value="">All Statuses</option>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                    <option value="archived">Archived</option>
                </select>
                <div className="flex items-center bg-gray-100 dark:bg-gray-700 p-1 rounded-md">
                    <button
                        onClick={() => setViewMode('card')}
                        className={`p-2 rounded ${viewMode === 'card' ? 'bg-white dark:bg-gray-800 shadow' : ''}`}
                        aria-label="Card view"
                    >
                        <LayoutGrid className="h-5 w-5" />
                    </button>
                    <button
                        onClick={() => setViewMode('table')}
                        className={`p-2 rounded ${viewMode === 'table' ? 'bg-white dark:bg-gray-800 shadow' : ''}`}
                        aria-label="Table view"
                    >
                        <List className="h-5 w-5" />
                    </button>
                </div>
            </div>

            {renderContent()}

            <ItemDrawer itemId={selectedItemId} onClose={() => setSelectedItemId(null)} />
        </div>
    );
};

export default ItemsPage;
