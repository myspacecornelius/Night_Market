import { motion } from 'framer-motion'
import { NavLink, Outlet } from 'react-router-dom'
import { Menu, User, Map, Flame, Car, Home } from 'lucide-react'

export function AppShell() {
  return (
    <div className="relative min-h-dvh">
      {/* bg flair */}
      <motion.div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      >
        <div className="absolute -top-40 left-1/2 h-[40rem] w-[40rem] -translate-x-1/2 rounded-full blur-3xl"
             style={{ background: 'radial-gradient(closest-side, rgba(109,113,242,.25), transparent 70%)' }} />
      </motion.div>

      <header className="sticky top-0 z-20 backdrop-blur supports-[backdrop-filter]:bg-white/60 dark:supports-[backdrop-filter]:bg-black/30 border-b border-black/5 dark:border-white/10">
        <div className="container flex h-16 items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={import.meta.env.BASE_URL + 'logo.svg'} alt="Logo" className="h-8 w-8" onError={(e)=>{(e.currentTarget as HTMLImageElement).style.display='none'}}/>
            <NavLink to="/" className="text-lg font-semibold">Dharma</NavLink>
          </div>
          <nav className="hidden md:flex items-center gap-3">
            <NavLink to="/laces" className="btn btn-ghost"><Flame size={18}/>Laces</NavLink>
            <NavLink to="/heatmap" className="btn btn-ghost"><Home size={18}/>Heatmap</NavLink>
            <NavLink to="/thriftroute" className="btn btn-ghost"><Car size={18}/>ThriftRoute</NavLink>
            <NavLink to="/dropzones" className="btn btn-ghost"><Map size={18}/>Dropzones</NavLink>
            <NavLink to="/profile" className="btn btn-primary"><User size={18}/>Profile</NavLink>
          </nav>
          <button className="md:hidden btn btn-ghost" aria-label="Open menu"><Menu size={20}/></button>
        </div>
      </header>

      <main className="container my-8">
        <Outlet/>
      </main>

      <footer className="mt-16 border-t border-black/5 dark:border-white/10">
        <div className="container py-8 text-sm text-neutral-500">
          <p>© <span id="y">{new Date().getFullYear()}</span> Dharma. Built with taste and restraint.</p>
        </div>
      </footer>
    </div>
  )
}
export default AppShell
