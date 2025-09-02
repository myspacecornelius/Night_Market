import { NavLink } from 'react-router-dom'
import { Home, Map, Zap, User, Droplets, Route, Rss, Calendar, ClipboardList } from 'lucide-react'
import { useUiStore } from '@/store/ui'
import { cn } from '@/lib/cn'
import { Stack } from '@/components/layout/Stack'

const links = [
  { to: '/', label: 'Dashboard', icon: Home },
  { to: '/laces', label: 'LACES', icon: Zap },
  { to: '/dropzones', label: 'DropZones', icon: Droplets },
  { to: '/thriftroutes', label: 'ThriftRoutes', icon: Route },
  { to: '/profile', label: 'Profile', icon: User },
  { to: '/feed', label: 'Feed', icon: Rss },
  { to: '/map', label: 'Map', icon: Map },
  { to: '/drops', label: 'Drops', icon: Calendar },
  { to: '/quests', label: 'Quests', icon: ClipboardList },
  { to: '/gallery', label: 'UI Gallery', icon: Rss },
]

export const Sidebar = () => {
  const { isSidebarOpen } = useUiStore()

  return (
    <aside
      className={cn(
        'relative hidden h-screen w-64 bg-card shadow-md transition-all duration-300 md:block',
        !isSidebarOpen && 'w-20',
      )}
    >
      <Stack className="p-4">
        <h1 className={cn('text-2xl font-bold', !isSidebarOpen && 'text-center')}>
          {isSidebarOpen ? 'Dharma' : 'D'}
        </h1>
      </Stack>
      <nav className="mt-4">
        <ul>
          {links.map((link) => (
            <li key={link.to}>
              <NavLink
                to={link.to}
                end={link.to === '/'}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-4 rounded-lg p-4 text-foreground hover:bg-muted',
                    isActive && 'bg-primary/10 text-primary',
                    !isSidebarOpen && 'justify-center',
                  )
                }
              >
                <link.icon className="h-5 w-5" />
                <span className={cn(!isSidebarOpen && 'hidden')}>{link.label}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  )
}
