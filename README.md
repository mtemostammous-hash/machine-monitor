# Machine Monitor

A real-time multi-machine monitoring dashboard. Phase 1 proof of concept.

## Architecture

```
┌──────────────┐     WebSocket      ┌──────────────┐
│   Windows    │ ──────────────────►│              │
│   Agent      │                    │   Linux      │
└──────────────┘                    │   Server     │                                   │  (Express +   │
┌──────────────┐     WebSocket      │   Socket.io) │
│    Mac       │ ──────────────────►│              │
│   Agent      │                    └──────┬───────┘
└──────────────┘                           │ HTTP
                                           ▼
                                   ┌──────────────┐
                                   │   Browser    │
                                   │  Dashboard   │
                                   │   (React)    │
                                   └──────────────┘
```

## Quick Start

### 1. Set up the Server (Linux)

```bash
cd server
npm install
node index.js
```

### 2. Set up Agents (Windows + Mac)

```bash
cd agent
npm install
# Set the server URL:
export SERVER_URL=http://<linux-ip>:3000   # Mac/Linux
set SERVER_URL=http://<linux-ip>:3000      # Windows CMD
$env:SERVER_URL="http://<linux-ip>:3000"   # Windows PowerShell
node agent.js
```

### 3. Open Dashboard

Navigate to `http://<linux-ip>:3000` in your browser.

## Project Structure

```
machine-monitor/
├── README.md
├── DEPLOYMENT.md
├── server/                  # Runs on Linux (central server)
│   ├── package.json
│   ├── index.js
│   └── public/              # React dashboard (static files)
│       ├── index.html
│       ├── css/style.css
│       └── js/
│           ├── app.js
│           ├── Dashboard.js
│           └── AgentCard.js
├── agent/                   # Runs on Windows + Mac (clients)
│   ├── package.json
│   └── agent.js
└── docs/
    └── plans/
        └── phase-1.md
```

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Backend | Node.js + Express + Socket.io |
| Frontend | React (CDN) + Socket.io client |
| Agent | Node.js + Socket.io client + systeminformation |
| Transport | WebSocket (Socket.io) |
| Storage | In-memory (no database) |

## Phase 1 Features

- ✅ Real-time metrics (CPU, RAM, Disk, Hostname, OS)
- ✅ 5-second update interval
- ✅ Multi-machine support
- ✅ Dark-themed dashboard
- ✅ Agent auto-detection (connect/disconnect)
- ❌ No authentication (Phase 1)
- ❌ No database (Phase 1)
- ❌ No AI features (Phase 1)
