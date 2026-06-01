/**
 * Machine Monitor — Central Server
 * 
 * Runs on the Linux coordinator machine.
 * 
 * Responsibilities:
 * 1. Serve the static React dashboard (from ./public)
 * 2. Accept WebSocket connections from agents (via Socket.io)
 * 3. Receive metrics from agents and store in memory
 * 4. Broadcast updated agent list to all connected dashboard clients
 * 
 * No database — all data is in-memory only (resets on server restart).
 * No authentication — Phase 1 trusts all connections.
 */

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

// ─── Configuration ────────────────────────────────────────────
const PORT = process.env.PORT || 3000;

// ─── Express App Setup ────────────────────────────────────────
const app = express();
const server = http.createServer(app);

// Serve static React dashboard from the ./public directory
// This means index.html, CSS, and JS files are all served from here
app.use(express.static(path.join(__dirname, 'public')));

// ─── Socket.io Setup ──────────────────────────────────────────
const io = new Server(server, {
  // Allow connections from any origin (agents may be on different machines)
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// ─── In-Memory Agent Store ────────────────────────────────────
// Structure: { [socketId]: { hostname, os, cpu, ram, disk, lastSeen, connected } }
const agents = {};

// ─── Track connected dashboard clients ────────────────────────
let dashboardCount = 0;

/**
 * Broadcast the current list of agents to all connected dashboard clients.
 * Called whenever an agent connects, disconnects, or sends new metrics.
 */
function broadcastAgents() {
  // Convert agents object to array for easier consumption by the frontend
  const agentList = Object.entries(agents).map(([id, data]) => ({
    id,
    ...data
  }));
  
  // Emit to ALL connected Socket.io clients (dashboards)
  io.emit('agents', agentList);
}

// ─── Socket.io Connection Handler ─────────────────────────────
io.on('connection', (socket) => {
  console.log(`[server] New connection: ${socket.id}`);

  // ── Agent registration ──
  // Agents identify themselves by emitting a 'register' event with their role
  socket.on('register', (data) => {
    const role = data.role || 'unknown';
    
    if (role === 'agent') {
      // This is an agent — initialize its entry in the store
      agents[socket.id] = {
        hostname: data.hostname || 'unknown',
        os: data.os || 'unknown',
        cpu: 0,
        ram: 0,
        disk: 0,
        lastSeen: Date.now(),
        connected: true
      };
      console.log(`[server] Agent registered: ${data.hostname} (${data.os})`);
      broadcastAgents();
    } else if (role === 'dashboard') {
      // This is a dashboard client — send current agents immediately
      dashboardCount++;
      console.log(`[server] Dashboard connected (total: ${dashboardCount})`);
      // Send current state right away so dashboard doesn't wait for next update
      socket.emit('agents', Object.entries(agents).map(([id, data]) => ({ id, ...data })));
    }
  });

  // ── Agent metrics update ──
  // Agents send metrics every 5 seconds via 'metrics' event
  socket.on('metrics', (data) => {
    if (agents[socket.id]) {
      agents[socket.id].cpu = data.cpu || 0;
      agents[socket.id].ram = data.ram || 0;
      agents[socket.id].disk = data.disk || 0;
      agents[socket.id].lastSeen = Date.now();
      agents[socket.id].connected = true;
      
      // Log at debug level (can be noisy with many agents)
      console.log(
        `[server] Metrics from ${agents[socket.id].hostname}: ` +
        `CPU=${data.cpu}% RAM=${data.ram}% Disk=${data.disk}%`
      );
      
      broadcastAgents();
    }
  });

  // ── Agent inventory update (Phase 2) ──
  // Agents send full inventory on connect + every 60s.
  // They also send lightweight partial updates (e.g. cpuTemp) every 30s.
  // We merge partial updates into the stored inventory.
  socket.on('inventory', (data) => {
    if (agents[socket.id]) {
      if (!agents[socket.id].inventory) {
        agents[socket.id].inventory = {};
      }
      // Merge: overwrite top-level keys that are present in the update
      for (const [key, val] of Object.entries(data)) {
        if (val !== undefined) {
          agents[socket.id].inventory[key] = val;
        }
      }
      agents[socket.id].inventory.collectedAt = Date.now();
      broadcastAgents();
    }
  });

  // ── Disconnection handler ──
  socket.on('disconnect', () => {
    if (agents[socket.id]) {
      console.log(`[server] Agent disconnected: ${agents[socket.id].hostname}`);
      // Mark as offline but keep in store so dashboard can show "offline" status
      agents[socket.id].connected = false;
      agents[socket.id].lastSeen = Date.now();
      broadcastAgents();
      
      // Remove from store after 30 seconds of being offline
      // (gives dashboard time to show "offline" status)
      setTimeout(() => {
        if (agents[socket.id] && !agents[socket.id].connected) {
          delete agents[socket.id];
          broadcastAgents();
        }
      }, 30000);
    } else {
      dashboardCount = Math.max(0, dashboardCount - 1);
      console.log(`[server] Dashboard disconnected (total: ${dashboardCount})`);
    }
  });
});

// ─── Start Server ─────────────────────────────────────────────
server.listen(PORT, '0.0.0.0', () => {
  console.log(`[server] Listening on port ${PORT}`);
  console.log(`[server] Dashboard available at http://0.0.0.0:${PORT}`);
  console.log(`[server] Waiting for agents to connect...`);
});
