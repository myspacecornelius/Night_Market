import { useEffect } from 'react'
import { NavLink } from 'react-router-dom'
import { Home, Map, Zap, User, Droplets, Route, Rss, Calendar, ClipboardList, Flame, Trophy } from 'lucide-react'
import { useUiStore } from '@/store/ui'
import { cn } from '@/lib/cn'
import { Stack } from '@/components/layout/Stack'

const links = [
  { to: '/', label: 'Dashboard', icon: Home },
  { to: '/laces', label: 'LACES', icon: Zap },
  { to: '/dropzones', label: 'DropZones', icon: Droplets },
  { to: '/heatmap', label: 'Heatmap', icon: Flame },
  { to: '/leaderboard', label: 'Leaderboard', icon: Trophy },
  { to: '/thriftroutes', label: 'ThriftRoutes', icon: Route },
  { to: '/profile', label: 'Profile', icon: User },
  { to: '/feed', label: 'Feed', icon: Rss },
  { to: '/map', label: 'Map', icon: Map },
  { to: '/drops', label: 'Drops', icon: Calendar },
  { to: '/quests', label: 'Quests', icon: ClipboardList },
  { to: '/gallery', label: 'UI Gallery', icon: Rss },
]

const Navigation = ({ onNavigate }: { onNavigate?: () => void }) => (
  <>
    <Stack className="p-4">
      <p className="text-2xl font-bold">Dharma</p>
    </Stack>
    <nav className="mt-4" aria-label="Main">
      <ul>
        {links.map((link) => (
          <li key={link.to}>
            <NavLink
              to={link.to}
              end={link.to === '/'}
              onClick={onNavigate}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-4 rounded-lg p-4 text-foreground hover:bg-muted',
                  isActive && 'bg-primary/10 text-primary',
                )
              }
            >
              <link.icon className="h-5 w-5" aria-hidden="true" />
              <span>{link.label}</span>
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  </>
)

export const Sidebar = () => {
  const { isMobileNavOpen, closeMobileNav } = useUiStore()

  useEffect(() => {
    if (!isMobileNavOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeMobileNav()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isMobileNavOpen, closeMobileNav])

  return (
    <>
      {/* Wide screens: always there. */}
      <aside
        aria-label="Sidebar"
        className="relative hidden h-screen w-64 shrink-0 overflow-y-auto bg-card shadow-md md:block"
      >
        <Navigation />
      </aside>

      {/* Narrow screens: a drawer opened by the menu button in the top bar. Until this
          existed the sidebar was simply hidden there and the app had no navigation. */}
      {isMobileNavOpen && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <button
            type="button"
            aria-label="Close navigation"
            className="absolute inset-0 h-full w-full bg-black/50"
            onClick={closeMobileNav}
          />
          <div className="relative h-full w-64 max-w-[80vw] overflow-y-auto bg-card shadow-xl">
            <Navigation onNavigate={closeMobileNav} />
          </div>
        </div>
      )}
    </>
  )
}
