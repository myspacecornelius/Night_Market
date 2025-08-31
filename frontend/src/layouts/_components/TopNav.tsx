import { useTheme } from '@/components/ThemeProvider';
import { Button } from '@/components/ui/Button';
import { Flame, Search, Sparkles } from 'lucide-react';

export const TopNav = () => {
    const { theme, setTheme } = useTheme();

    return (
        <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            <div className="container flex h-14 max-w-4xl items-center">
                <div className="mr-4 hidden md:flex">
                    <a className="mr-6 flex items-center space-x-2" href="/">
                        <Flame className="h-6 w-6 text-primary" />
                        <span className="hidden font-bold sm:inline-block">Dharma</span>
                    </a>
                </div>
                <div className="flex flex-1 items-center justify-between space-x-2 md:justify-end">
                    <div className="w-full flex-1 md:w-auto md:flex-none">
                        <Button variant="ghost" size="sm" className="w-full md:w-auto">
                            <Search className="h-4 w-4 mr-2" />
                            Search
                        </Button>
                    </div>
                    <nav className="flex items-center">
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
                        >
                            <Sparkles className="h-5 w-5" />
                            <span className="sr-only">Toggle theme</span>
                        </Button>
                    </nav>
                </div>
            </div>
        </header>
    );
};
