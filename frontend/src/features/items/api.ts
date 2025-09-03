import { QueryKey, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

// --- Types ---
export interface Item {
    id: string;
    name: string;
    status: 'active' | 'inactive' | 'archived';
    metric: number;
    createdAt: string;
}

export interface PaginatedItemsResponse {
    items: Item[];
    total: number;
    page: number;
    limit: number;
}

export interface GetItemsParams {
    query?: string;
    status?: string;
    from?: string;
    to?: string;
    page?: number;
    limit?: number;
}

// --- Mock API Fetch Functions ---
const mockItems: Item[] = Array.from({ length: 100 }, (_, i) => ({
    id: `item-${i + 1}`,
    name: `Dharma Initiative Drop ${i + 1}`,
    status: (['active', 'inactive', 'archived'] as const)[i % 3],
    metric: Math.floor(Math.random() * 1000),
    createdAt: new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString(),
}));

export const getItems = async (params: GetItemsParams): Promise<PaginatedItemsResponse> => {
    // TODO: Remove mock delay for production
    await new Promise(resolve => setTimeout(resolve, 750)); // Simulate network delay

    let filteredItems = [...mockItems];

    if (params.query) {
        filteredItems = filteredItems.filter(item => item.name.toLowerCase().includes(params.query!.toLowerCase()));
    }
    if (params.status) {
        filteredItems = filteredItems.filter(item => item.status === params.status);
    }

    const page = params.page || 1;
    const limit = params.limit || 10;
    const start = (page - 1) * limit;
    const end = start + limit;
    const paginatedItems = filteredItems.slice(start, end);

    return {
        items: paginatedItems,
        total: filteredItems.length,
        page,
        limit,
    };
};

export const getItem = async (id: string): Promise<Item> => {
    // TODO: Remove mock delay for production
    await new Promise(resolve => setTimeout(resolve, 500));
    const item = mockItems.find(i => i.id === id);
    if (!item) throw new Error('Item not found');
    return item;
};

export const patchItem = async (item: Partial<Item> & { id: string }): Promise<Item> => {
    const { id, ...payload } = item;
    // TODO: Remove mock delay for production
    await new Promise(resolve => setTimeout(resolve, 600));

    const itemIndex = mockItems.findIndex(i => i.id === id);
    if (itemIndex === -1) throw new Error('Item not found to patch');

    const updatedItem = { ...mockItems[itemIndex], ...payload };
    mockItems[itemIndex] = updatedItem;

    return updatedItem;
};

// --- React Query Hooks ---
export const useGetItems = (params: GetItemsParams) => {
    const queryKey: QueryKey = ['items', params];
    return useQuery({
        queryKey,
        queryFn: () => getItems(params),
        placeholderData: (previousData) => previousData,
        retry: 1,
    });
};

export const useGetItem = (id: string | null) => {
    return useQuery({
        queryKey: ['item', id],
        queryFn: () => getItem(id!),
        enabled: !!id,
    });
};

export const usePatchItem = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: patchItem,
        onMutate: async (newItemData) => {
            // Optimistically update the list
            const listQueryKey: QueryKey = ['items'];
            await queryClient.cancelQueries({ queryKey: listQueryKey, exact: false });

            const previousLists = queryClient.getQueriesData<PaginatedItemsResponse>({ queryKey: listQueryKey });

            previousLists.forEach(([queryKey, previousData]) => {
                if (previousData) {
                    const newItems = previousData.items.map(item =>
                        item.id === newItemData.id ? { ...item, ...newItemData } : item
                    );
                    queryClient.setQueryData(queryKey, { ...previousData, items: newItems });
                }
            });

            // Optimistically update the detail view if it's cached
            const detailQueryKey: QueryKey = ['item', newItemData.id];
            const previousDetail = queryClient.getQueryData<Item>(detailQueryKey);
            if (previousDetail) {
                queryClient.setQueryData(detailQueryKey, { ...previousDetail, ...newItemData });
            }

            toast.success('Item updated!');
            return { previousLists, previousDetail, detailQueryKey };
        },
        onError: (err, newItemData, context) => {
            toast.error(`Failed to update item: ${err.message}`);
            // Rollback on error
            if (context?.previousLists) {
                context.previousLists.forEach(([queryKey, previousData]) => {
                    queryClient.setQueryData(queryKey, previousData);
                });
            }
            if (context?.previousDetail) {
                queryClient.setQueryData(context.detailQueryKey, context.previousDetail);
            }
        },
        onSettled: (data, error, variables) => {
            // Invalidate queries to refetch from server and ensure consistency
            queryClient.invalidateQueries({ queryKey: ['items'] });
            queryClient.invalidateQueries({ queryKey: ['item', variables.id] });
        },
    });
};