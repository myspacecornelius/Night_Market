import { createBrowserRouter } from 'react-router-dom'
import AppShell from '../components/AppShell'
import Home from '../pages/Home'
import Laces from '../pages/Laces'
import Heatmap from '../pages/Heatmap'
import ThriftRoute from '../pages/ThriftRoute'
import Profile from '../pages/Profile'
import Dropzones from '../pages/Dropzones'

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <Home /> },
      { path: 'laces', element: <Laces /> },
      { path: 'heatmap', element: <Heatmap /> },
      { path: 'thriftroute', element: <ThriftRoute /> },
      { path: 'profile', element: <Profile /> },
      { path: 'dropzones', element: <Dropzones /> },
    ]
  }
])
