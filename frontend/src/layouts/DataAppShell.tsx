import { LayoutDashboard, Package } from 'lucide-react';
import React from 'react';
import { NavLink, Outlet } from 'react-router-dom';

const AppShell: React.FC = () => {
    return (
        <div className="flex h-screen bg-gray-100 dark:bg-gray-900 text-gray-800 dark:text-gray-200">
            {/* Sidebar */}
            <aside className="w-64 flex-shrink-0 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col">
                <div className="h-16 flex items-center justify-center px-4 border-b border-gray-200 dark:border-gray-700">
                    <div className="flex items-center gap-2">
                        <svg
                            className="w-8 h-8 text-gray-900 dark:text-white"
                            viewBox="0 0 24 24"
                            fill="currentColor"
                            xmlns="http://www.w3.org/2000/svg"
                        >
                            <path d="M8.4,6.91H5.28V17.09H8.4a.35.35,0,0,0,.35-.35V7.26A.35.35,0,0,0,8.4,6.91Z" />
                            <path d="M18.72,12a6.5,6.5,0,0,0-6.17-6.5H9.1V18.5h3.45a6.5,6.5,0,0,0,6.17-6.5Zm-3.45,4.09H12V7.91h3.27a4.09,4.09,0,1,1,0,8.18Z" />
                            <path d="M7.7,10.19a.69.69,0,1,0-1.38,0,1.1,1.1,0,0,1-1-1.1,1.1,1.1,0,0,1,1-1.1.69.69,0,1,0,0-1.38,2.48,2.48,0,0,0-2.38,2.48,2.48,2.48,0,0,0,2.38,2.48.69.69,0,1,0,0-1.38,1.1,1.1,0,0,1-1-1.1A1.1,1.1,0,0,1,7.7,10.19Z" />
                            <path d="M7.7,13.81a.69.69,0,1,0-1.38,0,1.1,1.1,0,0,1-1-1.1,1.1,1.1,0,0,1,1-1.1.69.69,0,1,0,0-1.38,2.48,2.48,0,0,0-2.38,2.48,2.48,2.48,0,0,0,2.38,2.48.69.69,0,1,0,0-1.38,1.1,1.1,0,0,1-1-1.1A1.1,1.1,0,0,1,7.7,13.81Z" />
                        </svg>
                        <span className="font-bold text-xl">Dharma</span>
                    </div>
                </div>
                <nav className="flex-1 p-4 space-y-2">
                    <NavLink
                        to="/data"
                        className={({ isActive }) =>
                            `flex items-center px-4 py-2 rounded-md text-sm font-medium transition-colors ${isActive
                                ? 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white'
                                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                            }`
                        }
                    >
                        <LayoutDashboard className="w-5 h-5 mr-3" />
                        Dashboard
                    </NavLink>
                    <NavLink
                        to="items"
                        className={({ isActive }) =>
                            `flex items-center px-4 py-2 rounded-md text-sm font-medium transition-colors ${isActive
                                ? 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white'
                                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                            }`
                        }
                    >
                        <Package className="w-5 h-5 mr-3" />
                        Items
                    </NavLink>
                </nav>
            </aside>

            {/* Main Content */}
            <div className="flex-1 flex flex-col overflow-hidden">
                {/* Header */}
                <header className="h-16 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between px-6">
                    <div>
                        {/* Header content, e.g., breadcrumbs or search */}
                        <h1 className="text-lg font-semibold">Items Dashboard</h1>
                    </div>
                    <div>
                        {/* User menu, notifications, etc. */}
                    </div>
                </header>

                {/* Content Area */}
                <main className="flex-1 overflow-y-auto p-6">
                    <Outlet />
                </main>
            </div>
        </div>
    );
};

export default AppShell;
