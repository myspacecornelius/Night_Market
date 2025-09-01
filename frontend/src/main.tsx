import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { Toaster } from 'sonner';

import { ThemeProvider } from './components/ThemeProvider';
import { WebSocketProvider } from './components/WebSocketProvider';
import FloatingActionButton from './components/FloatingActionButton';
import './globals.css';
import router from './routes';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      refetchOnWindowFocus: false,
    },
  },
});

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider defaultTheme="system" storageKey="dharma-ui-theme">
      <WebSocketProvider>
        <QueryClientProvider client={queryClient}>
          <div className="relative theme-transition">
            <RouterProvider router={router} />
            <FloatingActionButton />
            <Toaster 
              position="top-right" 
              richColors 
              expand
              toastOptions={{
                className: 'glass-card border-earth-200 dark:border-earth-700',
                style: {
                  background: 'rgba(255, 255, 255, 0.9)',
                  backdropFilter: 'blur(12px)',
                },
              }}
            />
          </div>
          <ReactQueryDevtools initialIsOpen={false} />
        </QueryClientProvider>
      </WebSocketProvider>
    </ThemeProvider>
  </React.StrictMode>
);
