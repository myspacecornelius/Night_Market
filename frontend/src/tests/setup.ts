import '@testing-library/jest-dom';
import { vi } from 'vitest';
import React from 'react';

class IntersectionObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}

if (typeof window !== 'undefined') {
  if (!('IntersectionObserver' in window)) {
    // @ts-ignore
    window.IntersectionObserver = IntersectionObserverMock;
  }

  if (!('matchMedia' in window)) {
    // @ts-ignore
    window.matchMedia = () => ({
      matches: false,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
      onchange: null,
      media: '',
    });
  }

  if (!('ResizeObserver' in window)) {
    class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    // @ts-ignore
    window.ResizeObserver = ResizeObserver;
  }
}

vi.mock('@/lib/api-client', () => {
  const mockUser = {
    user_id: '00000000-0000-0000-0000-000000000000',
    username: 'test_user',
    display_name: 'Test User',
    email: 'test@example.com',
    laces_balance: 1200,
    is_verified: true,
    created_at: new Date().toISOString(),
  };

  const mockApiClient = {
    login: vi.fn(async () => ({ access_token: 'test-token', token_type: 'bearer' })),
    getCurrentUser: vi.fn(async () => mockUser),
    healthCheck: vi.fn(async () => ({ healthy: true, data: {} })),
    getDashboardMetrics: vi.fn(async () => ({
      lacesBalance: 1200,
      lacesEarnedToday: 40,
      lacesEarnedThisWeek: 90,
      lacesEarnedLastWeek: 60,
      weeklyGrowth: 50,
      activeSignals: 7,
      nearbyActivity: null,
      communityRank: 2,
      totalUsers: 31,
      totalViews: 12,
      signalsPosted: 3,
      checkIns: 1,
      updatedAt: new Date().toISOString(),
    })),
    getDashboardActivity: vi.fn(async () => ({
      items: [
        {
          id: 'post-1',
          type: 'signal',
          postType: 'SPOTTED',
          message: 'Restock on the wall at the Newbury St store',
          createdAt: new Date().toISOString(),
          boostScore: 0,
          views: 4,
          replies: 0,
          isOwn: false,
          user: { username: 'sole_scout', avatar: null },
        },
      ],
      total: 1,
      offset: 0,
      limit: 10,
      filter: 'global',
    })),
    getDashboardTimeseries: vi.fn(async (days: number) =>
      Array.from({ length: days }, (_, i) => ({
        date: `2026-01-${String(i + 1).padStart(2, '0')}`,
        signals: i,
        posts: 0,
        laces: 0,
      })),
    ),
    logout: vi.fn(),
    register: vi.fn(async () => mockUser),
    changePassword: vi.fn(async () => ({ message: 'Password changed', other_sessions_ended: 0 })),
  };

  return {
    apiClient: mockApiClient,
    default: mockApiClient,
  };
});

vi.mock('react-leaflet', async () => {
  const actual = await vi.importActual<typeof import('react-leaflet')>('react-leaflet')
  const mapMock = {
    getCenter: () => ({ lat: 0, lng: 0 }),
    getZoom: () => 10,
    getBounds: () => ({
      getNorth: () => 0,
      getSouth: () => 0,
      getEast: () => 0,
      getWest: () => 0,
    }),
    setView: () => {},
  };

  const MockElement = ({ children }: { children?: React.ReactNode }) =>
    React.createElement('div', null, children)

  return {
    ...actual,
    MapContainer: ({ children }: { children: React.ReactNode }) =>
      React.createElement('div', { 'data-testid': 'map-container' }, children),
    TileLayer: () => null,
    Circle: MockElement,
    Marker: MockElement,
    Popup: MockElement,
    Rectangle: MockElement,
    useMap: () => mapMock,
    useMapEvents: () => mapMock,
  }
});
