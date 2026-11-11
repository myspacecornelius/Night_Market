import { Outlet } from 'react-router-dom'
import { Topbar } from './_components/Topbar'
import { Sidebar } from './_components/Sidebar'

const AppShell = () => {
  return (
    <div className="flex h-screen bg-background">
      <Sidebar />
      {/* min-w-0: without it this column cannot shrink below its widest child, and on a
          phone the whole shell became wider than the screen (the menu button with it). */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Topbar />
        <main className="flex-1 overflow-x-hidden overflow-y-auto bg-background p-4 md:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

export default AppShell
