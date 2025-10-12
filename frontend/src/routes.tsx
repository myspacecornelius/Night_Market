import React, { lazy, Suspense } from 'react';
import { createBrowserRouter } from 'react-router-dom';

// Existing Pages
const AppShell = lazy(() => import('./layouts/AppShell'));
const Dashboard = lazy(() => import('@/app/routes/dashboard'));
const Heatmap = lazy(() => import('@/pages/Heatmap'));
const Laces = lazy(() => import('@/pages/Laces'));
const Dropzones = lazy(() => import('@/pages/Dropzones'));
const ThriftRoutes = lazy(() => import('@/pages/ThriftRoutes'));
const Profile = lazy(() => import('@/app/routes/profile'));
const LoginPage = lazy(() => import('@/pages/LoginPage'));
const NotFound = lazy(() => import('@/pages/NotFound'));
const ProtectedRoute = lazy(() => import('./auth/ProtectedRoute'));

// New Pages for Hyperlocal Social UI
const Feed = lazy(() => import('@/pages/Feed'));
const Map = lazy(() => import('@/pages/Map'));
const Drops = lazy(() => import('@/pages/Drops'));
const Quests = lazy(() => import('@/pages/Quests'));
const UiGallery = lazy(() => import('@/pages/UiGallery'));
const Shop = lazy(() => import('@/pages/Shop'));
const Tasks = lazy(() => import('@/pages/Tasks'));


// New Components
import ItemsPage from './features/items/ItemsPage';
import DataAppShell from './layouts/DataAppShell';

const SimpleDashboard: React.FC = () => (
  <div className="text-center">
    <h1 className="text-2xl font-bold">Welcome</h1>
    <p>Select a page from the sidebar.</p>
  </div>
);

const router = createBrowserRouter([
  {
    path: '/',
    element: (
      <Suspense fallback={<div>Loading...</div>}>
        <ProtectedRoute>
          <AppShell />
        </ProtectedRoute>
      </Suspense>
    ),
    errorElement: <NotFound />,
    children: [
      { index: true, element: <Dashboard /> },
      { path: 'heatmap', element: <Heatmap /> },
      { path: 'laces', element: <Laces /> },
      { path: 'dropzones', element: <Dropzones /> },
      { path: 'thriftroutes', element: <ThriftRoutes /> },
      { path: 'profile', element: <Profile /> },
      { path: 'feed', element: <Feed /> },
      { path: 'map', element: <Map /> },
      { path: 'drops', element: <Drops /> },
      { path: 'quests', element: <Quests /> },
      { path: 'gallery', element: <UiGallery /> },
      { path: 'shop', element: <Shop /> },
      { path: 'tasks', element: <Tasks /> },
    ],
  },
  {
    path: '/data', // New route group for our data views
    element: (
      <Suspense fallback={<div>Loading...</div>}>
        <ProtectedRoute>
          <DataAppShell />
        </ProtectedRoute>
      </Suspense>
    ),
    children: [
      { index: true, element: <SimpleDashboard /> },
      { path: 'items', element: <ItemsPage /> },
    ],
  },
  {
    path: '/login',
    element: (
      <Suspense fallback={<div>Loading...</div>}>
        <LoginPage />
      </Suspense>
    ),
  },
]);

export default router;
