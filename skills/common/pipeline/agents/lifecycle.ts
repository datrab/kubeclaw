// @ts-expect-error Node built-in ambient types are not installed for this migration island.
import { execFile } from 'child_process';
import { buildSubprocessEnv } from '../security.ts';
// @ts-expect-error Node built-in ambient types are not installed for this migration island.
import { promisify } from 'util';
// @ts-expect-error Node built-in ambient types are not installed for this migration island.
import fs from 'fs';
// @ts-expect-error Node built-in ambient types are not installed for this migration island.
import os from 'os';
// @ts-expect-error Node built-in ambient types are not installed for this migration island.
import path from 'path';
import {
  getGatewaySessionStatus,
  killGatewaySubagent,
  listGatewaySubagents,
  resolveGatewayBaseUrl,
  resolveGatewayToken,
  sendGatewaySessionMessage,
  spawnGatewaySession,
} from '../integrations/gateway.ts';
import { parseSessionState, isStoppedSessionState } from './session-semantics.ts';
import { resolveRuntime } from './runtime.ts';
import { isBudgetExhaustedError, sleep } from '../timing.ts';
import {
  assertValidKillSessionResult,
  assertValidSessionLifecycleRecord,
} from '../services/acp-gateway-contract.ts';
export {
  getTrackedAgent,
  getTrackedAgentCount,
  listTrackedAgents,
  trackAgent,
  untrackAgent,
} from './tracked-agents.ts';

declare const process: any;
type AnyRecord = Record<string, any>;
type AnyFunction = (...args: any[]) => any;
type ExecFileAsync = (command: string, args: string[], options?: Record<string, unknown>) => Promise<unknown>;

const execFileAsyncDefault = promisify(execFile) as ExecFileAsync;

function log(level: any, msg: any) {
  console.log(`[LIFECYCLE] [${level}] ${msg}`);
}

// ── Active session state tracking ───────────────────────────────────────────

let _activeSession: AnyRecord | null = null;

function resolveActiveSessionStatePath(opts: AnyRecord = {}) {
  if (opts.activeStatePath) return path.resolve(opts.activeStatePath);
  return null;
}

function writeJsonAtomic(filePath: any, data: any) {
  if (!filePath) return;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2) + '\n');
  fs.renameSync(tmpPath, filePath);
}

function persistActiveSession(data: AnyRecord) {
  assertValidSessionLifecycleRecord(data, 'active session record');
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

function clearPersistedActiveSession(filePath: any) {
  if (!filePath) return;
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch (error) {
    try {
      process.stderr.write(`[session-lifecycle] active-session cleanup failed: ${(error as any)?.message || error}\n`);
    } catch (_stderrError) {
      // Best-effort cleanup must not block session lifecycle progress.
    }
  }
}

async function readSessionLifecycleState(childSessionKey: any, gatewayUrl: any, gatewayToken: any, timeoutMs: number = 10000, waitOptions: AnyRecord = {}): Promise<AnyRecord> {
  try {
    const raw = await requestGateway(getGatewaySessionStatus, 'session status', childSessionKey, timeoutMs, { gatewayUrl, gatewayToken, ...waitOptions });
    const result: AnyRecord = raw?.result?.details || raw;
    const parsed = parseSessionState(result);
    return { active: parsed.active, state: parsed.state, raw: result };
  } catch (err) {
    if (isCallerAbort(err, waitOptions.signal, waitOptions.budget)) throw err;
    const msg = (err as any)?.message || String(err);
    if (/\b404\b|not found|unknown session/i.test(msg)) {
      return { active: false, state: 'closed', raw: null };
    }
    return { active: false, state: 'unreachable', raw: null, error: err };
  }
}

async function waitForSessionStop(childSessionKey: any, gatewayUrl: any, gatewayToken: any, timeoutMs: number = 15000, pollMs: number = 2000, statusTimeoutMs: number = 10000, waitOptions: AnyRecord = {}): Promise<AnyRecord> {
  const deadline = Date.now() + Math.max(timeoutMs, 0);
  let lastState: AnyRecord = { active: false, state: 'unknown', raw: null };

  while (Date.now() <= deadline) {
    throwIfCallerAbort(waitOptions.signal, waitOptions.budget);
    const remainingForStatus = Math.max(deadline - Date.now(), 1);
    lastState = await readSessionLifecycleState(childSessionKey, gatewayUrl, gatewayToken, Math.min(statusTimeoutMs, remainingForStatus), waitOptions);
    if (!lastState.active && isStoppedSessionState(lastState.state)) {
      return { confirmed: true, ...lastState };
    }
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) break;
    await sleep(Math.min(pollMs, remainingMs), waitOptions);
  }

  return { confirmed: false, ...lastState };
}

export function getActiveSession() {
  return _activeSession ? { ..._activeSession } : null;
}

export function clearActiveSession(opts: AnyRecord = {}) {
  const preserveFile = opts?.preserveFile === true;
  const filePath = _activeSession?.activeStatePath || null;
  _activeSession = null;
  if (!preserveFile) clearPersistedActiveSession(filePath);
}

function setActiveSession(data: AnyRecord) {
  _activeSession = { ...data };
  persistActiveSession(_activeSession);
}

// Persisted active-session JSON is diagnostic evidence only. Pipeline restart
// recovery must consult lifecycle read models and gateway confirmation instead
// of hydrating this process-local pointer from a file.

// ── Transcript path resolution ───────────────────────────────────────────────

export function resolveSubagentTranscriptPath(childSessionKey: any) {
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
  } catch (_error) {
    return null;
  }
}

export function resolveSpawnTranscriptPath(spawnResult: AnyRecord, runtime: any) {
  const streamLogPath = spawnResult?.streamLogPath || null;
  if (streamLogPath) return streamLogPath;
  if (resolveRuntime({ runtime, model: null }) !== 'subagent') return null;
  return resolveSubagentTranscriptPath(spawnResult?.childSessionKey || null);
}

// ── Gateway helpers ──────────────────────────────────────────────────────────

function normalizeGatewayError(endpoint: string, err: any) {
  const msg = (err as any)?.message || String(err);
  const match = msg.match(/Gateway returned (\d+)/);
  if (match) return new Error(`Gateway ${endpoint} returned ${match[1]}`);
  return err;
}

async function requestGateway(operation: AnyFunction, endpoint: string, operationArg: any, timeoutMs: number = 30000, waitOptions: AnyRecord = {}) {
  try {
    return await operation(operationArg, timeoutMs, waitOptions);
  } catch (err) {
    throw normalizeGatewayError(endpoint, err);
  }
}

function isCallerAbort(error: any, signal: any, budget: any) {
  return signal?.aborted
    || budget?.signal?.aborted
    || isBudgetExhaustedError(error);
}

function abortError(signal: any) {
  const reason = signal?.reason;
  if (reason instanceof Error) return reason;
  const err = new Error(reason ? String(reason) : 'Operation aborted') as Error & { code?: string };
  err.name = 'AbortError';
  err.code = 'ABORT_ERR';
  return err;
}

function throwIfCallerAbort(signal: any, budget: any) {
  if (signal?.aborted) throw abortError(signal);
  if (budget?.signal?.aborted) throw abortError(budget.signal);
  budget?.throwIfExhausted?.('kill_session_budget_exhausted');
}

function resolveAbortSignal(signal: any, budgetSignal: any): AnyRecord {
  if (signal && budgetSignal && signal !== budgetSignal) {
    const controller = new AbortController();
    const abortFrom = (source: any) => {
      if (!controller.signal.aborted) controller.abort(source?.reason);
    };
    const onSignalAbort = () => abortFrom(signal);
    const onBudgetAbort = () => abortFrom(budgetSignal);
    signal.addEventListener('abort', onSignalAbort, { once: true });
    budgetSignal.addEventListener('abort', onBudgetAbort, { once: true });
    return {
      signal: controller.signal,
      cleanup: () => {
        signal.removeEventListener('abort', onSignalAbort);
        budgetSignal.removeEventListener('abort', onBudgetAbort);
      },
    };
  }
  return { signal: signal || budgetSignal || undefined, cleanup: () => {} };
}

// ── ACP cleanup ──────────────────────────────────────────────────────────────

export async function acpxCleanup(agentId: any, gatewayLabel: any, opts: AnyRecord = {}) {
  if (!agentId || !gatewayLabel) return;
  throwIfCallerAbort(opts.signal, opts.budget);
  const execFileAsync = opts.execFileAsync || execFileAsyncDefault;
  const abort = resolveAbortSignal(opts.signal, opts.budget?.signal);
  try {
    await execFileAsync('acpx', [agentId, 'sessions', 'close', '--name', gatewayLabel], {
      stdio: 'ignore',
      timeout: opts.timeoutMs ?? 10000,
      env: buildSubprocessEnv(),
      signal: abort.signal,
    });
    log('DEBUG', `acpx session closed: ${agentId} / ${gatewayLabel}`);
  } catch (error) {
    if (isCallerAbort(error, opts.signal, opts.budget)) throw error;
    log('DEBUG', `acpx session close failed (non-critical): ${agentId} / ${gatewayLabel}`);
  } finally {
    abort.cleanup();
  }
}

// ── Spawn ────────────────────────────────────────────────────────────────────

function requiredNonEmptyString(value: any, fieldName: string) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`spawnSession requires explicit ${fieldName}`);
  }
  return value.trim();
}

function resolveExplicitRuntime(value: any) {
  const runtime = requiredNonEmptyString(value, 'session.runtime');
  const normalized = runtime.toLowerCase();
  if (normalized !== 'acp' && normalized !== 'subagent') {
    throw new Error('spawnSession requires session.runtime to be acp or subagent');
  }
  return normalized;
}

export async function spawnSession(payload: AnyRecord, prompt: any, timeoutSeconds: any, opts: AnyRecord = {}) {
  const session = payload?.session || {};
  const model = requiredNonEmptyString(opts.model ?? session.model, 'session.model');
  const runtime = resolveExplicitRuntime(opts.runtime ?? session.runtime);
  const agentId = requiredNonEmptyString(opts.agentId ?? session.agentId, 'session.agentId');
  const cwd = requiredNonEmptyString(opts.cwd ?? session.cwd, 'session.cwd');
  const label = requiredNonEmptyString(opts.label ?? session.label, 'session.label');
  const gatewayUrl = resolveGatewayBaseUrl(opts.gatewayUrl);
  const gatewayToken = resolveGatewayToken(opts.gatewayToken);
  const activeStatePath = resolveActiveSessionStatePath({
    activeStatePath: opts.activeStatePath ?? session.activeStatePath ?? session.active_session_path ?? null,
    cwd,
  });
  const isSubagent = runtime === 'subagent';
  const thinking = opts.thinking ?? session.thinking ?? null;
  const maxRetries = opts.maxRetries ?? 3;
  const retryDelayMs = opts.retryDelayMs ?? 5000;
  const budget = opts.budget || null;
  const signal = opts.signal || null;
  const shouldTrackActive = opts.trackActive !== false;

  const spawnArgs: AnyRecord = {
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
      const raw = await requestGateway(spawnGatewaySession, 'session spawn', spawnArgs, 30000, { gatewayUrl, gatewayToken, budget, signal });
      const result: AnyRecord = raw?.result?.details || raw;
      if (result.status !== 'accepted') throw new Error(`Spawn not accepted: ${JSON.stringify(result)}`);

      const streamLogPath = resolveSpawnTranscriptPath(result, runtime);
      if (isSubagent && !result?.streamLogPath && streamLogPath) {
        log('DEBUG', `Subagent transcript path (resolved): ${streamLogPath}`);
      }

      const sessionData = assertValidSessionLifecycleRecord({
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
      }, 'spawn session result') as AnyRecord;

      log('OK', `Session spawned: ${label} -> ${result.childSessionKey}${streamLogPath ? ` (stream: ${streamLogPath})` : ''}`);
      if (shouldTrackActive) setActiveSession(sessionData);
      return sessionData;
    } catch (err) {
      lastErr = err;
      if (isCallerAbort(err, signal, budget)) throw err;
      if (attempt < maxRetries) {
        log('WARN', `Spawn attempt ${attempt}/${maxRetries} failed: ${(err as any).message} - retrying in ${retryDelayMs / 1000}s`);
        await sleep(retryDelayMs, { budget, signal });
      }
    }
  }

  throw new Error(`Failed to spawn session '${label}' after ${maxRetries} attempts: ${(lastErr as any)?.message}`);
}

// ── Kill ─────────────────────────────────────────────────────────────────────

function parseGatewayToolText(raw: AnyRecord) {
  const text = raw?.result?.content?.find?.((entry: AnyRecord) => entry?.type === 'text')?.text;
  if (!text || typeof text !== 'string') return null;
  try {
    return JSON.parse(text);
  } catch (_error) {
    return null;
  }
}

function normalizeGatewayDetails(raw: AnyRecord) {
  return raw?.result?.details || raw?.details || parseGatewayToolText(raw) || raw;
}

function subagentListConfirmsInactive(raw: AnyRecord, childSessionKey: any, label: any) {
  const details = normalizeGatewayDetails(raw);
  const active = Array.isArray(details?.active) ? details.active : null;
  if (!active) return false;
  return !active.some((entry: AnyRecord) => (
    entry?.sessionKey === childSessionKey
    || entry?.key === childSessionKey
    || (label && entry?.label === label)
  ));
}

export async function killSession(childSessionKey: any, opts: AnyRecord = {}) {
  if (!childSessionKey) {
    return assertValidKillSessionResult({
      requested: false,
      confirmed: true,
      state: 'no_session_key',
      cleanupAttempted: false,
    });
  }
  const gatewayUrl = resolveGatewayBaseUrl(opts.gatewayUrl);
  const gatewayToken = resolveGatewayToken(opts.gatewayToken);
  const runtime = resolveRuntime({ runtime: opts.runtime, model: opts.model || null });
  const isSubagent = runtime === 'subagent';
  const label = opts.label || '';
  const confirmTimeoutMs = opts.confirmTimeoutMs ?? (isSubagent ? 120000 : 15000);
  const confirmPollMs = opts.confirmPollMs ?? 2000;
  const cleanupConfirmTimeoutMs = opts.cleanupConfirmTimeoutMs ?? confirmTimeoutMs;
  const statusTimeoutMs = opts.statusTimeoutMs ?? 10000;
  const requestTimeoutMs = opts.requestTimeoutMs ?? 30000;
  const stopRequestTimeoutMs = opts.stopRequestTimeoutMs ?? 15000;
  const listTimeoutMs = opts.listTimeoutMs ?? 30000;
  const acpxTimeoutMs = opts.acpxTimeoutMs ?? 10000;
  const budget = opts.budget || null;
  const signal = opts.signal || null;
  const waitOptions = { budget, signal };

  log('STEP', `Killing ${isSubagent ? 'subagent' : 'ACP'} session: ${childSessionKey}${label ? ` (${label})` : ''}`);
  let requested = false;
  let confirmed = false;
  let state = 'unknown';
  let cleanupAttempted = false;

  throwIfCallerAbort(signal, budget);
  let confirmation = await readSessionLifecycleState(childSessionKey, gatewayUrl, gatewayToken, statusTimeoutMs, waitOptions);
  if (!confirmation.active && isStoppedSessionState(confirmation.state)) {
    confirmed = true;
    state = confirmation.state || state;
    log('OK', `Session already stopped: ${childSessionKey} (${state})`);
    return assertValidKillSessionResult({ requested, confirmed, state, cleanupAttempted });
  }

  if (isSubagent) {
    try {
      await requestGateway(killGatewaySubagent, 'subagent kill', childSessionKey, requestTimeoutMs, { gatewayUrl, gatewayToken, ...waitOptions });
      requested = true;
      log('INFO', `Subagent kill requested for session: ${childSessionKey}`);
    } catch (err) {
      if (isCallerAbort(err, signal, budget)) throw err;
      log('WARN', `Could not request subagent kill for session '${childSessionKey}' - ${(err as any).message}`);
    }
  }

  if (!requested) {
    try {
      await requestGateway(
        (sessionKey: any, timeoutMs: number, waitOptions: AnyRecord) => sendGatewaySessionMessage(sessionKey, opts.stopMessage || '/stop', timeoutMs, waitOptions),
        'session message',
        childSessionKey,
        stopRequestTimeoutMs,
        { gatewayUrl, gatewayToken, ...waitOptions },
      );
      requested = true;
      log('INFO', `Stop requested for session: ${childSessionKey}`);
    } catch (err) {
      if (isCallerAbort(err, signal, budget)) throw err;
      log('WARN', `Could not request stop for session '${childSessionKey}' - ${(err as any).message}`);
    }
  }

  confirmation = await waitForSessionStop(childSessionKey, gatewayUrl, gatewayToken, confirmTimeoutMs, confirmPollMs, statusTimeoutMs, waitOptions);
  confirmed = confirmation.confirmed;
  state = confirmation.state || state;

  if (!confirmed && isSubagent && requested) {
    try {
      const listResult = await requestGateway(
        (_unused: any, timeoutMs: number, waitOptions: AnyRecord) => listGatewaySubagents(timeoutMs, waitOptions),
        'subagent list',
        null,
        listTimeoutMs,
        { gatewayUrl, gatewayToken, ...waitOptions },
      );
      if (subagentListConfirmsInactive(listResult, childSessionKey, label)) {
        confirmed = true;
        state = isStoppedSessionState(state) ? state : 'not_active';
        log('OK', `Subagent no longer active after kill request: ${childSessionKey} (${state})`);
      }
    } catch (err) {
      if (isCallerAbort(err, signal, budget)) throw err;
      log('WARN', `Could not confirm subagent inactivity for session '${childSessionKey}' - ${(err as any).message}`);
    }
  }

  if (!confirmed && !isSubagent && opts.agentId) {
    throwIfCallerAbort(signal, budget);
    cleanupAttempted = true;
    log('WARN', `Session '${childSessionKey}' still active after stop request (${state}) - closing ACP harness session`);
    await acpxCleanup(opts.agentId, label, { timeoutMs: acpxTimeoutMs, ...waitOptions });
    confirmation = await waitForSessionStop(childSessionKey, gatewayUrl, gatewayToken, cleanupConfirmTimeoutMs, confirmPollMs, statusTimeoutMs, waitOptions);
    confirmed = confirmation.confirmed;
    state = confirmation.state || state;
  }

  if (confirmed) log('OK', `Session stopped: ${childSessionKey} (${state})`);
  else log('WARN', `Session stop unconfirmed: ${childSessionKey} (${state})`);

  return assertValidKillSessionResult({ requested, confirmed, state, cleanupAttempted });
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
  }) as AnyRecord;
  clearActiveSession({ preserveFile: !result?.confirmed });
  return !!result?.confirmed;
}
