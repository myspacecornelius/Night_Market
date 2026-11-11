import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type ViewMode = 'card' | 'table';

interface UiState {
  /** The navigation drawer on screens too narrow for the sidebar. */
  isMobileNavOpen: boolean;
  /** Called by the menu button in the top bar, which only exists on narrow screens. */
  toggleSidebar: () => void;
  closeMobileNav: () => void;
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      isMobileNavOpen: false,
      toggleSidebar: () => set((state) => ({ isMobileNavOpen: !state.isMobileNavOpen })),
      closeMobileNav: () => set({ isMobileNavOpen: false }),

      viewMode: 'card',
      setViewMode: (mode) => set({ viewMode: mode }),
    }),
    {
      name: 'ui-preferences-storage', // unique name for localStorage key
      // Only preferences are remembered. Whether the drawer is open right now is not one.
      partialize: (state) => ({ viewMode: state.viewMode }),
    }
  )
);
