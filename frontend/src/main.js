// Ultra-minimal vanilla JS test
console.log('main.js is executing!');

const root = document.getElementById('root');
if (root) {
  console.log('Root element found');
  root.innerHTML = `
    <div style="
      padding: 20px; 
      font-family: system-ui; 
      text-align: center;
      min-height: 100vh;
      background: #f0f0f0;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-direction: column;
    ">
      <h1 style="color: #333">🔥 Dharma Night Market - JS Test</h1>
      <p style="color: #666">Vanilla JavaScript is working!</p>
      <div style="margin-top: 20px; padding: 15px; background: white; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
        <p>✅ main.js executed</p>
        <p>✅ DOM manipulation working</p>
        <p>✅ Ready to debug React issue</p>
      </div>
    </div>
  `;
} else {
  console.error('Root element not found!');
}