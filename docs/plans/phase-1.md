# Phase 1 Implementation Plan

> **For Hermes:** This plan has been implemented. Saved for reference and for the deployment guide.

## Goal
Build a working proof-of-concept multi-machine monitoring dashboard where Linux acts as the central server and Windows/Mac act as agents sending real-time metrics.

## Architecture
- **Server (Linux):** Express + Socket.io, serves React dashboard, receives agent metrics
- **Agents (Windows/Mac):** Node.js scripts using `systeminformation` + Socket.io client
- **Frontend:** React via CDN + Babel (no build step), dark theme, progress bars
- **Transport:** WebSocket (Socket.io), 5-second update interval
- **Storage:** In-memory only (no database)

## Milestones

- [x] M1: Repo structure created
- [x] M2: Backend server (Express + Socket.io)
- [x] M3: Agent script (system metrics collector)
- [x] M4: React dashboard frontend
- [ ] M5: Deploy server on Linux
- [ ] M6: Deploy agent on Windows
- [ ] M7: Deploy agent on Mac
- [ ] M8: End-to-end communication test

## Folder Structure
```
machine-monitor/
├── README.md
├── DEPLOYMENT.md
├── .gitignore
├── server/
│   ├── package.json
│   ├── index.js
│   └── public/
│       ├── index.html
│       ├── css/style.css
│       └── js/
│           ├── app.js
│           ├── Dashboard.js
│           └── AgentCard.js
├── agent/
│   ├── package.json
│   └── agent.js
└── docs/plans/phase-1.md
```

## Decisions
| Decision | Rationale |
|----------|-----------|
| Socket.io over REST polling | Real-time, efficient, bidirectional |
| systeminformation library | Cross-platform, one API for all OS |
| In-memory store, no DB | YAGNI for Phase 1 |
| React CDN + Babel, no build | Beginner-friendly, zero setup |
| Single agent.js for all OS | systeminformation handles platform differences |
| Pure CSS, no framework | Zero dependencies |
| 5-second update interval | Balance between real-time and server load |
| 30-second offline retention | Dashboard can briefly show offline status |
