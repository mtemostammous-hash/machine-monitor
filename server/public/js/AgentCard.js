/**
 * AgentCard Component
 * 
 * Displays metrics for a single monitored machine.
 * 
 * Props:
 *   agent - Object with: id, hostname, os, cpu, ram, disk, connected, lastSeen
 * 
 * Visual design:
 *   - Dark card with colored progress bars
 *   - Green = good, Yellow = warning, Red = critical
 *   - Shows "OFFLINE" overlay when agent disconnects
 */

function AgentCard({ agent }) {
  const { hostname, os, cpu, ram, disk, connected, lastSeen, inventory } = agent;
  const inv = inventory;

  /**
   * Returns a CSS class name based on the metric value.
   * 0-60% = good (green), 60-80% = warning (yellow), 80%+ = critical (red)
   */
  function getMetricClass(value) {
    if (value >= 80) return 'critical';
    if (value >= 60) return 'warning';
    return 'good';
  }

  /**
   * Formats a timestamp into a human-readable "Xs ago" string.
   */
  function timeSince(timestamp) {
    if (!timestamp) return 'never';
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 5) return 'just now';
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    return `${Math.floor(minutes / 60)}h ago`;
  }

  /**
   * CPU temperature display with freshness indicator.
   * Shows "stale" if the reading is older than 90 seconds.
   */
  function renderCpuTemp() {
    const cpuTemp = inv?.cpuTemp;
    if (!cpuTemp || cpuTemp.value == null) return null;
    const age = Date.now() - (cpuTemp.updatedAt || 0);
    const isStale = age > 90000;
    const tempStr = `${cpuTemp.value}°C`;
    return (
      <div className="cpu-temp">
        <span className="cpu-temp-label">CPU Temp:</span>
        <span className={`cpu-temp-value ${isStale ? 'stale' : ''}`}>
          {isStale ? 'stale' : tempStr}
        </span>
        {!isStale && (
          <span className="cpu-temp-age">({timeSince(cpuTemp.updatedAt)})</span>
        )}
      </div>
    );
  }

  return (
    <div className={`agent-card ${connected ? '' : 'offline'}`}>
      {/* Offline overlay */}
      {!connected && <div className="offline-overlay">OFFLINE</div>}

      {/* Agent header */}
      <div className="agent-header">
        <div className="agent-icon">💻</div>
        <div className="agent-info">
          <h3 className="agent-name">{hostname}</h3>
          <p className="agent-os">{os}</p>
        </div>
        <div className={`connection-dot ${connected ? 'online' : 'offline'}`}></div>
      </div>

      {/* Metrics */}
      <div className="metrics">
        {/* CPU */}
        <div className="metric">
          <div className="metric-header">
            <span className="metric-label">CPU</span>
            <span className="metric-value">{cpu}%</span>
          </div>
          <div className="progress-bar">
            <div
              className={`progress-fill ${getMetricClass(cpu)}`}
              style={{ width: `${Math.min(cpu, 100)}%` }}
            ></div>
          </div>
        </div>

        {/* CPU Temperature */}
        {renderCpuTemp()}

        {/* RAM */}
        <div className="metric">
          <div className="metric-header">
            <span className="metric-label">RAM</span>
            <span className="metric-value">{ram}%</span>
          </div>
          <div className="progress-bar">
            <div
              className={`progress-fill ${getMetricClass(ram)}`}
              style={{ width: `${Math.min(ram, 100)}%` }}
            ></div>
          </div>
        </div>

        {/* Disk */}
        <div className="metric">
          <div className="metric-header">
            <span className="metric-label">Disk</span>
            <span className="metric-value">{disk}%</span>
          </div>
          <div className="progress-bar">
            <div
              className={`progress-fill ${getMetricClass(disk)}`}
              style={{ width: `${Math.min(disk, 100)}%` }}
            ></div>
          </div>
        </div>
      </div>

      {/* Last seen timestamp */}
      <div className="last-seen">
        Last update: {timeSince(agent.lastSeen)}
      </div>
    </div>
  );
}
