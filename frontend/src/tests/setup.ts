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
    logout: vi.fn(),
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
