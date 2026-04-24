import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { gatewayInvoke, resolveGatewayBaseUrl, resolveGatewayToken } from '../integrations/gateway.js';
import { parseSessionState, isStoppedSessionState } from './acp-monitor.js';
import { modelToHarness, resolveRuntime } from './runtime.js';

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

function log(level, msg) {
  console.log(`[LIFECYCLE] [${level}] ${msg}`);
}

// ── Active session state tracking ───────────────────────────────────────────

let _activeSession = null;
const _trackedAgents = new Map();

function resolveActiveSessionStatePath(opts = {}) {
  if (opts.activeStatePath) return path.resolve(opts.activeStatePath);
  return null;
}

function writeJsonAtomic(filePath, data) {
  if (!filePath) return;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2) + '\n');
  fs.renameSync(tmpPath, filePath);
}

function persistActiveSession(data) {
  const filePath = data?.activeStatePath || null;
  if (!filePath) return;
  writeJsonAtomic(filePath, {
    childSessionKey: data.childSessionKey || null,
    runId: data.runId || null,
    label: data.label || null,
    agentId: data.agentId || null,
    model: data.model || null,
    streamLogPath: data.streamLogPath || null,
    runtime: data.runtime || null,
    gatewayLabel: data.gatewayLabel || null,
    cwd: data.cwd || null,
    activeStatePath: filePath,
    trackedAt: new Date().toISOString(),
  });
}

function clearPersistedActiveSession(filePath) {
  if (!filePath) return;
  try { fs.unlinkSync(filePath); } catch {}
}

async function readSessionLifecycleState(childSessionKey, gatewayUrl, gatewayToken) {
  try {
    const raw = await requestGateway('session_status', { sessionKey: childSessionKey }, gatewayUrl, gatewayToken, 10000);
    const result = raw?.result?.details || raw;
    const parsed = parseSessionState(result);
    return { active: parsed.active, state: parsed.state, raw: result };
  } catch (err) {
    const msg = err?.message || String(err);
    if (/\b404\b|not found|unknown session/i.test(msg)) {
      return { active: false, state: 'closed', raw: null };
    }
    return { active: false, state: 'unreachable', raw: null, error: err };
  }
}

async function waitForSessionStop(childSessionKey, gatewayUrl, gatewayToken, timeoutMs = 15000, pollMs = 2000) {
  const deadline = Date.now() + Math.max(timeoutMs, 0);
  let lastState = { active: false, state: 'unknown', raw: null };

  while (Date.now() <= deadline) {
    lastState = await readSessionLifecycleState(childSessionKey, gatewayUrl, gatewayToken);
    if (!lastState.active && isStoppedSessionState(lastState.state)) {
      return { confirmed: true, ...lastState };
    }
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) break;
    await sleep(Math.min(pollMs, remainingMs));
  }

  return { confirmed: false, ...lastState };
}

export function getActiveSession() {
  return _activeSession ? { ..._activeSession } : null;
}

export function trackAgent(config, label, sessionKey, agentId, gatewayLabel, streamLogPath = null, extra = {}) {
  if (!label) return null;
  const entry = {
    sessionKey,
    agentId,
    gatewayLabel,
    streamLogPath,
    project: config?.project || extra?.project || null,
    ...extra,
  };
  _trackedAgents.set(label, entry);
  return entry;
}

export function untrackAgent(label) {
  if (!label) return false;
  return _trackedAgents.delete(label);
}

export function getTrackedAgent(label) {
  if (!label) return null;
  return _trackedAgents.get(label) || null;
}

export function getTrackedAgentCount() {
  return _trackedAgents.size;
}

export function listTrackedAgents() {
  return [..._trackedAgents.entries()];
}

export function clearActiveSession(opts = {}) {
  const preserveFile = opts?.preserveFile === true;
  const filePath = _activeSession?.activeStatePath || null;
  _activeSession = null;
  if (!preserveFile) clearPersistedActiveSession(filePath);
}

function setActiveSession(data) {
  _activeSession = { ...data };
  persistActiveSession(_activeSession);
}

export function recoverActiveSession(opts = {}) {
  const filePath = resolveActiveSessionStatePath(opts);
  if (!filePath || !fs.existsSync(filePath)) return null;
  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (!data?.childSessionKey) {
      clearPersistedActiveSession(filePath);
      return null;
    }
    _activeSession = { ...data, activeStatePath: filePath };
    return getActiveSession();
  } catch {
    clearPersistedActiveSession(filePath);
    return null;
  }
}

// ── Transcript path resolution ───────────────────────────────────────────────

export function resolveSubagentTranscriptPath(childSessionKey) {
  if (!childSessionKey) return null;
  try {
    const parentAgentId = String(childSessionKey).split(':')[1];
    if (!parentAgentId) return null;
    const sessionsDir = path.join(os.homedir(), '.openclaw', 'agents', parentAgentId, 'sessions');
    const sessionsJsonPath = path.join(sessionsDir, 'sessions.json');
    const sessionsData = JSON.parse(fs.readFileSync(sessionsJsonPath, 'utf8'));
    const entry = sessionsData?.[childSessionKey] || null;
    const sessionFile = entry?.sessionFile;
    if (sessionFile) {
      return path.isAbsolute(sessionFile)
        ? sessionFile
        : path.resolve(sessionsDir, sessionFile);
    }
    const sessionId = entry?.sessionId;
    if (!sessionId) return null;
    return path.join(sessionsDir, `${sessionId}.jsonl`);
  } catch {
    return null;
  }
}

export function resolveSpawnTranscriptPath(spawnResult, runtime) {
  const streamLogPath = spawnResult?.streamLogPath || null;
  if (streamLogPath) return streamLogPath;
  if (resolveRuntime({ runtime, model: null }) !== 'subagent') return null;
  return resolveSubagentTranscriptPath(spawnResult?.childSessionKey || null);
}

// ── Gateway helpers ──────────────────────────────────────────────────────────

function normalizeGatewayError(endpoint, err) {
  const msg = err?.message || String(err);
  const match = msg.match(/Gateway returned (\d+)/);
  if (match) return new Error(`Gateway ${endpoint} returned ${match[1]}`);
  return err;
}

async function requestGateway(endpoint, body, gatewayUrl, gatewayToken, timeoutMs = 30000) {
  try {
    return await gatewayInvoke(endpoint, body, timeoutMs, { gatewayUrl, gatewayToken });
  } catch (err) {
    throw normalizeGatewayError(endpoint, err);
  }
}

// ── ACP cleanup ──────────────────────────────────────────────────────────────

export function acpxCleanup(agentId, gatewayLabel) {
  if (!agentId || !gatewayLabel) return;
  try {
    execFileSync('acpx', [agentId, 'sessions', 'close', '--name', gatewayLabel], {
      stdio: 'ignore',
      timeout: 10000,
    });
    log('DEBUG', `acpx session closed: ${agentId} / ${gatewayLabel}`);
  } catch {
    log('DEBUG', `acpx session close failed (non-critical): ${agentId} / ${gatewayLabel}`);
  }
}

// ── Spawn ────────────────────────────────────────────────────────────────────

export async function spawnSession(payload, prompt, timeoutSeconds, opts = {}) {
  const session = payload?.session || {};
  const gatewayUrl = resolveGatewayBaseUrl(opts.gatewayUrl);
  const gatewayToken = resolveGatewayToken(opts.gatewayToken);
  const model = opts.model ?? session.model ?? null;
  const runtime = resolveRuntime({ runtime: opts.runtime ?? session.runtime, model });
  const agentId = opts.agentId || session.agentId || modelToHarness(model) || 'claude';
  const cwd = opts.cwd || session.cwd || process.cwd();
  const label = opts.label || session.label || `session-${Date.now()}`;
  const activeStatePath = resolveActiveSessionStatePath({
    activeStatePath: opts.activeStatePath ?? session.activeStatePath ?? session.active_session_path ?? null,
    cwd,
  });
  const isSubagent = runtime === 'subagent';
  const thinking = opts.thinking ?? session.thinking ?? null;
  const maxRetries = opts.maxRetries ?? 3;
  const retryDelayMs = opts.retryDelayMs ?? 5000;
  const shouldTrackActive = opts.trackActive !== false;

  const spawnArgs = {
    task: opts.task || prompt,
    runtime,
    label,
    model,
    cwd,
    thread: opts.thread ?? false,
    mode: opts.mode || 'run',
    cleanup: opts.cleanup || 'keep',
  };
  if (!isSubagent) {
    spawnArgs.agentId = agentId;
    spawnArgs.streamTo = opts.streamTo || 'parent';
    if (thinking) spawnArgs.thinking = thinking;
  }

  log('STEP', `Spawning ${isSubagent ? 'subagent' : 'ACP'} session: ${label} (model: ${model}, agentId: ${agentId}${thinking && !isSubagent ? `, thinking: ${thinking}` : ''})`);

  let lastErr;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const raw = await requestGateway('sessions_spawn', spawnArgs, gatewayUrl, gatewayToken, 30000);
      const result = raw?.result?.details || raw;
      if (result.status !== 'accepted') throw new Error(`Spawn not accepted: ${JSON.stringify(result)}`);

      const streamLogPath = resolveSpawnTranscriptPath(result, runtime);
      if (isSubagent && !result?.streamLogPath && streamLogPath) {
        log('DEBUG', `Subagent transcript path (resolved): ${streamLogPath}`);
      }

      const sessionData = {
        childSessionKey: result.childSessionKey,
        runId: result.runId,
        label,
        agentId,
        model,
        streamLogPath,
        runtime,
        gatewayLabel: label,
        cwd,
        activeStatePath,
      };

      log('OK', `Session spawned: ${label} -> ${result.childSessionKey}${streamLogPath ? ` (stream: ${streamLogPath})` : ''}`);
      if (shouldTrackActive) setActiveSession(sessionData);
      return sessionData;
    } catch (err) {
      lastErr = err;
      if (attempt < maxRetries) {
        log('WARN', `Spawn attempt ${attempt}/${maxRetries} failed: ${err.message} - retrying in ${retryDelayMs / 1000}s`);
        await sleep(retryDelayMs);
      }
    }
  }

  throw new Error(`Failed to spawn session '${label}' after ${maxRetries} attempts: ${lastErr?.message}`);
}

// ── Kill ─────────────────────────────────────────────────────────────────────

export async function killSession(childSessionKey, opts = {}) {
  if (!childSessionKey) {
    return {
      requested: false,
      confirmed: true,
      state: 'no_session_key',
      cleanupAttempted: false,
    };
  }
  const gatewayUrl = resolveGatewayBaseUrl(opts.gatewayUrl);
  const gatewayToken = resolveGatewayToken(opts.gatewayToken);
  const runtime = resolveRuntime({ runtime: opts.runtime, model: opts.model || null });
  const isSubagent = runtime === 'subagent';
  const label = opts.label || '';
  const confirmTimeoutMs = opts.confirmTimeoutMs ?? 15000;
  const confirmPollMs = opts.confirmPollMs ?? 2000;
  const cleanupConfirmTimeoutMs = opts.cleanupConfirmTimeoutMs ?? confirmTimeoutMs;

  log('STEP', `Killing ${isSubagent ? 'subagent' : 'ACP'} session: ${childSessionKey}${label ? ` (${label})` : ''}`);
  let requested = false;
  let confirmed = false;
  let state = 'unknown';
  let cleanupAttempted = false;

  let confirmation = await readSessionLifecycleState(childSessionKey, gatewayUrl, gatewayToken);
  if (!confirmation.active && isStoppedSessionState(confirmation.state)) {
    confirmed = true;
    state = confirmation.state || state;
    log('OK', `Session already stopped: ${childSessionKey} (${state})`);
    return { requested, confirmed, state, cleanupAttempted };
  }

  try {
    await requestGateway('sessions_send', { sessionKey: childSessionKey, message: opts.stopMessage || '/stop' }, gatewayUrl, gatewayToken, 15000);
    requested = true;
    log('INFO', `Stop requested for session: ${childSessionKey}`);
  } catch (err) {
    log('WARN', `Could not request stop for session '${childSessionKey}' - ${err.message}`);
  }

  confirmation = await waitForSessionStop(childSessionKey, gatewayUrl, gatewayToken, confirmTimeoutMs, confirmPollMs);
  confirmed = confirmation.confirmed;
  state = confirmation.state || state;

  if (!confirmed && !isSubagent && opts.agentId) {
    cleanupAttempted = true;
    log('WARN', `Session '${childSessionKey}' still active after stop request (${state}) - closing ACP harness session`);
    acpxCleanup(opts.agentId, label);
    confirmation = await waitForSessionStop(childSessionKey, gatewayUrl, gatewayToken, cleanupConfirmTimeoutMs, confirmPollMs);
    confirmed = confirmation.confirmed;
    state = confirmation.state || state;
  }

  if (confirmed) log('OK', `Session stopped: ${childSessionKey} (${state})`);
  else log('WARN', `Session stop unconfirmed: ${childSessionKey} (${state})`);

  return { requested, confirmed, state, cleanupAttempted };
}

// ── Active session helpers ───────────────────────────────────────────────────

export async function killActiveSession() {
  const session = _activeSession;
  if (!session) {
    log('DEBUG', 'killActiveSession: no active session tracked');
    return false;
  }
  log('INFO', `killActiveSession: killing ${session.childSessionKey} (${session.label})`);
  const result = await killSession(session.childSessionKey, {
    runtime: session.runtime,
    model: session.model || null,
    agentId: session.agentId,
    label: session.gatewayLabel || session.label,
  });
  clearActiveSession({ preserveFile: !result?.confirmed });
  return !!result?.confirmed;
}
