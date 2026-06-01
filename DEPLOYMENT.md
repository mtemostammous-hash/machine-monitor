# Deployment Guide

## Prerequisites

All machines need:
- **Node.js** (v16 or later)
- **npm** (comes with Node.js)

## Step 1: Clone the Repository

On all 3 machines:
```bash
git clone https://github.com/<your-username>/machine-monitor.git
cd machine-monitor
```

## Step 2: Configure the Server (Linux)

```bash
cd server
npm install
```

The server will listen on port 3000 by default. To change:
```bash
PORT=8080 node index.js
```

Start the server:
```bash
node index.js
```

Expected output:
```
[server] Listening on port 3000
[server] Dashboard available at http://0.0.0.0:3000
```

**Find your Linux machine's IP:**
```bash
hostname -I
# or
ip addr show | grep 'inet '
```

## Step 3: Configure Agents (Windows + Mac)

On each agent machine:

```bash
cd agent
npm install
```

Set the server URL:

**Mac/Linux:**
```bash
export SERVER_URL=http://192.168.1.100:3000
```

**Windows PowerShell:**
```powershell
$env:SERVER_URL="http://192.168.1.100:3000"
```

**Windows CMD:**
```cmd
set SERVER_URL=http://192.168.1.100:3000
```

Start the agent:
```bash
node agent.js
```

Expected output:
```
[agent] Connecting to server at http://192.168.1.100:3000
[agent] Connected! Sending metrics every 5 seconds...
[agent] Sent metrics — CPU: 12% | RAM: 45% | Disk: 62%
```

## Step 4: Open the Dashboard

On any machine with a browser:

```
http://<linux-ip>:3000
```

You should see agent cards appear within 5 seconds of each agent connecting.

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Agent can't connect | Check firewall on Linux allows port 3000 |
| Dashboard not loading | Verify server is running: `curl http://localhost:3000` |
| No agents showing | Check `SERVER_URL` is set correctly on agent |
| Agent shows offline | Agent disconnected; restart `node agent.js` |

## Ports

| Service | Port | Direction |
|---------|------|-----------|
| Dashboard | 3000 | Browser → Linux |
| Socket.io | 3000 | Agents → Linux |

## Firewall

On the Linux server, allow port 3000:

```bash
# Ubuntu/Debian (ufw)
sudo ufw allow 3000/tcp

# CentOS/RHEL (firewalld)
sudo firewall-cmd --permanent --add-port=3000/tcp
sudo firewall-cmd --reload
```
