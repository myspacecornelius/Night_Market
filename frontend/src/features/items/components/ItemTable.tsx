
import type { ColumnDef, SortingState } from '@tanstack/react-table';
import {
    flexRender,
    getCoreRowModel,
    getSortedRowModel,
    useReactTable,
} from '@tanstack/react-table';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowUpDown, ChevronRight } from 'lucide-react';
import React, { useMemo } from 'react';
import type { Item } from '../api';

interface ItemTableProps {
    items: Item[];
    isLoading: boolean;
    onRowClick: (item: Item) => void;
}

const StatusCell: React.FC<{ status: Item['status'] }> = ({ status }) => {
    const statusStyles = {
        active: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
        inactive: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
        archived: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300',
    };
    return (
        <span className={`px-2 py-1 text-xs font-medium rounded-full ${statusStyles[status]}`}>
            {status.charAt(0).toUpperCase() + status.slice(1)}
        </span>
    );
};

export const ItemTable: React.FC<ItemTableProps> = ({ items, isLoading, onRowClick }) => {
    const [sorting, setSorting] = React.useState<SortingState>([]);
    const [error, setError] = React.useState<string | null>(null);

    React.useEffect(() => {
        // Example of setting an error
        // setError("Failed to load data."); // Uncomment to simulate an error
    }, []);

    const columns = useMemo<ColumnDef<Item>[]>(
        () => [
            {
                accessorKey: 'name',
                header: ({ column }) => (
                    <button
                        className="flex items-center gap-2"
                        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
                    >
                        Name
                        {column.getIsSorted() === 'asc' ? (
                            <ArrowUpDown className="h-4 w-4 rotate-180" />
                        ) : column.getIsSorted() === 'desc' ? (
                            <ArrowUpDown className="h-4 w-4" />
                        ) : (
                            <ArrowUpDown className="h-4 w-4 opacity-50" />
                        )}
                    </button>
                ),
                cell: ({ row }) => <div className="font-medium">{row.original.name}</div>,
            },
            {
                accessorKey: 'status',
                header: 'Status',
                cell: ({ row }) => <StatusCell status={row.original.status} />,
            },
            {
                accessorKey: 'metric',
                header: ({ column }) => (
                    <button
                        className="flex items-center gap-2"
                        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
                    >
                        Metric <ArrowUpDown className="h-4 w-4" />
                    </button>
                ),
                cell: ({ row }) => <div className="text-right">{row.original.metric.toLocaleString()}</div>,
            },
            {
                accessorKey: 'createdAt',
                header: 'Created At',
                cell: ({ row }) => new Date(row.original.createdAt).toLocaleDateString(),
            },
            {
                id: 'expander',
                header: () => null,
                cell: ({ row }) => (
                    <button
                        aria-label={`Expand row for ${row.original.name}`}
                        onClick={() => onRowClick(row.original)}
                        className="p-1 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700"
                    >
                        <ChevronRight className="h-4 w-4" />
                    </button>
                ),
            },
        ],
        [onRowClick]
    );

    const table = useReactTable({
        data: items,
        columns,
        state: { sorting },
        onSortingChange: setSorting,
        getCoreRowModel: getCoreRowModel(),
        getSortedRowModel: getSortedRowModel(),
    });

    if (isLoading) {
        return <ItemTableSkeleton />;
    }

    return (
        <div className="overflow-x-auto bg-white dark:bg-gray-800 rounded-lg shadow-md border border-gray-200 dark:border-gray-700">
            <table className="min-w-full text-sm text-left text-gray-500 dark:text-gray-400">
                <thead className="text-xs text-gray-700 uppercase bg-gray-50 dark:bg-gray-700 dark:text-gray-400 sticky top-0">
                    {table.getHeaderGroups().map((headerGroup) => (
                        <tr key={headerGroup.id}>
                            {headerGroup.headers.map((header) => (
                                <th
                                    key={header.id}
                                    scope="col"
                                    className="px-6 py-3"
                                    aria-sort={
                                        header.column.getCanSort()
                                            ? (header.column.getIsSorted() === 'asc'
                                                ? 'ascending'
                                                : header.column.getIsSorted() === 'desc'
                                                    ? 'descending'
                                                    : 'none')
                                            : undefined
                                    }
                                >
                                    {header.isPlaceholder
                                        ? null
                                        : flexRender(header.column.columnDef.header, header.getContext())}
                                </th>
                            ))}
                        </tr>
                    ))}
                </thead>
                <tbody>
                    <AnimatePresence>
                        {table.getRowModel().rows.map((row) => (
                            <motion.tr
                                key={row.id}
                                layout
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: 0.2 }}
                                className="bg-white dark:bg-gray-800 border-b dark:border-gray-700 transition-colors duration-200 hover:bg-gray-300 dark:hover:bg-gray-600 cursor-pointer"
                                onClick={() => onRowClick(row.original)}
                                tabIndex={0}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                        onRowClick(row.original);
                                    }
                                }}
                            >
                                {row.getVisibleCells().map((cell) => (
                                    <td key={cell.id} className="px-6 py-4">
                                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                    </td>
                                ))}
                            </motion.tr>
                        ))}
                    </AnimatePresence>
                </tbody>
            </table>
        </div>
    );
};

const ItemTableSkeleton: React.FC = () => {
    return (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md border border-gray-200 dark:border-gray-700 p-4">
            <div className="space-y-4">
                <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-full"></div>
                {Array.from({ length: 10 }).map((_, i) => (
                    <div key={i} className="h-10 bg-gray-200 dark:bg-gray-700 rounded w-full"></div>
                ))}
            </div>
        </div>
    );
};
