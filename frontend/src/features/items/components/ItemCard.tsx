import { Button } from '@/components/ui/Button'; // Assuming you have a button component from Radix/shadcn
import { motion } from 'framer-motion';
import { MoreHorizontal } from 'lucide-react';
import React from 'react';
import type { Item } from '../api';

interface ItemCardProps {
    item: Item;
    onSelect: (item: Item) => void;
}

const StatusPill: React.FC<{ status: Item['status'] }> = ({ status }) => {
    const statusStyles = {
        active: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
        inactive: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
        archived: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300',
    };
    return (
        <span
            className={`px-2 py-1 text-xs font-medium rounded-full ${statusStyles[status]}`}
        >
            {status.charAt(0).toUpperCase() + status.slice(1)}
        </span>
    );
};

const TinySparkline: React.FC = () => (
    <svg
        className="w-full h-8 text-gray-300 dark:text-gray-600"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 100 30"
        preserveAspectRatio="none"
    >
        <path
            d="M 0 20 C 10 25, 20 10, 30 15 S 50 0, 60 5 s 20 25, 30 20 s 10 -10, 10 -10"
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
        />
    </svg>
);

export const ItemCard: React.FC<ItemCardProps> = ({ item, onSelect }) => {
    return (
        <motion.div
            layout
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.15 }}
            className="bg-white dark:bg-gray-800 rounded-lg shadow-md overflow-hidden border border-gray-200 dark:border-gray-700"
        >
            <div className="p-4">
                <div className="flex justify-between items-start">
                    <h3 className="font-semibold text-gray-900 dark:text-white pr-2">{item.name}</h3>
                    <StatusPill status={item.status} />
                </div>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                    ID: {item.id}
                </p>
            </div>
            <div className="px-4">
                <TinySparkline />
            </div>
            <div className="p-4">
                <div className="text-2xl font-bold text-gray-900 dark:text-white">
                    {item.metric.toLocaleString()}
                </div>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                    Performance Metric
                </p>
            </div>
            <div className="p-4 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-200 dark:border-gray-700">
                <Button variant="outline" size="sm" className="w-full" onClick={() => onSelect(item)}>
                    <MoreHorizontal className="w-4 h-4 mr-2" />
                    View Details
                </Button>
            </div>
        </motion.div>
    );
};

export const ItemCardSkeleton: React.FC = () => {
    return (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md overflow-hidden border border-gray-200 dark:border-gray-700">
            <div className="p-4">
                <div className="flex justify-between items-start">
                    <div className="h-5 w-3/4 bg-gray-200 dark:bg-gray-700 rounded" />
                    <div className="h-5 w-16 bg-gray-200 dark:bg-gray-700 rounded-full" />
                </div>
                <div className="h-4 w-1/2 bg-gray-200 dark:bg-gray-700 rounded mt-2" />
            </div>
            <div className="px-4 h-8" />
            <div className="p-4">
                <div className="h-8 w-1/3 bg-gray-200 dark:bg-gray-700 rounded" />
                <div className="h-4 w-1/2 bg-gray-200 dark:bg-gray-700 rounded mt-2" />
            </div>
            <div className="p-4 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-200 dark:border-gray-700">
                <div className="h-9 w-full bg-gray-200 dark:bg-gray-700 rounded" />
            </div>
        </div>
    );
};
