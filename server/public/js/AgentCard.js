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

      {/* Details toggle button */}
      {hasInventory && (
        <button
          type="button"
          className="btn-details"
          onClick={() => setExpanded(!expanded)}
          aria-expanded={expanded}
        >
          {expanded ? '▲ Hide Details' : '▼ Show Details'}
        </button>
      )}

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

      {/* Expanded detail panel */}
      {expanded && hasInventory && (
        <div className="detail-panel">
          {/* Machine */}
          <div className="detail-section">
            <h4>MACHINE</h4>
            <table>
              <tbody>
                <tr><td>Type</td><td>{inv.machineClass}</td></tr>
                <tr><td>Manufacturer</td><td>{inv.manufacturer || 'Unknown'}</td></tr>
                <tr><td>Model</td><td>{inv.model || 'Unknown'}</td></tr>
                <tr><td>Version</td><td>{inv.version || '—'}</td></tr>
                <tr><td>Serial</td><td>{inv.serial && inv.serial !== '-' ? inv.serial : '—'}</td></tr>
                <tr><td>OS</td><td>{inv.os}</td></tr>
                <tr><td>Release Year</td><td>{inv.releaseYear || 'Unknown'}</td></tr>
                <tr><td>Age</td><td>{inv.age != null ? `${inv.age} year${inv.age !== 1 ? 's' : ''}` : 'Unknown'}</td></tr>
                <tr><td>Uptime</td><td>{formatUptime(inv.uptime)}</td></tr>
                <tr><td>Display</td><td>{inv.display?.resolution}{inv.display?.size ? ` (${inv.display.size})` : ''}</td></tr>
              </tbody>
            </table>
          </div>

          {/* CPU */}
          {inv.cpu?.brand && (
            <div className="detail-section">
              <h4>CPU</h4>
              <table>
                <tbody>
                  <tr><td>Model</td><td>{inv.cpu.brand}</td></tr>
                  <tr><td>Cores / Threads</td><td>{inv.cpu.cores}C / {inv.cpu.threads}T</td></tr>
                  <tr><td>Base Clock</td><td>{inv.cpu.speed} GHz</td></tr>
                  <tr><td>Temperature</td><td>{inv.cpu.temperature != null ? `${inv.cpu.temperature}°C` : 'N/A'}</td></tr>
                  {inv.systemTemp != null && !isNaN(inv.systemTemp) && (
                    <tr><td>System Temp</td><td>{inv.systemTemp}°C</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* Memory */}
          {inv.ram?.total > 0 && (
            <div className="detail-section">
              <h4>MEMORY</h4>
              <table>
                <tbody>
                  <tr><td>Total</td><td>{Math.round(inv.ram.total / (1024 ** 3))} GB</td></tr>
                  <tr><td>Type</td><td>{inv.ram.type || 'Unknown'}</td></tr>
                  {inv.ram.speed ? <tr><td>Speed</td><td>{inv.ram.speed} MHz</td></tr> : null}
                  {inv.ram.formFactor ? <tr><td>Form Factor</td><td>{inv.ram.formFactor}</td></tr> : null}
                  {inv.ram.manufacturer ? <tr><td>Manufacturer</td><td>{inv.ram.manufacturer}</td></tr> : null}
                </tbody>
              </table>
            </div>
          )}

          {/* GPU */}
          {inv.gpu?.model && inv.gpu.model !== 'Unknown' && (
            <div className="detail-section">
              <h4>GPU</h4>
              <table>
                <tbody>
                  <tr><td>Model</td><td>{inv.gpu.model}</td></tr>
                  <tr><td>VRAM</td><td>{inv.gpu.vram > 0 ? `${inv.gpu.vram} MB` : 'Shared'}</td></tr>
                  {inv.gpu.vendor ? <tr><td>Vendor</td><td>{inv.gpu.vendor}</td></tr> : null}
                </tbody>
              </table>
            </div>
          )}

          {/* Storage */}
          {storageDetails.length > 0 && (
            <div className="detail-section">
              <h4>STORAGE</h4>
              {storageSummary.map((line, i) => (
                <p key={i} className="storage-summary-line">{line}</p>
              ))}
              <table className="storage-table">
                <thead><tr><th>Type</th><th>Name</th><th>Size</th><th>Used</th><th>Usage</th></tr></thead>
                <tbody>
                  {storageDetails.map((d, i) => {
                    const pct = d.percent;
                    const hasPct = pct != null && Number.isFinite(Number(pct));
                    return (
                      <tr key={i}>
                        <td>{d.type}</td>
                        <td>{d.name}</td>
                        <td>{d.size}</td>
                        <td>{hasPct ? `${pct}%` : '—'}</td>
                        <td>
                          {hasPct ? (
                            <div className="progress-bar progress-bar-sm">
                              <div className={`progress-fill ${getMetricClass(pct)}`} style={{ width: `${Math.min(Math.max(pct, 0), 100)}%` }}></div>
                            </div>
                          ) : (
                            <span className="storage-na">Unavailable</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Battery */}
          {inv.battery?.hasBattery && (
            <div className="detail-section">
              <h4>BATTERY</h4>
              <table>
                <tbody>
                  <tr><td>Charge</td><td>{inv.battery.percent != null ? `${inv.battery.percent}%` : 'N/A'}</td></tr>
                  <tr><td>Status</td><td>{inv.battery.isCharging == null ? 'Unknown' : inv.battery.isCharging ? 'Charging ⚡' : 'Not charging'}</td></tr>
                  <tr><td>Health</td><td>{inv.battery.health != null ? `${inv.battery.health}%` : 'N/A'}</td></tr>
                  <tr><td>Cycles</td><td>{inv.battery.cycleCount != null ? inv.battery.cycleCount : 'Unsupported'}</td></tr>
                  {inv.battery.designCapacity != null ? (
                    <tr><td>Design Capacity</td><td>{inv.battery.designCapacity} Wh</td></tr>
                  ) : null}
                  {inv.battery.fullChargeCapacity != null ? (
                    <tr><td>Full Charge Capacity</td><td>{inv.battery.fullChargeCapacity} Wh</td></tr>
                  ) : null}
                  {inv.battery.voltage != null ? (
                    <tr><td>Voltage</td><td>{inv.battery.voltage}V</td></tr>
                  ) : null}
                  {inv.battery.chemistry ? (
                    <tr><td>Chemistry</td><td>{inv.battery.chemistry}</td></tr>
                  ) : null}
                  {inv.battery.serial ? (
                    <tr><td>Serial</td><td>{inv.battery.serial}</td></tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          )}

          {/* Network */}
          {inv.network?.ip && (
            <div className="detail-section">
              <h4>NETWORK</h4>
              <table>
                <tbody>
                  <tr><td>IP</td><td>{inv.network.ip}</td></tr>
                  {inv.network.mac ? <tr><td>MAC</td><td>{inv.network.mac}</td></tr> : null}
                  <tr><td>Type</td><td>{inv.network.type}</td></tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Inventory loaded hint */}
      {!expanded && hasInventory && (
        <div className="inventory-loaded-hint">Inventory loaded — click ▼ Show Details</div>
      )}
    </div>
  );
}
