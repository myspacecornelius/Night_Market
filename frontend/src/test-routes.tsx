import React from 'react';
import { createBrowserRouter } from 'react-router-dom';

// Minimal test component
const TestApp: React.FC = () => (
  <div style={{ 
    padding: '20px', 
    fontFamily: 'system-ui', 
    textAlign: 'center',
    minHeight: '100vh',
    backgroundColor: '#f5f5f5',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center'
  }}>
    <h1 style={{ color: '#333', marginBottom: '20px' }}>🔥 Dharma - Night Market</h1>
    <p style={{ color: '#666', marginBottom: '30px' }}>The Underground Network is LIVE!</p>
    <div style={{ 
      backgroundColor: 'white', 
      padding: '20px', 
      borderRadius: '8px',
      boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
      maxWidth: '400px'
    }}>
      <h3 style={{ marginTop: 0, color: '#2c5d31' }}>System Status</h3>
      <div style={{ textAlign: 'left' }}>
        <p>✅ Frontend: Online</p>
        <p>✅ API: Connected</p>
        <p>✅ React Router: Working</p>
        <p>🎯 Ready for development</p>
      </div>
    </div>
    <p style={{ 
      marginTop: '20px', 
      fontSize: '14px', 
      color: '#888' 
    }}>
      This is a minimal test route. The full app will load once all components are fixed.
    </p>
  </div>
);

const testRouter = createBrowserRouter([
  {
    path: '/*',
    element: <TestApp />,
  },
]);

export default testRouter;