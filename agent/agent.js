/**
 * Machine Monitor — Agent (Phase 2)
 * 
 * Runs on each machine to be monitored (Windows, Mac, Linux worker).
 * 
 * Responsibilities:
 * 1. Collect system metrics: hostname, OS, CPU usage, RAM usage, disk usage
 * 2. Collect full hardware/software inventory (Phase 2)
 * 3. Connect to the central server via Socket.io
 * 4. Send metrics every 5 seconds
 * 5. Send inventory on connect and every 60 seconds
 * 6. Handle reconnection if the server goes down
 * 
 * Configuration via environment variables:
 *   SERVER_URL  — URL of the central server (default: http://localhost:3000)
 *   AGENT_NAME  — Optional custom name for this agent
 * 
 * Usage:
 *   npm install
 *   SERVER_URL=http://192.168.1.100:3000 node agent.js
 */

const io = require('socket.io-client');
const si = require('systeminformation');

// ─── Configuration ────────────────────────────────────────────
const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3000';
const AGENT_NAME = process.env.AGENT_NAME || '';
const METRICS_INTERVAL = 5000;  // 5 seconds between metric updates
const INVENTORY_INTERVAL = 60000; // 60 seconds between inventory refreshes
const CPU_TEMP_INTERVAL = 30000; // 30 seconds between CPU temperature refreshes

// ─── Helper: Lookup table for systeminformation ─────────────────
// Maps manufacturer/model strings to estimated release years
// for common hardware that si.system() doesn't always report
function estimateReleaseYear(manufacturer, model) {
  const m = `${manufacturer} ${model}`.toUpperCase();
  if (m.includes('14900') || m.includes('14700') || m.includes('13900') || m.includes('7950X')) return 2023;
  if (m.includes('13700') || m.includes('13600') || m.includes('13900') || m.includes('7900X')) return 2022;
  if (m.includes('12700') || m.includes('12600') || m.includes('12900') || m.includes('5900X') || m.includes('5800X')) return 2021;
  if (m.includes('11700') || m.includes('11900') || m.includes('5600X')) return 2021;
  if (m.includes('10700') || m.includes('10900') || m.includes('3900X') || m.includes('3700X')) return 2020;
  if (m.includes('9900') || m.includes('9700') || m.includes('2700X')) return 2018;
  if (m.includes('ROG') || m.includes('STRIX')) return 2020;
  return null;
}

/**
 * Extract release year from a version/model string.
 *
 * Handles formats:
 *   "MacBook Air (11-inch, Early 2015)"  → 2015
 *   "MacBook Pro (15-inch, Mid 2015)"    → 2015
 *   "iMac (27-inch, Late 2013)"          → 2013
 *   "MacBook Air (M1, 2020)"             → 2020
 *   "MacBook Pro (14-inch, 2021)"        → 2021
 *   "Lenovo G50-80"                       → null (no year in string)
 *
 * Returns integer year or null if unparseable.
 */
function parseReleaseYearFromVersion(version) {
  if (!version || typeof version !== 'string') return null;

  // Strategy 1: Match "Early|Mid|Late YYYY" inside parentheses
  const qualifierMatch = version.match(/(?:Early|Mid|Late)\s+(\d{4})/i);
  if (qualifierMatch) return parseInt(qualifierMatch[1], 10);

  // Strategy 2: Match a standalone 4-digit year inside parentheses
  const parenMatch = version.match(/\(([^)]+)\)/);
  if (parenMatch) {
    const inner = parenMatch[1];
    const yearMatch = inner.match(/(?:^|,\s*)(\d{4})(?:\s*$|,)/);
    if (yearMatch) return parseInt(yearMatch[1], 10);
  }

  // Strategy 3: Fallback — find any 4-digit year in the entire string
  const fallback = version.match(/(\d{4})/);
  if (fallback) return parseInt(fallback[1], 10);

  return null;
}

// ─── Collect System Metrics ───────────────────────────────────
async function collectMetrics() {
  try {
    const [cpuData, memData, diskData, osInfo] = await Promise.all([
      si.currentLoad(),
      si.mem(),
      si.fsSize(),
      si.osInfo()
    ]);

    const primaryDisk = diskData.find(d => d.mount === 'C:' || d.mount === '/') || diskData[0];

    return {
      hostname: AGENT_NAME || osInfo.hostname || require('os').hostname(),
      os: `${osInfo.distro || osInfo.platform} ${osInfo.release}`.trim(),
      cpu: Math.round(cpuData.currentLoad),
      ram: Math.round((memData.active / memData.total) * 100),
      disk: primaryDisk ? Math.round(primaryDisk.use) : 0
    };
  } catch (error) {
    console.error(`[agent] Error collecting metrics: ${error.message}`);
    return {
      hostname: AGENT_NAME || require('os').hostname(),
      os: process.platform,
      cpu: 0, ram: 0, disk: 0
    };
  }
}

// ─── Collect Full Inventory (Phase 2) ─────────────────────────
async function collectInventory() {
  try {
    const now = new Date().getFullYear();

    // Gather all(system, cpu, mem, graphics, disk, battery, network, display)
    const [sys, cpu, mem, graphics, diskLayout, battery, net, audio, usb] = await Promise.allSettled([
      si.system(),
      si.cpu(),
      si.mem(),
      si.graphics(),
      si.diskLayout(),
      si.battery(),
      si.networkInterfaces(),
      si.audio(),
      si.usb()
    ]);

    // Current metrics for live data
    const [cpuLoad, memData, fsData, osInfo, cpuTemp] = await Promise.allSettled([
      si.currentLoad(),
      si.mem(),
      si.fsSize(),
      si.osInfo(),
      si.cpuTemperature()
    ]);

    // ── System Info ──
    const sysInfo = sys.status === 'fulfilled' ? sys.value : {};
    const osData = osInfo.status === 'fulfilled' ? osInfo.value : {};
    const cpuData = cpu.status === 'fulfilled' ? cpu.value : {};

    const manufacturer = sysInfo.manufacturer || cpuData.manufacturer || '';
    const model = sysInfo.model || cpuData.model || '';
    const version = sysInfo.version || model;
    const releaseYear = sysInfo.releaseYear || parseReleaseYearFromVersion(version) || estimateReleaseYear(manufacturer + ' ' + model);
    const age = releaseYear ? now - releaseYear : null;

    // Determine machine class
    let machineClass = 'Desktop';
    if (model.toUpperCase().includes('LAPTOP') || model.toUpperCase().includes('NOTEBOOK') ||
        model.toUpperCase().includes('MACBOOK') || model.toUpperCase().includes('SURFACE') ||
        sysInfo.type === 'Notebook' || sysInfo.type === 'Laptop') {
      machineClass = 'Laptop';
    }

    // ── CPU Info ──
    const cpuInfo = cpu.status === 'fulfilled' ? cpu.value : {};
    const cpuLoadData = cpuLoad.status === 'fulfilled' ? cpuLoad.value : {};
    const tempData = cpuTemp.status === 'fulfilled' ? cpuTemp.value : {};

    const cpuInventory = {
      brand: cpuInfo.brand || cpuData.brand || 'Unknown',
      cores: cpuInfo.physicalCores || cpuInfo.cores || 0,
      threads: cpuInfo.cores || cpuInfo.processors || 0,
      speed: cpuInfo.speed || cpuInfo.speedMax || 0,
      temperature: tempData.main || tempData.cpus?.[0]?.temp || null
    };

    // ── RAM Info ──
    const memInfo = mem.status === 'fulfilled' ? mem.value : {};
    const memDataNow = memData.status === 'fulfilled' ? memData.value : {};

    const ramInventory = {
      total: memInfo.total || memDataNow.total || 0,
      type: memInfo.type || memInfo.ecc === false ? 'Non-ECC' : '',
      speed: memInfo.speed || memInfo.clockSpeed || null
    };

    // ── GPU Info ──
    const gpuInfo = graphics.status === 'fulfilled' ? graphics.value : {};
    const gpuControllers = Array.isArray(gpuInfo.controllers) ? gpuInfo.controllers : [];
    const primaryGpu = gpuControllers[0] || {};

    const gpuInventory = {
      model: primaryGpu.model || primaryGpu.name || 'Unknown',
      vram: primaryGpu.vram || primaryGpu.memoryTotal || null,
      vendor: primaryGpu.vendor || primaryGpu.vendorName || '',
      bus: primaryGpu.bus || '',
      driverVersion: primaryGpu.driverVersion || null
    };

    // ── Battery Info ──
    const batInfo = battery.status === 'fulfilled' ? battery.value : {};

    const batteryInventory = {
      hasBattery: batInfo.hasBattery ?? false,
      percent: batInfo.percent ?? null,
      health: batInfo.health ?? batInfo.cycleCount ?? null,
      isCharging: batInfo.isCharging ?? null,
      cycleCount: batInfo.cycleCount ?? 0
    };

    // ── Storage Info ──
    const disks = diskLayout.status === 'fulfilled' ? (diskLayout.value || []) : [];
    const fsSizes = fsData.status === 'fulfilled' ? (fsData.value || []) : [];

    const internal = disks.map(d => {
      // Find matching filesystem usage by matching device name
      const mount = fsSizes.find(f => {
        const fName = (f.fs || f.device || '').toLowerCase().trim();
        const dName = (d.device || d.name || '').toLowerCase().trim();
        return fName.includes(dName) || dName.includes(fName) || 
               f.device?.includes(d.name) || d.name?.includes(f.fs);
      });
      return {
        name: d.name || d.device || 'Unknown Disk',
        size: d.size || 0,
        used: mount?.used || mount?.size || 0,
        percent: mount?.use || 0,
        type: d.type || 'SSD',
        interface: d.interfaceType || ''
      };
    });

    // Fallback: if no disk layout, use fsSize data
    const storageInventory = {
      internal,
      external: [],
      optical: []
    };

    // ── Network Info ──
    const netInfo = net.status === 'fulfilled' ? (net.value || []) : [];
    const ifaces = Array.isArray(netInfo) ? netInfo : Object.values(netInfo).flat();

    // Find primary active interface (first non-internal IPv4)
    const primaryIface = ifaces.find(iface =>
      !iface.internal && iface.ip4 && iface.ip4 !== '127.0.0.1'
    ) || ifaces.find(iface => iface.ip4 && iface.ip4 !== '127.0.0.1') || ifaces[0] || {};

    const networkInventory = {
      ip: primaryIface.ip4 || 'Unknown',
      mac: primaryIface.mac || '',
      type: primaryIface.type || 'ethernet',
      speed: primaryIface.speed || null,
      iface: primaryIface.iface || ''
    };

    // ── Display Info ──
    const displays = gpuControllers.flatMap(c =>
      (c.displays || []).map(d => d.resolutionX && d.resolutionY
        ? `${d.resolutionX}x${d.resolutionY}`
        : null).filter(Boolean)
    );
    const resolution = displays[0] || null;

    // Try to get display size via systeminfo
    let displaySize = null;
    try {
      const displays2 = await si.graphics();
      const connectedDisplays = (displays2.controllers || []).flatMap(c => c.displays || []);
      const primary = connectedDisplays.find(d => d.currentResX) || connectedDisplays[0];
      if (primary && primary.widthMm && primary.heightMm) {
        displaySize = `${primary.widthMm}x${primary.heightMm}mm`;
      }
    } catch (e) {}

    const displayInventory = {
      resolution,
      size: displaySize
    };

    // ── Uptime ──
    const uptime = osData.uptime || require('os').uptime() || 0;

    // ── macOS-specific supplement ──
    // On macOS, systeminformation misses several fields. Use native commands.
    let macInventory = null;
    if (process.platform === 'darwin') {
      try {
        macInventory = require('./macos-inventory').collectMacOSInventory
          ? await require('./macos-inventory').collectMacOSInventory()
          : null;
      } catch (e) {
        console.error(`[agent] macOS inventory supplement failed: ${e.message}`);
      }
    }

    // Merge macOS data where the standard library returned null/empty
    if (macInventory) {
      // CPU temperature from SMC (si.cpuTemperature() returns null on macOS)
      if (!cpuInfo.temperature && macInventory.cpuTemp) {
        cpuInfo.temperature = macInventory.cpuTemp;
      }
      // RAM type & speed (si.mem() doesn't report these on macOS)
      if (macInventory.ramType) ramInventory.type = macInventory.ramType;
      if (macInventory.ramSpeed) ramInventory.speed = macInventory.ramSpeed;
      if (macInventory.ramSlots && macInventory.ramSlots.length > 0) {
        ramInventory.slots = macInventory.ramSlots;
      }
      // Battery health percentage
      if (batInfo.maxCapacity && batInfo.designedCapacity) {
        batteryInventory.health = Math.round((batInfo.maxCapacity / batInfo.designedCapacity) * 100);
      }
      if (macInventory.batteryCondition) {
        batteryInventory.condition = macInventory.batteryCondition;
      }
      // Storage with real usage (APFS-aware)
      if (macInventory.storage) {
        storageInventory.internal = macInventory.storage.internal;
        storageInventory.external = macInventory.storage.external;
      }
      // Display resolution (si.graphics() doesn't report on macOS)
      if (!displayInventory.resolution && macInventory.displayResolution) {
        displayInventory.resolution = macInventory.displayResolution;
      }
      if (macInventory.displayPanelType) {
        displayInventory.panelType = macInventory.displayPanelType;
      }
      // Uptime (si.osInfo().uptime is 0 on macOS)
      if (!uptime && macInventory.uptime) {
        uptime = macInventory.uptime;
      }
    }

    // ── Build full inventory object ──
    // On macOS, apply the live cpuTempState to cpuInfo.temperature
    // so the dashboard (which reads inv.cpu.temperature) gets the fresh value.
    if (process.platform === 'darwin' && cpuTempState.value != null) {
      cpuInfo.temperature = cpuTempState.value;
    }

    return {
      hostname: AGENT_NAME || osData.hostname || require('os').hostname(),
      os: `${osData.distro || osData.platform} ${osData.release}`.trim(),
      machineClass,
      manufacturer,
      model,
      version,
      serial: sysInfo.serial || null,
      releaseYear,
      age,
      cpu: cpuInfo,
      ram: ramInventory,
      gpu: gpuInventory,
      battery: batteryInventory,
      storage: storageInventory,
      network: networkInventory,
      display: displayInventory,
      uptime,
      cpuTemp: cpuTempState,
      collectedAt: Date.now()
    };

  } catch (error) {
    console.error(`[agent] Error collecting inventory: ${error.message}`);
    return {
      hostname: AGENT_NAME || require('os').hostname(),
      os: process.platform,
      error: error.message,
      collectedAt: Date.now()
    };
  }
}

// ─── Module-Level CPU Temperature State ────────────────────────
// On macOS, we refresh CPU temperature every 30s independently of
// the 60s inventory cycle, so the dashboard always has a fresh reading.
let cpuTempState = { value: null, updatedAt: null };

async function refreshCpuTemp() {
  if (process.platform !== 'darwin') return;
  try {
    const macInv = require('./macos-inventory');
    if (macInv.getCpuTemp) {
      const temp = await macInv.getCpuTemp();
      if (temp) {
        cpuTempState = temp;
      }
    }
  } catch (e) {
    // powermetrics may occasionally fail; keep last known value
  }
}

// ─── Connect to Server ────────────────────────────────────────
console.log(`[agent] Connecting to server at ${SERVER_URL}`);

const socket = io(SERVER_URL, {
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 2000,
  reconnectionDelayMax: 30000,
  timeout: 10000,
  transports: ["websocket"]
});

// ─── Connection Events ────────────────────────────────────────

let inventoryIntervalId = null;

socket.on('connect', async () => {
  console.log('[agent] Connected! Sending metrics every 5 seconds...');

  const osInfoData = await si.osInfo();
  const hostname = AGENT_NAME || osInfoData.hostname || require('os').hostname();

  // Register as an agent with the server
  socket.emit('register', {
    role: 'agent',
    hostname: hostname,
    os: `${osInfoData.distro || osInfoData.platform} ${osInfoData.release}`.trim()
  });

  // Send metrics immediately
  const metrics = await collectMetrics();
  socket.emit('metrics', metrics);
  console.log(`[agent] Sent metrics — CPU: ${metrics.cpu}% | RAM: ${metrics.ram}% | Disk: ${metrics.disk}%`);

  // Send inventory immediately on connect
  console.log('[agent] Collecting full inventory (Phase 2)...');
  try {
    const inventory = await collectInventory();
    socket.emit('inventory', inventory);
    console.log(`[agent] Sent inventory — CPU: ${inventory.cpu?.brand} | GPU: ${inventory.gpu?.model} | RAM: ${BytesToGB(inventory.ram?.total)}GB`);
  } catch (err) {
    console.error(`[agent] Failed to collect inventory: ${err.message}`);
  }

  // Then send metrics every METRICS_INTERVAL
  const intervalId = setInterval(async () => {
    if (!socket.connected) {
      clearInterval(intervalId);
      return;
    }
    try {
      const m = await collectMetrics();
      socket.emit('metrics', m);
      console.log(`[agent] Metrics — CPU: ${m.cpu}% | RAM: ${m.ram}% | Disk: ${m.disk}%`);
    } catch (err) {
      console.error(`[agent] Failed to send metrics: ${err.message}`);
    }
  }, METRICS_INTERVAL);

  // Refresh inventory every INVENTORY_INTERVAL
  inventoryIntervalId = setInterval(async () => {
    if (!socket.connected) {
      clearInterval(inventoryIntervalId);
      return;
    }
    try {
      const inv = await collectInventory();
      socket.emit('inventory', inv);
      console.log(`[agent] Inventory refreshed — CPU: ${inv.cpu?.brand} | GPU: ${inv.gpu?.model}`);
    } catch (err) {
      console.error(`[agent] Failed to refresh inventory: ${err.message}`);
    }
  }, INVENTORY_INTERVAL);

  // Refresh CPU temperature every CPU_TEMP_INTERVAL (macOS only)
  // Store into cpuTempState so the next full inventory (60s) picks it up.
  // We do NOT emit a separate inventory event for cpuTemp — the running server
  // does full replacement on inventory events, so a partial update would wipe
  // all other fields.
  if (process.platform === 'darwin') {
    // Read immediately on connect so first inventory has a fresh value
    refreshCpuTemp();
    const cpuTempIntervalId = setInterval(async () => {
      if (!socket.connected) {
        clearInterval(cpuTempIntervalId);
        return;
      }
      const prev = cpuTempState.value;
      await refreshCpuTemp();
      if (cpuTempState.value !== prev) {
        console.log(`[agent] CPU temp — ${cpuTempState.value}°C`);
      }
    }, CPU_TEMP_INTERVAL);
  }
});

socket.on('disconnect', (reason) => {
  console.log(`[agent] Disconnected: ${reason}`);
  if (inventoryIntervalId) clearInterval(inventoryIntervalId);
});

socket.on('connect_error', (error) => {
  console.error(`[agent] Connection error: ${error.message}`);
});

socket.on('reconnect', (attemptNumber) => {
  console.log(`[agent] Reconnected after ${attemptNumber} attempt(s)`);
});

socket.on('reconnect_error', (error) => {
  console.error(`[agent] Reconnection failed: ${error.message}`);
});

// Helper for logging
function BytesToGB(bytes) {
  if (!bytes) return '0';
  return (bytes / (1024 * 1024 * 1024)).toFixed(1);
}
