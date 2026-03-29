import { execFileSync } from 'child_process';
import { loadStatus, saveStatus, addHistory } from '../services/status-store.js';
import { log } from '../core/logger.js';
import { GATEWAY_URL, GATEWAY_TOKEN } from '../integrations/gateway.js';

const STATUS = { PASS: 'PASS', BLOCKED: 'BLOCKED', FAIL: 'FAIL' };
const EXIT_ERROR = 1;
const _shutdownState = { config: null, statusDir: null, activeSessions: new Map(), currentLabel: null };

function sleepSync(ms) {
  if (ms <= 0) return;
  try { execFileSync('sleep', [String(Math.max(1, Math.ceil(ms / 1000)))], { stdio: 'ignore', timeout: ms + 1000 }); }
  catch { const end = Date.now() + ms; while (Date.now() < end) {} }
}
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
function isWrapperCommand(command) { return /node.*claude-agent-acp|npm exec.*acp|sh.*acp/i.test(command || ''); }
function getTrackedEntryBySessionKey(sessionKey) {
  for (const entry of _shutdownState.activeSessions.values()) {
    if (entry?.sessionKey === sessionKey) return entry;
  }
  return null;
}
function isSessionLinked(command, agentId, sessionKey, gatewayLabel) {
  const hay = String(command || '');
  return (!!gatewayLabel && hay.includes(gatewayLabel)) || (!!sessionKey && hay.includes(sessionKey)) || (!!agentId && hay.includes(agentId));
}
function buildVictimSet(agentId, sessionKey) {
  const table = parsePsTable();
  if (!table) return [];

  const tracked = getTrackedEntryBySessionKey(sessionKey);
  const gatewayLabel = tracked?.gatewayLabel || null;
  const byParent = new Map();
  const byPid = new Map();
  for (const row of table) {
    byPid.set(row.pid, row);
    if (!byParent.has(row.ppid)) byParent.set(row.ppid, []);
    byParent.get(row.ppid).push(row);
  }

  const roots = table.filter(row => {
    if (row.pid === process.pid) return false;
    if (!isWrapperCommand(row.command)) return false;
    return isSessionLinked(row.command, agentId, sessionKey, gatewayLabel);
  });

  const victims = new Map();
  for (const root of roots) {
    victims.set(root.pid, root);
    for (const pid of collectDescendants(root.pid, byParent)) {
      if (pid === process.pid) continue;
      const row = byPid.get(pid);
      if (row) victims.set(row.pid, row);
    }
  }

  return [...victims.values()].sort((a, b) => b.pid - a.pid);
}

export function gatewayKillSync(sessionKey) {
  try {
    const payload = JSON.stringify({ tool: 'sessions_send', args: { sessionKey, message: '/stop' } });
    execFileSync('curl', ['-s', '-X', 'POST', '-H', 'Content-Type: application/json', ...(GATEWAY_TOKEN ? ['-H', `Authorization: Bearer ${GATEWAY_TOKEN}`] : []), '-d', payload, GATEWAY_URL], { stdio: 'ignore', timeout: 10000 });
  } catch {}
}
export function acpxCleanupSync(agentId, gatewayLabel) {
  if (!agentId || !gatewayLabel) return;
  try { execFileSync('acpx', [agentId, 'sessions', 'close', '--name', gatewayLabel], { stdio: 'ignore', timeout: 10000 }); } catch {}
}
export async function acpxCleanup(agentId, gatewayLabel) {
  if (!agentId || !gatewayLabel) return;
  try { execFileSync('acpx', [agentId, 'sessions', 'close', '--name', gatewayLabel], { stdio: 'ignore', timeout: 10000 }); log('DEBUG', `acpx session closed: ${agentId} / ${gatewayLabel}`); }
  catch { log('DEBUG', `acpx session close failed (non-critical): ${agentId} / ${gatewayLabel}`); }
}
export async function reaperAfterKill(agentId, sessionKey) {
  try {
    await new Promise(resolve => setTimeout(resolve, 2000));
    const victims = buildVictimSet(agentId, sessionKey);
    for (const row of victims) if (signalPid(row.pid, 'SIGTERM')) log('DEBUG', `Reaped PID ${row.pid} (${row.command})`);
    await new Promise(resolve => setTimeout(resolve, 1000));
    for (const row of victims) if (pidAlive(row.pid) && signalPid(row.pid, 'SIGKILL')) log('DEBUG', `Reaped PID ${row.pid} (${row.command})`);
  } catch (e) { log('DEBUG', `ACP reaper skipped (non-fatal): ${e.message}`); }
}
export function reaperAfterKillSync(agentId, sessionKey) {
  try {
    sleepSync(2000);
    const victims = buildVictimSet(agentId, sessionKey);
    for (const row of victims) if (signalPid(row.pid, 'SIGTERM')) log('DEBUG', `Reaped PID ${row.pid} (${row.command})`);
    sleepSync(1000);
    for (const row of victims) if (pidAlive(row.pid) && signalPid(row.pid, 'SIGKILL')) log('DEBUG', `Reaped PID ${row.pid} (${row.command})`);
  } catch (e) { log('DEBUG', `ACP reaper skipped (non-fatal): ${e.message}`); }
}
export function registerShutdownHooks(config) {
  const handler = (signal) => {
    log('WARN', `Received ${signal} — initiating graceful shutdown`);
    const stateConfig = config || _shutdownState.config;
    const { statusDir, activeSessions } = _shutdownState;
    if (stateConfig && activeSessions.size > 0) {
      for (const [label, entry] of activeSessions) {
        const sessionKey = entry?.sessionKey || entry;
        if (!sessionKey) continue;
        gatewayKillSync(sessionKey);
        acpxCleanupSync(entry?.agentId, entry?.gatewayLabel);
        reaperAfterKillSync(entry?.agentId, sessionKey);
        log('INFO', `Shutdown: killed session '${label}' (${sessionKey})`);
      }
    }
    if (stateConfig && statusDir) {
      try {
        const status = loadStatus(stateConfig, statusDir);
        if (status && ![STATUS.PASS, STATUS.BLOCKED].includes(status.status)) {
          addHistory(status, STATUS.FAIL, 'pipeline', `Interrupted by ${signal}`);
          status.status = STATUS.FAIL;
          status.current_phase = null;
          saveStatus(stateConfig, statusDir, status);
        }
      } catch {}
    }
    process.exit(EXIT_ERROR);
  };
  process.on('SIGTERM', handler);
  process.on('SIGINT', handler);
}
export function trackAgent(config, label, sessionKey, agentId, gatewayLabel, streamLogPath = null, extra = {}) {
  _shutdownState.config = config;
  _shutdownState.activeSessions.set(label, { sessionKey, agentId, gatewayLabel, streamLogPath, ...extra });
}
export function untrackAgent(label) { _shutdownState.activeSessions.delete(label); }
export function getTrackedAgent(label) { return _shutdownState.activeSessions.get(label); }
export function setShutdownContext(config, agentType, moduleId, statusDir) {
  _shutdownState.config = config;
  _shutdownState.statusDir = statusDir;
  const agentConf = config.agents?.[agentType];
  if (!agentConf || agentConf.dispatch !== 'redis') {
    const label = `${agentType}-${moduleId}`;
    if (!_shutdownState.activeSessions.has(label)) _shutdownState.activeSessions.set(label, { sessionKey: null, agentId: null, gatewayLabel: null, streamLogPath: null });
    _shutdownState.currentLabel = label;
  } else {
    _shutdownState.currentLabel = null;
  }
}
export function clearShutdownContext() {
  if (_shutdownState.currentLabel) {
    _shutdownState.activeSessions.delete(_shutdownState.currentLabel);
    _shutdownState.currentLabel = null;
  }
  _shutdownState.statusDir = null;
}
export function getShutdownState() { return _shutdownState; }
