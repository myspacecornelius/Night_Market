import { ReactElement, ReactNode } from 'react'
import { render, RenderOptions } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { AuthContextType, MockAuthProvider } from '@/hooks/useAuth'
import { WebSocketContext, WebSocketContextType } from '@/lib/websocket'

type ProvidersOptions = {
  route?: string
  auth?: Partial<AuthContextType>
  webSocket?: Partial<WebSocketContextType>
} & Omit<RenderOptions, 'wrapper'>

const defaultAuth: AuthContextType = {
  user: {
    user_id: '00000000-0000-0000-0000-000000000000',
    username: 'test_user',
    display_name: 'Test User',
    email: 'test@example.com',
    laces_balance: 1200,
    is_verified: true,
    avatar_url: undefined,
    bio: '',
    location: '',
    created_at: new Date().toISOString(),
  },
  isAuthenticated: true,
  isLoading: false,
  login: async () => {},
  register: async () => {},
  logout: () => {},
  refreshUser: async () => {},
}

const defaultWebSocket: WebSocketContextType = {
  socket: null,
  isConnected: false,
  lastMessage: null,
  sendMessage: () => {},
  subscribe: () => () => {},
}

export function renderWithProviders(
  ui: ReactElement,
  { route = '/', auth = {}, webSocket = {}, ...renderOptions }: ProvidersOptions = {}
) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        refetchOnWindowFocus: false,
      },
    },
  })

  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <MockAuthProvider value={{ ...defaultAuth, ...auth }}>
        <WebSocketContext.Provider value={{ ...defaultWebSocket, ...webSocket }}>
          <MemoryRouter initialEntries={[route]}>{children}</MemoryRouter>
        </WebSocketContext.Provider>
      </MockAuthProvider>
    </QueryClientProvider>
  )

  return render(ui, { wrapper: Wrapper, ...renderOptions })
}
