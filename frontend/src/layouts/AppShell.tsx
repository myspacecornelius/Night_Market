import { Outlet } from 'react-router-dom'
import { Topbar } from './_components/Topbar'
import { Sidebar } from './_components/Sidebar'

const AppShell = () => {
  return (
    <div className="flex h-screen bg-background">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Topbar />
        <main className="flex-1 overflow-x-hidden overflow-y-auto bg-background p-4 md:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

export default AppShell
