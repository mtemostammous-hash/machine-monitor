/**
 * Dashboard Component
 * 
 * Displays all monitored machines as a grid of AgentCard components.
 * Shows a placeholder message when no agents are connected.
 * 
 * Props:
 *   agents - Array of agent objects from the server
 */

function Dashboard({ agents }) {
  // Filter agents into online and offline
  const onlineAgents = agents.filter(a => a.connected);
  const offlineAgents = agents.filter(a => !a.connected);

  return (
    <main className="dashboard">
      {/* Show message if no agents have ever connected */}
      {agents.length === 0 && (
        <div className="empty-state">
          <div className="empty-state-icon">📡</div>
          <h2>Waiting for agents...</h2>
          <p>
            Start an agent on another machine:<br />
            <code>cd agent && npm install && node agent.js</code>
          </p>
        </div>
      )}

      {/* Online agents */}
      {onlineAgents.length > 0 && (
        <>
          <h2 className="section-title">Online ({onlineAgents.length})</h2>
          <div className="agent-grid">
            {onlineAgents.map(agent => (
              <AgentCard key={agent.id} agent={agent} />
            ))}
          </div>
        </>
      )}

      {/* Offline agents (shown briefly after disconnect) */}
      {offlineAgents.length > 0 && (
        <>
          <h2 className="section-title offline-title">Offline ({offlineAgents.length})</h2>
          <div className="agent-grid">
            {offlineAgents.map(agent => (
              <AgentCard key={agent.id} agent={agent} />
            ))}
          </div>
        </>
      )}
    </main>
  );
}
