#!/usr/bin/env node
/**
 * macOS-specific inventory supplement for machine-monitor Phase 2.
 *
 * Replaces Unknown/N/A fields that systeminformation can't get on macOS:
 *   - CPU temperature      →  sudo powermetrics --samplers smc
 *   - RAM type & speed     →  system_profiler SPMemoryDataType
 *   - Battery health %     →  computed from designedCapacity / maxCapacity
 *   - Storage usage        →  diskutil apfs list + df (real used/free/%)
 *   - Display resolution   →  system_profiler SPDisplaysDataType
 *   - Uptime               →  os.uptime() (si.osInfo().uptime is 0 on macOS)
 *
 * Outputs JSON to stdout. Designed to be required from collectInventory().
 */

const { execSync } = require('child_process');
const os = require('os');

// ─── Helpers ───────────────────────────────────────────────────

function safeExec(cmd, timeout = 5000) {
  try {
    const env = { ...process.env, DEVELOPER_DIR: '', PATH: '/usr/sbin:/usr/bin:/bin:/sbin' };
    return execSync(cmd, { timeout, stdio: ['pipe', 'pipe', 'pipe'], env }).toString().trim();
  } catch (e) {
    return '';
  }
}

function parseField(text, key) {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`^\\s*${escapedKey}:\\s+(.+)$`, 'im');
  const m = text.match(re);
  return m ? m[1].trim() : null;
}

function parseFieldAll(text, key) {
  const re = new RegExp(`^\\s*${key}:\\s+(.+)$`, 'img');
  const results = [];
  let m;
  while ((m = re.exec(text)) !== null) {
    results.push(m[1].trim());
  }
  return results;
}

// ─── Parse diskutil apfs list ───────────────────────────────────

function parseAPFSList(raw) {
  const result = {
    containerTotalGB: null,
    containerUsedGB: null,
    containerFreeGB: null,
    containerUsedPercent: null,
    containerPhysStore: null,
    volumes: []
  };

  if (!raw) return result;

  // Container-level capacity
  const totalMatch = raw.match(/Size \(Capacity Ceiling\):\s+\d+\s+B\s+\(([\d.]+)\s+GB\)/);
  if (totalMatch) result.containerTotalGB = parseFloat(totalMatch[1]);

  const usedMatch = raw.match(/Capacity In Use By Volumes:\s+\d+\s+B\s+\(([\d.]+)\s+GB\)/);
  if (usedMatch) result.containerUsedGB = parseFloat(usedMatch[1]);

  const freeMatch = raw.match(/Capacity Not Allocated:\s+\d+\s+B\s+\(([\d.]+)\s+GB\)/);
  if (freeMatch) result.containerFreeGB = parseFloat(freeMatch[1]);

  const pctMatch = raw.match(/\(([\d.]+)%\s+used\)/);
  if (pctMatch) result.containerUsedPercent = parseFloat(pctMatch[1]);

  // Container-level physical store (applies to all volumes)
  const containerPhysMatch = raw.match(/APFS Physical Store Disk:\s+(\S+)/);
  if (containerPhysMatch) result.containerPhysStore = containerPhysMatch[1];

  // Split into volume blocks — each starts with "+-> Volume diskXsY UUID"
  const volBlocks = raw.split(/\n(?=\s*\+->\s+Volume\s+)/);
  for (const block of volBlocks) {
    const headerMatch = block.match(/^\s*\+->\s+Volume\s+(\S+)\s+([A-F0-9-]+)/);
    if (!headerMatch) continue;

    const diskId = headerMatch[1];
    const uuid = headerMatch[2];

    // Name: "Macintosh HD (Case-insensitive)" → strip parenthetical
    // Lines may be indented with pipes: "    |   Name:  Value"
    const nameMatch = block.match(/^\s+\|?\s*Name:\s+(.+)$/im) || block.match(/Name:\s+(.+)/i);
    const name = nameMatch
      ? nameMatch[1].replace(/\s*\(.*?\)\s*$/g, '').trim()
      : diskId;

    // Role: "disk1s1 (System)"
    const roleMatch = block.match(/APFS Volume Disk \(Role\):\s+\S+\s+\(([^)]+)\)/);
    const role = roleMatch ? roleMatch[1] : null;

    // Mount Point
    const mountMatch = block.match(/^\s+Mount Point:\s+(.+)$/im);
    const mountPoint = mountMatch ? mountMatch[1].trim() : null;
    const isMounted = mountPoint && mountPoint !== 'Not Mounted';

    // Capacity Consumed: "15418458112 B (15.4 GB)"
    const consumedMatch = block.match(/Capacity Consumed:\s+(\d+)\s+B\s+\(([\d.]+)\s+([KMGT]?B)\)/);
    const consumedBytes = consumedMatch ? parseInt(consumedMatch[1], 10) : null;
    let consumedGB = null;
    if (consumedMatch) {
      const val = parseFloat(consumedMatch[2]);
      const unit = consumedMatch[3];
      const mult = { 'B': 1/1e9, 'KB': 1/1e6, 'MB': 1/1e3, 'GB': 1, 'TB': 1e3 };
      consumedGB = val * (mult[unit] || 1);
    }

    // FileVault
    const fvMatch = block.match(/FileVault:\s+(Yes|No)/i);
    const encrypted = fvMatch ? fvMatch[1] === 'Yes' : false;

    // Use container-level physical store (not per-volume — it's only stated once)
    const physStore = result.containerPhysStore;

    result.volumes.push({
      diskId,
      name,
      role,
      mountPoint: isMounted ? mountPoint : null,
      consumedBytes,
      consumedGB: consumedGB !== null ? Math.round(consumedGB * 100) / 100 : null,
      containerTotalGB: result.containerTotalGB,
      containerFreeGB: result.containerFreeGB,
      containerUsedPercent: result.containerUsedPercent,
      physStore,
      encrypted
    });
  }

  return result;
}

// ─── macOS Inventory Collection ─────────────────────────────────

async function collectMacOSInventory() {
  const result = {
    cpuTemp: null,
    ramType: null,
    ramSpeed: null,
    ramSize: null,
    ramSlots: [],
    batteryHealth: null,
    batteryCondition: null,
    storage: { internal: [], external: [] },
    displayResolution: null,
    displayPanelType: null,
    uptime: os.uptime()
  };

  // ── CPU Temperature ──
  // Command: sudo powermetrics --samplers smc -n 1
  // Output: "CPU die temperature: XX.XX C"
  const powerMetrics = safeExec('sudo powermetrics --samplers smc -n 1 2>/dev/null', 8000);
  if (powerMetrics) {
    const tempMatch = powerMetrics.match(/CPU die temperature:\s+([\d.]+)\s+C/i);
    if (tempMatch) {
      result.cpuTemp = parseFloat(tempMatch[1]);
    }
  }

  // ── RAM Type, Speed, Size ──
  // Command: system_profiler SPMemoryDataType
  const memoryData = safeExec('system_profiler SPMemoryDataType 2>/dev/null');
  if (memoryData) {
    result.ramType = parseField(memoryData, 'Type');
    result.ramSpeed = parseField(memoryData, 'Speed');
    const sizes = parseFieldAll(memoryData, 'Size');
    if (sizes.length > 0) result.ramSize = sizes.join(', ');

    // Per-slot details (split on "BANK X/DIMM Y:" headers)
    const sections = memoryData.split(/\n\s*(?:Bank|BANK|Slot)\s+\d+\/\S+\s*:/i);
    for (let i = 1; i < sections.length; i++) {
      const s = sections[i];
      const slot = {
        size: parseField(s, 'Size'),
        type: parseField(s, 'Type'),
        speed: parseField(s, 'Speed'),
        status: parseField(s, 'Status'),
        manufacturer: parseField(s, 'Manufacturer'),
        partNumber: parseField(s, 'Part Number'),
        serial: parseField(s, 'Serial Number')
      };
      if (Object.values(slot).some(v => v !== null)) {
        result.ramSlots.push(slot);
      }
    }
  }

  // ── Battery Health ──
  // Command: system_profiler SPPowerDataType
  // Provides: Cycle Count, Condition, Full Charge Capacity (mAh)
  const powerData = safeExec('system_profiler SPPowerDataType 2>/dev/null');
  if (powerData) {
    result.batteryCondition = parseField(powerData, 'Condition');
    result.batteryCycleCount = parseField(powerData, 'Cycle Count');
    if (result.batteryCycleCount) result.batteryCycleCount = parseInt(result.batteryCycleCount);
    const fccStr = parseField(powerData, 'Full Charge Capacity (mAh)');
    result.batteryFullCharge_mAh = fccStr ? parseInt(fccStr.replace(/[^0-9]/g, ''), 10) : null;
  }

  // ── Storage (macOS APFS-aware) ──
  // 1. diskutil apfs list → container totals + per-volume consumed
  // 2. diskutil list + diskutil info → physical disk model/size/location
  // 3. df -k → real usage per mount point

  const apfsRaw = safeExec('diskutil apfs list 2>/dev/null');
  const apfsData = parseAPFSList(apfsRaw);

  // Physical disk map: disk path → { name, totalGB, type, interface, location, ... }
  const physicalDiskMap = {};
  const diskLocationMap = {};
  const diskListRaw = safeExec('diskutil list 2>/dev/null');
  if (diskListRaw) {
    for (const line of diskListRaw.split('\n')) {
      const m = line.match(/(\/dev\/disk\d+)\s+\(([^)]+)\)/);
      if (m) {
        diskLocationMap[m[1].replace(/^\/dev\//, '')] = m[2].includes('external') ? 'External' : 'Internal';
      }
    }

    // Get details for each physical disk
    const diskEntries = [...diskListRaw.matchAll(/\/dev\/disk\d+\s+\(([^)]+)\)/g)];
    for (const entry of diskEntries) {
      const diskPath = entry[0].split(' ')[0];
      if (!entry[1].includes('physical')) continue;

      const infoText = safeExec(`diskutil info ${diskPath} 2>/dev/null`);
      if (!infoText) continue;

      const model = parseField(infoText, 'Device / Media Name');
      const sizeStr = infoText.match(/Disk Size:\s+([\d.]+)\s+GB/);
      const totalGB = sizeStr ? parseFloat(sizeStr[1]) : null;
      const isSSD = infoText.includes('Solid State:               Yes');
      const iface = parseField(infoText, 'Protocol');
      const smart = parseField(infoText, 'SMART Status');
      // Note: "Serial Number" key in diskutil info; system_profiler uses different field
      const serialNum = infoText.match(/Serial Number:\s+(.+)/i);
      const shortPath = diskPath.replace(/^\/dev\//, '');  // /dev/disk0 → disk0
      physicalDiskMap[shortPath] = {
          name: model || shortPath,
          totalGB,
          type: isSSD ? 'SSD' : 'HDD',
          interface: iface,
          smartStatus: smart,
          serial: serialNum ? serialNum[1].trim() : null,
          location: diskLocationMap[diskPath] || 'Internal'
        };
    }
  }

  // df for real usage per mount point
  const dfData = {};
  const dfRaw = safeExec('df -k 2>/dev/null');
  if (dfRaw) {
    for (const line of dfRaw.split('\n').slice(1)) {
      const parts = line.split(/\s+/);
      if (parts.length >= 9) {
        const mount = parts[8];
        const totalKB = parseInt(parts[1], 10);
        const usedKB = parseInt(parts[2], 10);
        const freeKB = parseInt(parts[3], 10);
        const usedPct = parts[4] ? parseInt(parts[4].replace('%', ''), 10) : null;
        dfData[mount] = {
          totalGB: Math.round(totalKB / 1048576 * 10) / 10,
          usedGB: Math.round(usedKB / 1048576 * 10) / 10,
          freeGB: Math.round(freeKB / 1048576 * 10) / 10,
          usedPercent: usedPct
        };
      }
    }
  }

  // Build storage entries — one per physical disk, with volumes attached
  const systemVolumes = ['Preboot', 'Recovery', 'VM', 'Update'];
  const addedDisks = new Set();

  for (const vol of apfsData.volumes) {
    if (systemVolumes.includes(vol.name)) continue;

    const physDisk = vol.physStore || 'disk0s2';
    const physDiskRoot = physDisk.replace(/s\d+$/, '');
    const physInfo = physicalDiskMap[physDiskRoot];
    const location = physInfo ? physInfo.location :
      (diskLocationMap[physDiskRoot] || diskLocationMap['/dev/' + physDiskRoot] || 'Internal');

    // get usage: prefer df for mounted volumes, fallback to APFS container totals
    let usedGB, freeGB, totalGB, usedPercent;
    if (vol.mountPoint && dfData[vol.mountPoint]) {
      const df = dfData[vol.mountPoint];
      ({ usedGB, freeGB, totalGB, usedPercent } = df);
    } else if (vol.consumedGB !== null && apfsData.containerTotalGB) {
      // APFS container-level data
      totalGB = apfsData.containerTotalGB;
      usedGB = apfsData.containerUsedGB;
      freeGB = apfsData.containerFreeGB;
      usedPercent = apfsData.containerUsedPercent;
    } else {
      totalGB = vol.containerTotalGB;
      usedGB = vol.consumedGB;
      freeGB = null;
      usedPercent = null;
    }

    const diskKey = physDiskRoot;
    if (addedDisks.has(diskKey)) continue;
    addedDisks.add(diskKey);

    const entry = {
      name: physInfo ? physInfo.name : vol.name,
      model: physInfo ? physInfo.name : null,
      size: totalGB ? Math.round(totalGB * 1e9) : (physInfo && physInfo.totalGB ? Math.round(physInfo.totalGB * 1e9) : null),
      used: usedGB ? Math.round(usedGB * 1e9) : null,
      free: freeGB ? Math.round(freeGB * 1e9) : null,
      percent: usedPercent,
      type: physInfo ? physInfo.type : 'SSD',
      interface: physInfo ? physInfo.interface : null,
      smartStatus: physInfo ? physInfo.smartStatus : null,
      serial: physInfo ? physInfo.serial : null,
      location,
      volumes: [{
        name: vol.name,
        role: vol.role,
        mountPoint: vol.mountPoint,
        consumedGB: vol.consumedGB,
        encrypted: vol.encrypted
      }]
    };

    // Attach sibling volumes on same physical disk
    for (const other of apfsData.volumes) {
      if (other.diskId === vol.diskId) continue;
      const otherRoot = (other.physStore || 'disk0s2').replace(/s\d+$/, '');
      if (otherRoot === physDiskRoot) {
        entry.volumes.push({
          name: other.name,
          role: other.role,
          mountPoint: other.mountPoint,
          consumedGB: other.consumedGB,
          encrypted: other.encrypted
        });
      }
    }

    if (location === 'External') {
      result.storage.external.push(entry);
    } else {
      result.storage.internal.push(entry);
    }
  }

  // Fallback if nothing was added
  if (result.storage.internal.length === 0 && apfsData.containerTotalGB) {
    result.storage.internal.push({
      name: 'APFS Container',
      size: Math.round(apfsData.containerTotalGB * 1e9),
      used: apfsData.containerUsedGB ? Math.round(apfsData.containerUsedGB * 1e9) : null,
      free: apfsData.containerFreeGB ? Math.round(apfsData.containerFreeGB * 1e9) : null,
      percent: apfsData.containerUsedPercent,
      type: 'SSD',
      location: 'Internal',
      volumes: apfsData.volumes
        .filter(v => !systemVolumes.includes(v.name))
        .map(v => ({ name: v.name, mountPoint: v.mountPoint }))
    });
  }

  // ── Display Resolution ──
  // Command: system_profiler SPDisplaysDataType
  const displayRaw = safeExec('system_profiler SPDisplaysDataType 2>/dev/null');
  if (displayRaw) {
    const resMatch = displayRaw.match(/Resolution:\s+(\d+)\s+x\s+(\d+)/);
    if (resMatch) {
      result.displayResolution = `${resMatch[1]}x${resMatch[2]}`;
    }
    const panelMatch = displayRaw.match(/Display Type:\s+(.+)/i);
    if (panelMatch) result.displayPanelType = panelMatch[1].trim();
  }

  return result;
}

// ─── Lightweight CPU Temperature ────────────────────────────────
/**
 * Get current CPU temperature only — no other inventory.
 * Runs `powermetrics --samplers smc -n 1` and returns the die temperature.
 * Returns { value: number, updatedAt: number } or null on failure.
 */
async function getCpuTemp() {
  const { execSync } = require('child_process');
  try {
    const env = { ...process.env, DEVELOPER_DIR: '', PATH: '/usr/sbin:/usr/bin:/bin:/sbin' };
    const raw = execSync('sudo powermetrics --samplers smc -n 1 2>/dev/null', {
      timeout: 8000,
      stdio: ['pipe', 'pipe', 'pipe'],
      env
    }).toString().trim();
    const m = raw.match(/CPU die temperature:\s+([\d.]+)\s+C/i);
    if (m) {
      return { value: parseFloat(m[1]), updatedAt: Date.now() };
    }
  } catch (e) {}
  return null;
}

// ─── Main ──────────────────────────────────────────────────────
if (require.main === module) {
  collectMacOSInventory()
    .then(data => {
      console.log(JSON.stringify(data, null, 2));
      process.exit(0);
    })
    .catch(err => {
      console.error(JSON.stringify({ error: err.message }));
      process.exit(1);
    });
}

module.exports = { collectMacOSInventory, getCpuTemp };
