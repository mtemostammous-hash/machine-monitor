/**
 * App Entry Point
 * 
 * Connects to the server via Socket.io and renders the Dashboard component.
 * 
 * This is a simple "shell" component that:
 * 1. Establishes the Socket.io connection
 * 2. Receives the 'agents' event from the server
 * 3. Passes agent data down to the Dashboard component
 */

const { useState, useEffect } = React;

function App() {
  // State: list of agents received from the server
  const [agents, setAgents] = useState([]);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    // Connect to the Socket.io server (same host that served this page)
    const socket = io();

    // Register this connection as a dashboard client
    socket.on('connect', () => {
      setConnected(true);
      socket.emit('register', { role: 'dashboard' });
    });

    // Handle disconnection
    socket.on('disconnect', () => {
      setConnected(false);
    });

    // Receive updated agent list from server (sent every 5 seconds)
    socket.on('agents', (agentList) => {
      setAgents(agentList);
    });

    // Cleanup: disconnect when component unmounts
    return () => {
      socket.disconnect();
    };
  }, []);

  return (
    <div className="app">
      {/* Header bar */}
      <header className="header">
        <h1>🖥️ Machine Monitor</h1>
        <div className="header-status">
          <span className={`status-dot ${connected ? 'online' : 'offline'}`}></span>
          {connected ? 'Connected' : 'Disconnected'}
          <span className="agent-count">
            {agents.filter(a => a.connected).length} agent(s) online
          </span>
        </div>
      </header>

      {/* Main dashboard area */}
      <Dashboard agents={agents} />

      {/* Footer */}
      <footer className="footer">
        Phase 1 Proof of Concept — Updates every 5 seconds
      </footer>
    </div>
  );
}

// Mount the React app into the #root div
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
