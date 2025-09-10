import React from 'react';
import { Link, BrowserRouter } from 'react-router-dom';
import { createRoot } from 'react-dom/client';

// Ultra-simple working app with inline styles to bypass Tailwind issues
const styles = {
  container: { fontFamily: 'system-ui', minHeight: '100vh', background: '#f5f5f5' },
  nav: { background: 'linear-gradient(135deg, #2c5d31, #4a7c59)', color: 'white', padding: '20px', marginBottom: '20px' },
  navTitle: { fontSize: '24px', fontWeight: 'bold', marginBottom: '10px', textDecoration: 'none', color: 'white' },
  navLinks: { display: 'flex', gap: '20px', marginTop: '15px' },
  navLink: { color: 'rgba(255,255,255,0.8)', textDecoration: 'none', padding: '8px 16px', borderRadius: '6px', transition: 'all 0.2s' },
  navLinkActive: { background: 'rgba(255,255,255,0.2)', color: 'white' },
  content: { maxWidth: '1200px', margin: '0 auto', padding: '0 20px' },
  card: { background: 'white', borderRadius: '12px', padding: '30px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', marginBottom: '20px' },
  loginContainer: { display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: 'linear-gradient(135deg, #2c5d31, #4a7c59)' },
  loginCard: { background: 'white', borderRadius: '16px', padding: '40px', width: '100%', maxWidth: '400px', textAlign: 'center' as const },
  input: { width: '100%', padding: '12px', border: '2px solid #ddd', borderRadius: '8px', fontSize: '16px', marginBottom: '15px' },
  button: { background: 'linear-gradient(135deg, #2c5d31, #4a7c59)', color: 'white', border: 'none', padding: '12px 24px', borderRadius: '8px', fontSize: '16px', cursor: 'pointer', width: '100%' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '20px', margin: '30px 0' },
  actionCard: { background: 'white', borderRadius: '12px', padding: '25px', textAlign: 'center' as const, cursor: 'pointer', transition: 'all 0.3s', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }
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
        <h1 style={{ margin: '0 0 10px 0', fontSize: '36px', color: '#2c5d31' }}>Underground Sneaker Network</h1>
        <p style={{ color: '#666', fontSize: '18px' }}>The premier platform for sneaker culture</p>
      </div>

      <div style={styles.grid}>
        <Link to="/heatmap" style={{ textDecoration: 'none' }}>
          <div style={{ ...styles.actionCard, background: 'linear-gradient(135deg, #4a7c59, #2c5d31)', color: 'white' }}>
            <div style={{ fontSize: '48px', marginBottom: '15px' }}>🗺️</div>
            <h3 style={{ margin: '0 0 10px 0' }}>Heat Map</h3>
            <p style={{ margin: '0', opacity: 0.9 }}>Track live drop activity</p>
          </div>
        </Link>
        
        <Link to="/dropzones" style={{ textDecoration: 'none' }}>
          <div style={{ ...styles.actionCard, background: 'linear-gradient(135deg, #8b7355, #5d4e37)', color: 'white' }}>
            <div style={{ fontSize: '48px', marginBottom: '15px' }}>📍</div>
            <h3 style={{ margin: '0 0 10px 0' }}>Drop Zones</h3>
            <p style={{ margin: '0', opacity: 0.9 }}>Community gathering spots</p>
          </div>
        </Link>
        
        <Link to="/laces" style={{ textDecoration: 'none' }}>
          <div style={{ ...styles.actionCard, background: 'linear-gradient(135deg, #8e7788, #6b5b73)', color: 'white' }}>
            <div style={{ fontSize: '48px', marginBottom: '15px' }}>🏆</div>
            <h3 style={{ margin: '0 0 10px 0' }}>LACES</h3>
            <p style={{ margin: '0', opacity: 0.9 }}>Your reputation currency</p>
          </div>
        </Link>
        
        <Link to="/feed" style={{ textDecoration: 'none' }}>
          <div style={{ ...styles.actionCard, background: 'linear-gradient(135deg, #a0522d, #8b4513)', color: 'white' }}>
            <div style={{ fontSize: '48px', marginBottom: '15px' }}>📱</div>
            <h3 style={{ margin: '0 0 10px 0' }}>Community Feed</h3>
            <p style={{ margin: '0', opacity: 0.9 }}>Latest network updates</p>
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
        <h1 style={{ color: '#2c5d31', marginBottom: '20px' }}>🗺️ Heat Map</h1>
        <p>Real-time sneaker drop activity tracking across major cities.</p>
        <div style={{ height: '300px', background: 'linear-gradient(45deg, #e8f5e8, #f0f8f0)', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: '20px' }}>
          <div style={{ textAlign: 'center', color: '#4a7c59' }}>
            <h3>Interactive Map Loading...</h3>
            <p>📍 47 Active Drops • 🔥 12 Hot Zones • 👥 1,248 Users Online</p>
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
        <h1 style={{ color: '#2c5d31', marginBottom: '20px' }}>📍 Drop Zones</h1>
        <p>Join community-organized sneaker hunting groups in your area.</p>
        <div style={{ marginTop: '30px' }}>
          <div style={{ ...styles.card, background: '#f8f9fa' }}>
            <h3 style={{ color: '#2c5d31', margin: '0 0 10px 0' }}>SoHo Sneaker Squad</h3>
            <p style={{ color: '#666', margin: '0 0 15px 0' }}>Premium sneaker hunting in NYC's fashion district</p>
            <div style={{ color: '#666', fontSize: '14px', marginBottom: '15px' }}>👥 247 members • 📍 Manhattan, NY</div>
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
        <h1 style={{ color: '#2c5d31', marginBottom: '20px' }}>🏆 LACES</h1>
        <p>Your reputation currency in the underground network.</p>
        <div style={{ ...styles.card, background: 'linear-gradient(135deg, #6b5b73, #8e7788)', color: 'white', textAlign: 'center', margin: '30px 0' }}>
          <h2 style={{ margin: '0 0 20px 0' }}>Your Balance</h2>
          <div style={{ fontSize: '48px', fontWeight: 'bold' }}>1,250 🏆</div>
          <p style={{ margin: '20px 0 0 0', opacity: 0.9 }}>Rank #247 in the network</p>
        </div>
      </div>
    </div>
  </div>
);

const FeedPage = () => (
  <div style={styles.container}>
    <div style={styles.content}>
      <div style={styles.card}>
        <h1 style={{ color: '#2c5d31', marginBottom: '20px' }}>📱 Community Feed</h1>
        <p>Latest drops, wins, and network updates from the community.</p>
        <div style={{ marginTop: '30px' }}>
          <div style={{ ...styles.card, background: '#f8f9fa' }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: '15px' }}>
              <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: '#4a7c59', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', marginRight: '15px', fontWeight: 'bold' }}>
                JS
              </div>
              <div>
                <strong>SneakerKing23</strong>
                <div style={{ fontSize: '14px', color: '#666' }}>2 minutes ago</div>
              </div>
            </div>
            <p>🔥 MASSIVE WIN! Just copped the Jordan 11 Retro "Bred" from Nike SoHo. The line was crazy but worth it!</p>
            <div style={{ display: 'flex', gap: '20px', marginTop: '15px', paddingTop: '15px', borderTop: '1px solid #eee' }}>
              <span style={{ color: '#666', cursor: 'pointer' }}>❤️ 47</span>
              <span style={{ color: '#666', cursor: 'pointer' }}>💬 12</span>
              <span style={{ color: '#28a745', fontWeight: 'bold' }}>+25 LACES</span>
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
        <div style={{ fontSize: '64px', marginBottom: '20px' }}>🔥</div>
        <h1 style={{ margin: '0 0 10px 0', fontSize: '32px', color: '#2c5d31' }}>Dharma</h1>
        <p style={{ margin: '0 0 30px 0', color: '#666' }}>Enter the underground network</p>
        
        <form onSubmit={handleSubmit}>
          <input
            type="email"
            placeholder="Enter any email (e.g. test@example.com)"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={styles.input}
            autoComplete="email"
          />
          <input
            type="password"
            placeholder="Enter any password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={styles.input}
            autoComplete="current-password"
          />
          <button type="submit" style={{...styles.button, fontSize: '18px', fontWeight: 'bold', textTransform: 'uppercase'}}>
            🚀 Enter Network
          </button>
        </form>
        
        <div style={{ marginTop: '20px', padding: '15px', background: '#e8f5e8', borderRadius: '8px' }}>
          <p style={{ margin: '0', fontSize: '14px', color: '#2c5d31', fontWeight: 'bold' }}>
            📝 Demo Login Instructions:
          </p>
          <p style={{ margin: '5px 0 0 0', fontSize: '14px', color: '#4a7c59' }}>
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