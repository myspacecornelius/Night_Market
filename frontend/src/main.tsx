import React from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { Toaster } from 'sonner'

import router from './routes'
import './index.css'
import { ThemeProvider } from './components/ThemeProvider'
import { AuthProvider } from './hooks/useAuth'

console.log('🔥 Dharma - Starting the underground network...')

const root = document.getElementById('root')

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 60 * 1000,
    },
    mutations: {
      retry: 0,
    },
  },
})

if (!root) {
  throw new Error('Root element not found')
}

console.log('✅ Root element found, initializing React...')

try {
  const reactRoot = createRoot(root)
  
  reactRoot.render(
    <React.StrictMode>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <ThemeProvider defaultTheme="dark" storageKey="dharma-theme">
            <RouterProvider router={router} />
            <Toaster position="top-right" />
          </ThemeProvider>
        </AuthProvider>
        {import.meta.env.DEV ? <ReactQueryDevtools initialIsOpen={false} position="bottom-right" /> : null}
      </QueryClientProvider>
    </React.StrictMode>
  )
  
  console.log('🚀 Dharma successfully mounted!')
} catch (error) {
  console.error('❌ Failed to mount Dharma:', error)
  root.innerHTML = `
    <div style="
      display: flex; 
      align-items: center; 
      justify-content: center; 
      min-height: 100vh; 
      font-family: system-ui;
      background: linear-gradient(135deg, #0a0b0d 0%, #1a1d23 25%, #0f1419 75%, #000000 100%);
      color: #f8fafc;
    ">
      <div style="text-align: center; max-width: 500px; padding: 40px;">
        <h1 style="font-size: 48px; margin-bottom: 16px;">🔥</h1>
        <h2 style="margin: 0 0 16px 0; font-size: 32px;">Dharma Error</h2>
        <p style="margin: 0 0 20px 0; color: rgba(248,250,252,0.7);">
          Failed to initialize the underground network
        </p>
        <pre style="
          background: rgba(0,0,0,0.3); 
          padding: 20px; 
          border-radius: 8px; 
          text-align: left; 
          overflow: auto; 
          font-size: 14px;
          border: 1px solid rgba(255,255,255,0.1);
        ">${error.message}</pre>
      </div>
    </div>
  `
}
