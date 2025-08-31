import { Compass, Flame, TrendingUp, User } from 'lucide-react';
import { NavLink } from 'react-router-dom';

const navLinks = [
    { to: '/', label: 'Feed', icon: Flame },
    { to: '/drop-zones', label: 'Drop Zones', icon: Compass },
    { to: '/heat-check', label: 'Heat Check', icon: TrendingUp },
    { to: '/profile', label: 'Profile', icon: User },
];

export const BottomTabNav = () => {
    return (
        <nav className="fixed bottom-0 z-50 w-full border-t border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 md:hidden">
            <div className="container flex h-16 max-w-4xl items-center justify-around">
                {navLinks.map(({ to, label, icon: Icon }) => (
                    <NavLink
                        key={to}
                        to={to}
                        className={({ isActive }) =>
                            `flex flex-col items-center justify-center space-y-1 text-sm font-medium ${isActive ? 'text-primary' : 'text-muted-foreground'
                            }`
                        }
                    >
                        <Icon className="h-6 w-6" />
                        <span>{label}</span>
                    </NavLink>
                ))}
            </div>
        </nav>
    );
};
