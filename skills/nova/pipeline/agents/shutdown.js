import fs from 'fs';
import { execFileSync } from 'child_process';
import { loadStatus, saveStatus } from '../services/status-store.js';
import { log } from '../core/logger.js';
import { resolveGatewayInvokeUrl, resolveGatewayToken } from '../../../common/pipeline/integrations/gateway.js';
import { closeTelemetryRedis } from '../services/telemetry.js';
import { transitionModuleStatus } from '../../../common/pipeline/lifecycle-state.js';
import { getTrackedAgent, killSession, listTrackedAgents, trackAgent, untrackAgent } from '../../../common/pipeline/agents/lifecycle.js';

const STATUS = { PASS: 'PASS', BLOCKED: 'BLOCKED', FAIL: 'FAIL' };
const EXIT_ERROR = 1;
const _shutdownState = { config: null, statusDir: null, currentLabel: null, shuttingDown: false };

function parsePsTable() {
  try {
    const out = execFileSync('ps', ['-eo', 'pid=,ppid=,command='], { encoding: 'utf8', timeout: 10000, stdio: ['ignore', 'pipe', 'ignore'] });
    return out.split('\n').map(line => line.trim()).filter(Boolean).map(line => {
      const match = line.match(/^(\d+)\s+(\d+)\s+(.*)$/);
      return match ? { pid: Number(match[1]), ppid: Number(match[2]), command: match[3] } : null;
    }).filter(Boolean);
  } catch { return null; }
}
function collectDescendants(rootPid, byParent, acc = new Set()) {
  const children = byParent.get(rootPid) || [];
  for (const child of children) {
    if (acc.has(child.pid)) continue;
    acc.add(child.pid);
    collectDescendants(child.pid, byParent, acc);
  }
  return acc;
}
function signalPid(pid, signal) { try { process.kill(pid, signal); return true; } catch { return false; } }
function pidAlive(pid) { try { process.kill(pid, 0); return true; } catch { return false; } }
function isWrapperCommand(command) {
  return /\bclaude-agent-acp\b|\bnpm\s+exec\b.*\bacp\b|\bacpx\b/i.test(command || '');
}
function readProcEnv(pid) {
  try {
    const raw = fs.readFileSync(`/proc/${pid}/environ`, 'utf8');
    const env = {};
    for (const entry of raw.split('\0')) {
      if (!entry) continue;
      const idx = entry.indexOf('=');
      if (idx <= 0) continue;
      env[entry.slice(0, idx)] = entry.slice(idx + 1);
    }
    return env;
  } catch {
    return null;
  }
}
function isTrackedAcpEnv(env, project) {
  if (!env || env.OPENCLAW_SHELL !== 'acp') return false;
  if (project && env.CURRENT_PROJECT && env.CURRENT_PROJECT !== project) return false;
  return true;
}
function getTrackedEntryBySessionKey(sessionKey) {
  for (const [, entry] of listTrackedAgents()) {
    if (entry?.sessionKey === sessionKey) return entry;
  }
  return null;
}
function isSessionLinked(command, agentId, sessionKey, gatewayLabel) {
  const hay = String(command || '');
  return (!!gatewayLabel && hay.includes(gatewayLabel)) || (!!sessionKey && hay.includes(sessionKey)) || (!!agentId && hay.includes(agentId));
}
function buildVictimSet(agentId, sessionKey, gatewayLabel = null) {
  const table = parsePsTable();
  if (!table) return [];

  const tracked = getTrackedEntryBySessionKey(sessionKey);
  const resolvedGatewayLabel = gatewayLabel || tracked?.gatewayLabel || null;
  const project = tracked?.project || _shutdownState.config?.project || null;
  const byParent = new Map();
  const byPid = new Map();
  for (const row of table) {
    byPid.set(row.pid, row);
    if (!byParent.has(row.ppid)) byParent.set(row.ppid, []);
    byParent.get(row.ppid).push(row);
  }

  const roots = table.filter(row => {
    if (row.pid === process.pid) return false;
    if (isSessionLinked(row.command, agentId, sessionKey, resolvedGatewayLabel)) {
      if (isWrapperCommand(row.command)) return true;
      return isTrackedAcpEnv(readProcEnv(row.pid), project);
    }
    if (!isWrapperCommand(row.command)) return false;
    return false;
  });

  const orphanRoots = table.filter(row => {
    if (row.pid === process.pid) return false;
    if (row.ppid !== 1) return false;
    if (!isWrapperCommand(row.command)) return false;
    return isTrackedAcpEnv(readProcEnv(row.pid), project);
  });

  const victims = new Map();
  for (const root of [...roots, ...orphanRoots]) {
    victims.set(root.pid, root);
    for (const pid of collectDescendants(root.pid, byParent)) {
      if (pid === process.pid) continue;
      const row = byPid.get(pid);
      if (row) victims.set(row.pid, row);
    }
  }

  return [...victims.values()].sort((a, b) => b.pid - a.pid);
}

export async function reaperAfterKill(agentId, sessionKey, gatewayLabel = null) {
  try {
    await new Promise(resolve => setTimeout(resolve, 2000));
    const victims = buildVictimSet(agentId, sessionKey, gatewayLabel);
    for (const row of victims) if (signalPid(row.pid, 'SIGTERM')) log('DEBUG', `Reaped PID ${row.pid} (${row.command})`);
    await new Promise(resolve => setTimeout(resolve, 1000));
    for (const row of victims) if (pidAlive(row.pid) && signalPid(row.pid, 'SIGKILL')) log('DEBUG', `Reaped PID ${row.pid} (${row.command})`);
  } catch (e) { log('DEBUG', `ACP reaper skipped (non-fatal): ${e.message}`); }
}

async function stopTrackedSession(label, entry, gatewayUrl, gatewayToken) {
  const sessionKey = entry?.sessionKey || entry;
  if (!sessionKey) {
    return {
      requested: false,
      confirmed: true,
      state: 'no_session_key',
      cleanupAttempted: false,
    };
  }

  const result = await killSession(sessionKey, {
    runtime: entry?.runtime || null,
    model: entry?.model || null,
    agentId: entry?.agentId || null,
    label: entry?.gatewayLabel || label,
    gatewayUrl,
    gatewayToken,
  });
  await reaperAfterKill(entry?.agentId || null, sessionKey, entry?.gatewayLabel || label || null);
  return result;
}

async function performSignalShutdown(signal, stateConfig, statusDir) {
  const gatewayUrl = resolveGatewayInvokeUrl();
  const gatewayToken = resolveGatewayToken();
  const trackedAgents = listTrackedAgents();

  if (trackedAgents.length > 0) {
    for (const [label, entry] of trackedAgents) {
      const sessionKey = entry?.sessionKey || entry;
      if (!sessionKey) continue;
      try {
        const result = await stopTrackedSession(label, entry, gatewayUrl, gatewayToken);
        log('INFO', `Shutdown: stop ${result?.confirmed ? 'confirmed' : 'requested'} for session '${label}' (${sessionKey}${result?.state ? `, ${result.state}` : ''})`);
      } catch (e) {
        log('WARN', `Shutdown: failed to stop session '${label}' (${sessionKey}): ${e.message}`);
      }
    }
  }

  if (stateConfig && statusDir) {
    try {
      const status = loadStatus(stateConfig, statusDir);
      if (status && ![STATUS.PASS, STATUS.BLOCKED].includes(status.status)) {
        transitionModuleStatus(status, STATUS.FAIL, {
          note: `Interrupted by ${signal}`,
        });
        saveStatus(stateConfig, statusDir, status);
      }
    } catch {}
  }

  try {
    await closeTelemetryRedis();
  } catch {}
}

export function registerShutdownHooks(config) {
  const handler = (signal) => {
    if (_shutdownState.shuttingDown) {
      log('WARN', `Received ${signal} during in-flight shutdown — ignoring duplicate signal`);
      return;
    }
    _shutdownState.shuttingDown = true;
    log('WARN', `Received ${signal} — initiating graceful shutdown`);
    const stateConfig = config || _shutdownState.config;
    const { statusDir } = _shutdownState;
    void performSignalShutdown(signal, stateConfig, statusDir)
      .catch((err) => {
        log('WARN', `Shutdown cleanup failed (non-fatal): ${err?.message || err}`);
      })
      .finally(() => {
        process.exit(EXIT_ERROR);
      });
  };
  process.on('SIGTERM', handler);
  process.on('SIGINT', handler);
}
export function setShutdownContext(config, agentType, moduleId, statusDir) {
  _shutdownState.config = config;
  _shutdownState.statusDir = statusDir;
  const agentConf = config.agents?.[agentType];
  if (!agentConf || agentConf.dispatch !== 'redis') {
    const label = `${agentType}-${moduleId}`;
    if (!getTrackedAgent(label)) trackAgent(config, label, null, null, null, null);
    _shutdownState.currentLabel = label;
  } else {
    _shutdownState.currentLabel = null;
  }
}
export function clearShutdownContext() {
  if (_shutdownState.currentLabel) {
    untrackAgent(_shutdownState.currentLabel);
    _shutdownState.currentLabel = null;
  }
  _shutdownState.statusDir = null;
}
