import React from 'react';
import { Link, BrowserRouter } from 'react-router-dom';
import { createRoot } from 'react-dom/client';

// Dark theme inspired by unboxed-app.com but even darker
const styles = {
  container: { 
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif', 
    minHeight: '100vh', 
    background: 'linear-gradient(135deg, #0a0b0d 0%, #1a1d23 25%, #0f1419 75%, #000000 100%)',
    color: '#e2e8f0'
  },
  nav: { 
    background: 'linear-gradient(135deg, #000000 0%, #1a1d23 50%, #0a0b0d 100%)', 
    color: 'white', 
    padding: '24px', 
    marginBottom: '0px',
    borderBottom: '1px solid rgba(255,255,255,0.05)',
    backdropFilter: 'blur(8px)'
  },
  navTitle: { 
    fontSize: '28px', 
    fontWeight: '700', 
    marginBottom: '12px', 
    textDecoration: 'none', 
    color: '#f8fafc',
    letterSpacing: '-0.025em'
  },
  navLinks: { display: 'flex', gap: '24px', marginTop: '16px' },
  navLink: { 
    color: 'rgba(248,250,252,0.7)', 
    textDecoration: 'none', 
    padding: '10px 18px', 
    borderRadius: '8px', 
    transition: 'all 0.2s ease',
    fontSize: '14px',
    fontWeight: '500'
  },
  navLinkActive: { background: 'rgba(248,250,252,0.1)', color: '#f8fafc' },
  content: { maxWidth: '1400px', margin: '0 auto', padding: '0 24px' },
  card: { 
    background: 'linear-gradient(135deg, #1a1d23 0%, #0f1419 50%, #1a1d23 100%)', 
    borderRadius: '16px', 
    padding: '40px', 
    boxShadow: '0 8px 32px rgba(0,0,0,0.3), 0 1px 0 rgba(255,255,255,0.05) inset', 
    marginBottom: '24px',
    border: '1px solid rgba(255,255,255,0.05)'
  },
  loginContainer: { 
    display: 'flex', 
    alignItems: 'center', 
    justifyContent: 'center', 
    minHeight: '100vh', 
    background: 'linear-gradient(135deg, #000000 0%, #1a1d23 25%, #0f1419 75%, #000000 100%)'
  },
  loginCard: { 
    background: 'linear-gradient(135deg, #1a1d23 0%, #0f1419 50%, #1a1d23 100%)', 
    borderRadius: '20px', 
    padding: '48px', 
    width: '100%', 
    maxWidth: '440px', 
    textAlign: 'center' as const,
    boxShadow: '0 20px 64px rgba(0,0,0,0.4), 0 1px 0 rgba(255,255,255,0.05) inset',
    border: '1px solid rgba(255,255,255,0.1)'
  },
  input: { 
    width: '100%', 
    padding: '16px', 
    border: '1px solid rgba(255,255,255,0.1)', 
    borderRadius: '12px', 
    fontSize: '16px', 
    marginBottom: '18px',
    background: 'rgba(0,0,0,0.3)',
    color: '#f8fafc',
    outline: 'none',
    transition: 'all 0.2s ease'
  },
  button: { 
    background: 'linear-gradient(135deg, #dc4d5e 0%, #b91c1c 50%, #dc4d5e 100%)', 
    color: 'white', 
    border: 'none', 
    padding: '16px 32px', 
    borderRadius: '12px', 
    fontSize: '16px', 
    fontWeight: '600',
    cursor: 'pointer', 
    width: '100%',
    transition: 'all 0.2s ease',
    boxShadow: '0 4px 16px rgba(220,77,94,0.3)'
  },
  grid: { 
    display: 'grid', 
    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', 
    gap: '24px', 
    margin: '40px 0' 
  },
  actionCard: { 
    background: 'linear-gradient(135deg, #1a1d23 0%, #0f1419 50%, #1a1d23 100%)', 
    borderRadius: '16px', 
    padding: '32px', 
    textAlign: 'center' as const, 
    cursor: 'pointer', 
    transition: 'all 0.3s ease', 
    boxShadow: '0 8px 32px rgba(0,0,0,0.2), 0 1px 0 rgba(255,255,255,0.05) inset',
    border: '1px solid rgba(255,255,255,0.05)',
    transform: 'translateY(0)',
    '&:hover': {
      transform: 'translateY(-4px)',
      boxShadow: '0 12px 40px rgba(0,0,0,0.3)'
    }
  }
};

// Simple auth hook
const useAuth = () => {
  const [isAuthenticated, setIsAuthenticated] = React.useState(
    () => localStorage.getItem('dharma_token') !== null
  );
  const [user, setUser] = React.useState(() => {
    const saved = localStorage.getItem('dharma_user');
    return saved ? JSON.parse(saved) : null;
  });

  const login = (email: string, password: string) => {
    console.log('Login function called with:', { email, password });
    if (email && password) {
      console.log('Email and password provided, proceeding with login...');
      const mockUser = { id: 1, email, username: email.split('@')[0], laces: 1250 };
      localStorage.setItem('dharma_token', 'token');
      localStorage.setItem('dharma_user', JSON.stringify(mockUser));
      setIsAuthenticated(true);
      setUser(mockUser);
      console.log('Login successful, user set:', mockUser);
      return true;
    }
    console.log('Login failed - missing email or password');
    return false;
  };

  const logout = () => {
    localStorage.clear();
    setIsAuthenticated(false);
    setUser(null);
  };

  return { isAuthenticated, user, login, logout };
};

// Simple navigation without router - using show/hide
const Navigation = ({ user, onLogout, currentPage, setCurrentPage }: any) => {
  const navItems = [
    { page: 'dashboard', label: 'Dashboard', icon: '🏠' },
    { page: 'heatmap', label: 'Heat Map', icon: '🗺️' },
    { page: 'dropzones', label: 'Drop Zones', icon: '📍' },
    { page: 'laces', label: 'LACES', icon: '🏆' },
    { page: 'feed', label: 'Feed', icon: '📱' },
  ];

  return (
    <nav style={styles.nav}>
      <button 
        onClick={() => setCurrentPage('dashboard')} 
        style={{...styles.navTitle, border: 'none', background: 'none'}}
      >
        🔥 Dharma Night Market
      </button>
      <div style={styles.navLinks}>
        {navItems.map((item) => (
          <button
            key={item.page}
            onClick={() => setCurrentPage(item.page)}
            style={{
              ...styles.navLink,
              border: 'none',
              background: currentPage === item.page ? 'rgba(255,255,255,0.2)' : 'transparent',
              cursor: 'pointer'
            }}
          >
            {item.icon} {item.label}
          </button>
        ))}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '15px' }}>
          <span>Welcome, {user?.username}</span>
          <span style={{ background: 'rgba(255,255,255,0.2)', padding: '6px 12px', borderRadius: '20px' }}>
            {user?.laces} 🏆
          </span>
          <button 
            onClick={onLogout}
            style={{ ...styles.button, width: 'auto', background: '#dc3545' }}
          >
            Logout
          </button>
        </div>
      </div>
    </nav>
  );
};

// Dashboard page
const Dashboard = () => (
  <div style={styles.container}>
    <div style={styles.content}>
      <div style={styles.card}>
        <h1 style={{ 
          margin: '0 0 16px 0', 
          fontSize: '48px', 
          color: '#f8fafc',
          fontWeight: '700',
          letterSpacing: '-0.05em',
          lineHeight: '1.1'
        }}>Underground Sneaker Network</h1>
        <p style={{ 
          color: 'rgba(248,250,252,0.7)', 
          fontSize: '20px',
          margin: '0',
          lineHeight: '1.5'
        }}>The premier platform for sneaker culture</p>
      </div>

      <div style={styles.grid}>
        <Link to="/heatmap" style={{ textDecoration: 'none' }}>
          <div style={{ 
            ...styles.actionCard, 
            background: 'linear-gradient(135deg, #dc4d5e 0%, #b91c1c 50%, #dc4d5e 100%)', 
            color: 'white',
            boxShadow: '0 8px 32px rgba(220,77,94,0.3), 0 1px 0 rgba(255,255,255,0.1) inset'
          }}>
            <div style={{ fontSize: '56px', marginBottom: '20px' }}>🗺️</div>
            <h3 style={{ margin: '0 0 12px 0', fontSize: '24px', fontWeight: '600' }}>Heat Map</h3>
            <p style={{ margin: '0', opacity: 0.9, fontSize: '16px' }}>Track live drop activity</p>
          </div>
        </Link>
        
        <Link to="/dropzones" style={{ textDecoration: 'none' }}>
          <div style={{ 
            ...styles.actionCard, 
            background: 'linear-gradient(135deg, #7c3aed 0%, #5b21b6 50%, #7c3aed 100%)', 
            color: 'white',
            boxShadow: '0 8px 32px rgba(124,58,237,0.3), 0 1px 0 rgba(255,255,255,0.1) inset'
          }}>
            <div style={{ fontSize: '56px', marginBottom: '20px' }}>📍</div>
            <h3 style={{ margin: '0 0 12px 0', fontSize: '24px', fontWeight: '600' }}>Drop Zones</h3>
            <p style={{ margin: '0', opacity: 0.9, fontSize: '16px' }}>Community gathering spots</p>
          </div>
        </Link>
        
        <Link to="/laces" style={{ textDecoration: 'none' }}>
          <div style={{ 
            ...styles.actionCard, 
            background: 'linear-gradient(135deg, #ea580c 0%, #c2410c 50%, #ea580c 100%)', 
            color: 'white',
            boxShadow: '0 8px 32px rgba(234,88,12,0.3), 0 1px 0 rgba(255,255,255,0.1) inset'
          }}>
            <div style={{ fontSize: '56px', marginBottom: '20px' }}>🏆</div>
            <h3 style={{ margin: '0 0 12px 0', fontSize: '24px', fontWeight: '600' }}>LACES</h3>
            <p style={{ margin: '0', opacity: 0.9, fontSize: '16px' }}>Your reputation currency</p>
          </div>
        </Link>
        
        <Link to="/feed" style={{ textDecoration: 'none' }}>
          <div style={{ 
            ...styles.actionCard, 
            background: 'linear-gradient(135deg, #0891b2 0%, #0e7490 50%, #0891b2 100%)', 
            color: 'white',
            boxShadow: '0 8px 32px rgba(8,145,178,0.3), 0 1px 0 rgba(255,255,255,0.1) inset'
          }}>
            <div style={{ fontSize: '56px', marginBottom: '20px' }}>📱</div>
            <h3 style={{ margin: '0 0 12px 0', fontSize: '24px', fontWeight: '600' }}>Community Feed</h3>
            <p style={{ margin: '0', opacity: 0.9, fontSize: '16px' }}>Latest network updates</p>
          </div>
        </Link>
      </div>
    </div>
  </div>
);

// Simple page components
const HeatMapPage = () => (
  <div style={styles.container}>
    <div style={styles.content}>
      <div style={styles.card}>
        <h1 style={{ 
          color: '#f8fafc', 
          marginBottom: '24px',
          fontSize: '36px',
          fontWeight: '700',
          letterSpacing: '-0.025em'
        }}>🗺️ Heat Map</h1>
        <p style={{ 
          color: 'rgba(248,250,252,0.7)', 
          fontSize: '18px',
          lineHeight: '1.6'
        }}>Real-time sneaker drop activity tracking across major cities.</p>
        <div style={{ 
          height: '400px', 
          background: 'linear-gradient(135deg, #000000 0%, #1a1d23 50%, #0f1419 100%)', 
          borderRadius: '16px', 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center', 
          marginTop: '32px',
          border: '1px solid rgba(255,255,255,0.1)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.3) inset'
        }}>
          <div style={{ textAlign: 'center', color: '#f8fafc' }}>
            <h3 style={{ 
              fontSize: '24px',
              fontWeight: '600',
              marginBottom: '16px'
            }}>Interactive Map Loading...</h3>
            <p style={{ 
              fontSize: '16px',
              color: 'rgba(248,250,252,0.7)'
            }}>📍 47 Active Drops • 🔥 12 Hot Zones • 👥 1,248 Users Online</p>
          </div>
        </div>
      </div>
    </div>
  </div>
);

const DropZonesPage = () => (
  <div style={styles.container}>
    <div style={styles.content}>
      <div style={styles.card}>
        <h1 style={{ 
          color: '#f8fafc', 
          marginBottom: '24px',
          fontSize: '36px',
          fontWeight: '700',
          letterSpacing: '-0.025em'
        }}>📍 Drop Zones</h1>
        <p style={{ 
          color: 'rgba(248,250,252,0.7)', 
          fontSize: '18px',
          lineHeight: '1.6'
        }}>Join community-organized sneaker hunting groups in your area.</p>
        <div style={{ marginTop: '32px' }}>
          <div style={{ 
            ...styles.card, 
            background: 'linear-gradient(135deg, #000000 0%, #1a1d23 50%, #0f1419 100%)',
            border: '1px solid rgba(255,255,255,0.1)'
          }}>
            <h3 style={{ 
              color: '#f8fafc', 
              margin: '0 0 12px 0',
              fontSize: '24px',
              fontWeight: '600'
            }}>SoHo Sneaker Squad</h3>
            <p style={{ 
              color: 'rgba(248,250,252,0.7)', 
              margin: '0 0 20px 0',
              fontSize: '16px',
              lineHeight: '1.5'
            }}>Premium sneaker hunting in NYC's fashion district</p>
            <div style={{ 
              color: 'rgba(248,250,252,0.6)', 
              fontSize: '14px', 
              marginBottom: '20px' 
            }}>👥 247 members • 📍 Manhattan, NY</div>
            <button style={styles.button}>Join Zone</button>
          </div>
        </div>
      </div>
    </div>
  </div>
);

const LacesPage = () => (
  <div style={styles.container}>
    <div style={styles.content}>
      <div style={styles.card}>
        <h1 style={{ 
          color: '#f8fafc', 
          marginBottom: '24px',
          fontSize: '36px',
          fontWeight: '700',
          letterSpacing: '-0.025em'
        }}>🏆 LACES</h1>
        <p style={{ 
          color: 'rgba(248,250,252,0.7)', 
          fontSize: '18px',
          lineHeight: '1.6'
        }}>Your reputation currency in the underground network.</p>
        <div style={{ 
          ...styles.card, 
          background: 'linear-gradient(135deg, #ea580c 0%, #c2410c 50%, #ea580c 100%)', 
          color: 'white', 
          textAlign: 'center', 
          margin: '32px 0',
          boxShadow: '0 8px 32px rgba(234,88,12,0.3), 0 1px 0 rgba(255,255,255,0.1) inset'
        }}>
          <h2 style={{ 
            margin: '0 0 24px 0',
            fontSize: '28px',
            fontWeight: '600'
          }}>Your Balance</h2>
          <div style={{ 
            fontSize: '64px', 
            fontWeight: '700',
            marginBottom: '16px'
          }}>1,250 🏆</div>
          <p style={{ 
            margin: '0', 
            opacity: 0.9,
            fontSize: '18px'
          }}>Rank #247 in the network</p>
        </div>
      </div>
    </div>
  </div>
);

const FeedPage = () => (
  <div style={styles.container}>
    <div style={styles.content}>
      <div style={styles.card}>
        <h1 style={{ 
          color: '#f8fafc', 
          marginBottom: '24px',
          fontSize: '36px',
          fontWeight: '700',
          letterSpacing: '-0.025em'
        }}>📱 Community Feed</h1>
        <p style={{ 
          color: 'rgba(248,250,252,0.7)', 
          fontSize: '18px',
          lineHeight: '1.6'
        }}>Latest drops, wins, and network updates from the community.</p>
        <div style={{ marginTop: '32px' }}>
          <div style={{ 
            ...styles.card, 
            background: 'linear-gradient(135deg, #000000 0%, #1a1d23 50%, #0f1419 100%)',
            border: '1px solid rgba(255,255,255,0.1)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: '20px' }}>
              <div style={{ 
                width: '48px', 
                height: '48px', 
                borderRadius: '50%', 
                background: 'linear-gradient(135deg, #dc4d5e, #b91c1c)', 
                color: 'white', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center', 
                marginRight: '16px', 
                fontWeight: '700',
                fontSize: '18px'
              }}>
                JS
              </div>
              <div>
                <strong style={{ color: '#f8fafc', fontSize: '16px' }}>SneakerKing23</strong>
                <div style={{ 
                  fontSize: '14px', 
                  color: 'rgba(248,250,252,0.6)',
                  marginTop: '2px'
                }}>2 minutes ago</div>
              </div>
            </div>
            <p style={{ 
              color: '#f8fafc',
              fontSize: '16px',
              lineHeight: '1.5',
              marginBottom: '20px'
            }}>🔥 MASSIVE WIN! Just copped the Jordan 11 Retro "Bred" from Nike SoHo. The line was crazy but worth it!</p>
            <div style={{ 
              display: 'flex', 
              gap: '24px', 
              paddingTop: '16px', 
              borderTop: '1px solid rgba(255,255,255,0.1)' 
            }}>
              <span style={{ 
                color: 'rgba(248,250,252,0.7)', 
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: '500'
              }}>❤️ 47</span>
              <span style={{ 
                color: 'rgba(248,250,252,0.7)', 
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: '500'
              }}>💬 12</span>
              <span style={{ 
                color: '#10b981', 
                fontWeight: '600',
                fontSize: '14px'
              }}>+25 LACES</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
);

// Login page
const LoginPage = ({ onLogin }: any) => {
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    console.log('Login form submitted with:', { email, password });
    const result = onLogin(email, password);
    console.log('Login result:', result);
    if (!result) {
      alert('Login failed - make sure to enter both email and password');
    }
  };

  return (
    <div style={styles.loginContainer}>
      <div style={styles.loginCard}>
        <div style={{ fontSize: '80px', marginBottom: '24px' }}>🔥</div>
        <h1 style={{ 
          margin: '0 0 16px 0', 
          fontSize: '42px', 
          color: '#f8fafc',
          fontWeight: '700',
          letterSpacing: '-0.05em'
        }}>Dharma</h1>
        <p style={{ 
          margin: '0 0 40px 0', 
          color: 'rgba(248,250,252,0.7)',
          fontSize: '18px',
          lineHeight: '1.5'
        }}>Enter the underground network</p>
        
        <form onSubmit={handleSubmit}>
          <input
            type="email"
            placeholder="Enter any email (e.g. test@example.com)"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{
              ...styles.input,
              color: '#f8fafc',
              '::placeholder': { color: 'rgba(248,250,252,0.5)' }
            }}
            autoComplete="email"
          />
          <input
            type="password"
            placeholder="Enter any password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{
              ...styles.input,
              color: '#f8fafc'
            }}
            autoComplete="current-password"
          />
          <button type="submit" style={{
            ...styles.button, 
            fontSize: '18px', 
            fontWeight: '700', 
            textTransform: 'uppercase',
            letterSpacing: '0.025em'
          }}>
            🚀 Enter Network
          </button>
        </form>
        
        <div style={{ 
          marginTop: '32px', 
          padding: '20px', 
          background: 'rgba(220,77,94,0.1)', 
          borderRadius: '12px',
          border: '1px solid rgba(220,77,94,0.2)'
        }}>
          <p style={{ 
            margin: '0 0 8px 0', 
            fontSize: '14px', 
            color: '#dc4d5e', 
            fontWeight: '600' 
          }}>
            📝 Demo Login Instructions:
          </p>
          <p style={{ 
            margin: '0', 
            fontSize: '14px', 
            color: 'rgba(248,250,252,0.8)',
            lineHeight: '1.4'
          }}>
            Enter ANY email and password to access the app
          </p>
        </div>
      </div>
    </div>
  );
};

// Main App component with navigation and page switching
const App = () => {
  const auth = useAuth();
  const [currentPage, setCurrentPage] = React.useState('dashboard');

  if (!auth.isAuthenticated) {
    return <LoginPage onLogin={auth.login} />;
  }

  const renderPage = () => {
    switch (currentPage) {
      case 'dashboard':
        return <Dashboard />;
      case 'heatmap':
        return <HeatMapPage />;
      case 'dropzones':
        return <DropZonesPage />;
      case 'laces':
        return <LacesPage />;
      case 'feed':
        return <FeedPage />;
      default:
        return <Dashboard />;
    }
  };

  return (
    <div style={styles.container}>
      <Navigation 
        user={auth.user} 
        onLogout={auth.logout} 
        currentPage={currentPage}
        setCurrentPage={setCurrentPage}
      />
      {renderPage()}
    </div>
  );
};

console.log('Script is executing!');
console.log('Document ready state:', document.readyState);

const root = document.getElementById('root');
console.log('Root element:', root);

if (root) {
  console.log('Root element found, clearing fallback...');
  root.innerHTML = '<div style="color: green; text-align: center; padding: 50px;">🎉 REACT IS WORKING! 🎉</div>';
  
  console.log('Creating React root...');
  try {
    const reactRoot = createRoot(root);
    console.log('React root created, rendering...');
    reactRoot.render(
      <BrowserRouter>
        <App />
      </BrowserRouter>
    );
    console.log('React app mounted successfully!');
  } catch (error) {
    console.error('React mounting error:', error);
    root.innerHTML = '<div style="color: red; text-align: center; padding: 50px;">React Error: ' + error.message + '</div>';
  }
} else {
  console.error('Root element not found!');
}