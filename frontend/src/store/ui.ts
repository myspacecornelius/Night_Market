import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type ViewMode = 'card' | 'table';

interface UiState {
  isSidebarOpen: boolean;
  toggleSidebar: () => void;
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      // Original state
      isSidebarOpen: true,
      toggleSidebar: () => set((state) => ({ isSidebarOpen: !state.isSidebarOpen })),

      // New state
      viewMode: 'card',
      setViewMode: (mode) => set({ viewMode: mode }),
    }),
    {
      name: 'ui-preferences-storage', // unique name for localStorage key
    }
  )
);
