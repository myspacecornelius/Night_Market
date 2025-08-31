import { Button } from '@/components/ui/Button';
import * as Dialog from '@radix-ui/react-dialog';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, X } from 'lucide-react';
import React from 'react';
import type { Item } from '../api';
import { useGetItem, usePatchItem } from '../api';

interface ItemDrawerProps {
    itemId: string | null;
    onClose: () => void;
}

const DetailRow: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
    <div className="py-3 sm:grid sm:grid-cols-3 sm:gap-4">
        <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">{label}</dt>
        <dd className="mt-1 text-sm text-gray-900 dark:text-white sm:mt-0 sm:col-span-2">{value}</dd>
    </div>
);

export const ItemDrawer: React.FC<ItemDrawerProps> = ({ itemId, onClose }) => {
    const { data: item, isLoading, isError, error, refetch } = useGetItem(itemId);
    const patchItemMutation = usePatchItem();

    const handleStatusChange = (newStatus: Item['status']) => {
        if (!item) return;
        patchItemMutation.mutate({ id: item.id, status: newStatus });
    };

    return (
        <Dialog.Root open={!!itemId} onOpenChange={(open) => !open && onClose()}>
            <AnimatePresence>
                {!!itemId && (
                    <Dialog.Portal forceMount>
                        <Dialog.Overlay asChild>
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: 0.2 }}
                                className="fixed inset-0 bg-black/50 z-40"
                            />
                        </Dialog.Overlay>
                        <Dialog.Content asChild>
                            <motion.div
                                initial={{ x: '100%' }}
                                animate={{ x: '0%' }}
                                exit={{ x: '100%' }}
                                transition={{ duration: 0.2, ease: 'easeInOut' }}
                                className="fixed top-0 right-0 h-full w-full max-w-md bg-white dark:bg-gray-800 z-50 shadow-2xl flex flex-col"
                            >
                                <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
                                    <Dialog.Title className="text-lg font-semibold text-gray-900 dark:text-white">
                                        Item Details
                                    </Dialog.Title>
                                    <Dialog.Close asChild>
                                        <button className="p-1 rounded-full text-gray-500 hover:bg-gray-200 dark:text-gray-400 dark:hover:bg-gray-700">
                                            <X className="w-5 h-5" />
                                        </button>
                                    </Dialog.Close>
                                </div>

                                <div className="flex-1 overflow-y-auto p-6">
                                    {isLoading && <DrawerSkeleton />}
                                    {isError && (
                                        <div className="text-center text-red-500">
                                            <AlertTriangle className="mx-auto h-12 w-12 text-red-400" />
                                            <h3 className="mt-2 text-sm font-medium text-red-800 dark:text-red-300">
                                                Error loading item
                                            </h3>
                                            <p className="mt-1 text-sm text-red-700 dark:text-red-400">
                                                {error instanceof Error ? error.message : 'An unknown error occurred'}
                                            </p>
                                            <div className="mt-4">
                                                <Button onClick={() => refetch()}>Retry</Button>
                                            </div>
                                        </div>
                                    )}
                                    {item && (
                                        <dl>
                                            <DetailRow label="ID" value={item.id} />
                                            <DetailRow label="Name" value={item.name} />
                                            <DetailRow label="Status" value={
                                                <select
                                                    value={item.status}
                                                    onChange={(e) => handleStatusChange(e.target.value as Item['status'])}
                                                    className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white dark:focus:ring-blue-500 dark:focus:border-blue-500"
                                                >
                                                    <option value="active">Active</option>
                                                    <option value="inactive">Inactive</option>
                                                    <option value="archived">Archived</option>
                                                </select>
                                            } />
                                            <DetailRow label="Metric" value={item.metric.toLocaleString()} />
                                            <DetailRow label="Created At" value={new Date(item.createdAt).toLocaleString()} />
                                        </dl>
                                    )}
                                </div>
                            </motion.div>
                        </Dialog.Content>
                    </Dialog.Portal>
                )}
            </AnimatePresence>
        </Dialog.Root>
    );
};

const DrawerSkeleton: React.FC = () => (
    <div className="animate-pulse">
        <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-3/4 mb-6"></div>
        {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="py-3 grid grid-cols-3 gap-4">
                <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded col-span-1"></div>
                <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded col-span-2"></div>
            </div>
        ))}
    </div>
);
