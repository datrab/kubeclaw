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
import { canonicalizeModelId, resolveRuntime } from './runtime.ts';
import { isBudgetExhaustedError, sleep } from '../timing.ts';
import {
  assertValidKillSessionResult,
  assertValidSessionLifecycleRecord,
} from '../services/acp-gateway-contract.ts';
import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
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

function errorMessage(error: any): string {
  if (error && typeof error === 'object' && 'message' in error) {
    const message = error.message;
    if (typeof message === 'string' && message.trim()) return message;
  }
  return String(error);
}

function requireFiniteMs(value: any, fieldName: string, { min = 0 }: AnyRecord = {}) {
  const number = Number(value);
  if (selectTruthyValue(() => (!Number.isFinite(number)), () => (number < min))) {
    throw new Error(`${fieldName} must be explicit and >= ${min}`);
  }
  return Math.round(number);
}

function requirePositiveInteger(value: any, fieldName: string) {
  const number = Number(value);
  if (selectTruthyValue(() => (!Number.isInteger(number)), () => (number < 1))) {
    throw new Error(`${fieldName} must be explicit and >= 1`);
  }
  return number;
}

function requireGatewayPolicy(value: any, fieldName: string) {
  if (selectTruthyValue(() => (selectTruthyValue(() => (!value), () => (typeof value !== 'object'))), () => (Array.isArray(value)))) {
    throw new Error(`${fieldName} must be explicit session gateway policy`);
  }
  return {
    timeoutMs: requireFiniteMs(value.timeoutMs, `${fieldName}.timeoutMs`),
    maxRetries: requirePositiveInteger(value.maxRetries, `${fieldName}.maxRetries`),
    retryDelayMs: requireFiniteMs(value.retryDelayMs, `${fieldName}.retryDelayMs`),
  };
}

function resolveSpawnPolicy(opts: AnyRecord = {}) {
  const policy = opts.spawnPolicy;
  if (selectTruthyValue(() => (selectTruthyValue(() => (!policy), () => (typeof policy !== 'object'))), () => (Array.isArray(policy)))) {
    throw new Error('spawnSession requires explicit opts.spawnPolicy from swarm.config.json');
  }
  const mode = requiredNonEmptyString(policy.mode, 'spawnPolicy.mode');
  const cleanup = requiredNonEmptyString(policy.cleanup, 'spawnPolicy.cleanup');
  const streamTo = requiredNonEmptyString(policy.streamTo, 'spawnPolicy.streamTo');
  if (typeof policy.thread !== 'boolean') {
    throw new Error('spawnPolicy.thread must be explicit boolean');
  }
  return {
    gateway: requireGatewayPolicy(policy.gateway, 'spawnPolicy.gateway'),
    thread: policy.thread,
    mode,
    cleanup,
    streamTo,
  };
}

function resolveKillPolicy(opts: AnyRecord = {}, isSubagent: boolean) {
  const policy = opts.killPolicy;
  if (selectTruthyValue(() => (selectTruthyValue(() => (!policy), () => (typeof policy !== 'object'))), () => (Array.isArray(policy)))) {
    throw new Error('killSession requires explicit opts.killPolicy from swarm.config.json');
  }
  const confirmTimeoutMs = requireFiniteMs(
    isSubagent ? policy.subagentConfirmTimeoutMs : policy.acpConfirmTimeoutMs,
    isSubagent ? 'killPolicy.subagentConfirmTimeoutMs' : 'killPolicy.acpConfirmTimeoutMs',
  );
  return {
    confirmTimeoutMs,
    confirmPollMs: requireFiniteMs(policy.confirmPollMs, 'killPolicy.confirmPollMs', { min: 1 }),
    cleanupConfirmTimeoutMs: policy.cleanupConfirmTimeoutMs,
    statusTimeoutMs: requireFiniteMs(policy.statusTimeoutMs, 'killPolicy.statusTimeoutMs'),
    requestTimeoutMs: requireFiniteMs(policy.requestTimeoutMs, 'killPolicy.requestTimeoutMs'),
    stopRequestTimeoutMs: requireFiniteMs(policy.stopRequestTimeoutMs, 'killPolicy.stopRequestTimeoutMs'),
    listTimeoutMs: requireFiniteMs(policy.listTimeoutMs, 'killPolicy.listTimeoutMs'),
    statusGateway: requireGatewayPolicy(policy.statusGateway, 'killPolicy.statusGateway'),
    requestGateway: requireGatewayPolicy(policy.requestGateway, 'killPolicy.requestGateway'),
    stopGateway: requireGatewayPolicy(policy.stopGateway, 'killPolicy.stopGateway'),
    listGateway: requireGatewayPolicy(policy.listGateway, 'killPolicy.listGateway'),
    acpxTimeoutMs: requireFiniteMs(policy.acpxTimeoutMs, 'killPolicy.acpxTimeoutMs'),
    stopMessage: requiredNonEmptyString(policy.stopMessage, 'killPolicy.stopMessage'),
  };
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
  const filePath = selectTruthyValue(() => (data?.activeStatePath), () => (null));
  if (!filePath) return;
  writeJsonAtomic(filePath, {
    childSessionKey: selectTruthyValue(() => (data.childSessionKey), () => (null)),
    runId: selectTruthyValue(() => (data.runId), () => (null)),
    label: selectTruthyValue(() => (data.label), () => (null)),
    agentId: selectTruthyValue(() => (data.agentId), () => (null)),
    model: selectTruthyValue(() => (data.model), () => (null)),
    streamLogPath: selectTruthyValue(() => (data.streamLogPath), () => (null)),
    runtime: selectTruthyValue(() => (data.runtime), () => (null)),
    gatewayLabel: selectTruthyValue(() => (data.gatewayLabel), () => (null)),
    cwd: selectTruthyValue(() => (data.cwd), () => (null)),
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
      process.stderr.write(`[session-lifecycle] active-session cleanup failed: ${errorMessage(error)}\n`);
    } catch (_stderrError) {
      // Best-effort cleanup must not block session lifecycle progress.
    }
  }
}

async function readSessionLifecycleState(
  childSessionKey: any,
  gatewayUrl: any,
  gatewayToken: any,
  timeoutMs: number,
  waitOptions: AnyRecord = {},
): Promise<AnyRecord> {
  try {
    const raw = await requestGateway(getGatewaySessionStatus, 'session status', childSessionKey, timeoutMs, { gatewayUrl, gatewayToken, ...waitOptions });
    const result: AnyRecord = requireGatewayDetails(raw, 'session status');
    const parsed = parseSessionState(result);
    return { active: parsed.active, state: parsed.state, raw: result };
  } catch (err) {
    if (isCallerAbort(err, waitOptions.signal, waitOptions.budget)) throw err;
    const msg = errorMessage(err);
    if (/\b404\b|not found|unrecognized session/i.test(msg)) {
      return { active: false, state: 'closed', raw: null };
    }
    return { active: false, state: 'unreachable', raw: null, error: err };
  }
}

async function waitForSessionStop(
  childSessionKey: any,
  gatewayUrl: any,
  gatewayToken: any,
  timeoutMs: number,
  pollMs: number,
  statusTimeoutMs: number,
  waitOptions: AnyRecord = {},
): Promise<AnyRecord> {
  const deadline = Date.now() + Math.max(timeoutMs, 0);
  let lastState: AnyRecord = { active: false, state: 'session_status_not_observed', raw: null };

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
  const filePath = selectTruthyValue(() => (_activeSession?.activeStatePath), () => (null));
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
    const entry = selectTruthyValue(() => (sessionsData?.[childSessionKey]), () => (null));
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
  const streamLogPath = selectTruthyValue(() => (spawnResult?.streamLogPath), () => (null));
  if (streamLogPath) return streamLogPath;
  if (resolveRuntime({ runtime, model: null }) !== 'subagent') return null;
  return resolveSubagentTranscriptPath(selectTruthyValue(() => (spawnResult?.childSessionKey), () => (null)));
}

// ── Gateway helpers ──────────────────────────────────────────────────────────

function normalizeGatewayError(endpoint: string, err: any) {
  const msg = errorMessage(err);
  const statusMatch = msg.match(/(?:^|[^\d])([45]\d\d)(?:[^\d]|$)/);
  const match = msg.match(/Gateway returned (\d+)/);
  if (match) {
    const normalized = new Error(`Gateway ${endpoint} returned ${match[1]}`) as Error & { gatewayStatus?: number };
    normalized.gatewayStatus = Number(match[1]);
    return normalized;
  }
  if (statusMatch) {
    const normalized = new Error(msg) as Error & { gatewayStatus?: number };
    normalized.gatewayStatus = Number(statusMatch[1]);
    return normalized;
  }
  return err;
}

function isNonRetryableGatewayContractError(error: any) {
  return selectTruthyValue(() => (Number(error?.gatewayStatus) === 400), () => (/\b400\b.*Bad Request|Bad Request.*\b400\b/i.test(String(selectDefinedValue(() => (selectDefinedValue(() => (error?.message), () => (error))), () => (''))))));
}

async function requestGateway(operation: AnyFunction, endpoint: string, operationArg: any, timeoutMs: number, waitOptions: AnyRecord = {}) {
  requireFiniteMs(timeoutMs, `gateway ${endpoint} timeoutMs`);
  try {
    return await operation(operationArg, timeoutMs, waitOptions);
  } catch (err) {
    throw normalizeGatewayError(endpoint, err);
  }
}

function isCallerAbort(error: any, signal: any, budget: any) {
  return [
    signal?.aborted,
    budget?.signal?.aborted,
    isBudgetExhaustedError(error),
  ].some(Boolean);
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
  return { signal: selectTruthyValue(() => (selectTruthyValue(() => (signal), () => (budgetSignal))), () => (undefined)), cleanup: () => {} };
}

// ── ACP cleanup ──────────────────────────────────────────────────────────────

export async function acpxCleanup(agentId: any, gatewayLabel: any, opts: AnyRecord = {}) {
  if (selectTruthyValue(() => (!agentId), () => (!gatewayLabel))) return;
  throwIfCallerAbort(opts.signal, opts.budget);
  const abort = resolveAbortSignal(opts.signal, opts.budget?.signal);
  try {
    await execFileAsyncDefault('acpx', [agentId, 'sessions', 'close', '--name', gatewayLabel], {
      stdio: 'ignore',
      timeout: requireFiniteMs(opts.timeoutMs, 'acpxCleanup.timeoutMs'),
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
  if (selectTruthyValue(() => (typeof value !== 'string'), () => (value.trim() === ''))) {
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

function resolveCleanupConfirmTimeoutMs(value: any, confirmTimeoutMs: number) {
  if (value === 'match_confirm_timeout') return confirmTimeoutMs;
  return value;
}

export async function spawnSession(payload: AnyRecord, prompt: any, timeoutSeconds: any, opts: AnyRecord = {}) {
  const session = selectDefinedValue(() => (payload?.session), () => ({}));
  const model = requiredNonEmptyString(canonicalizeModelId(session.model), 'session.model');
  const runtime = resolveExplicitRuntime(session.runtime);
  const agentId = requiredNonEmptyString(session.agentId, 'session.agentId');
  const cwd = requiredNonEmptyString(session.cwd, 'session.cwd');
  const label = requiredNonEmptyString(session.label, 'session.label');
  const gatewayUrl = resolveGatewayBaseUrl(opts.gatewayUrl);
  const gatewayToken = resolveGatewayToken(opts.gatewayToken);
  const activeStatePath = resolveActiveSessionStatePath({
    activeStatePath: selectDefinedValue(() => (opts.activeStatePath), () => (null)),
    cwd,
  });
  const isSubagent = runtime === 'subagent';
  const thinking = selectDefinedValue(() => (session.thinking), () => (null));
  const spawnPolicy = resolveSpawnPolicy(opts);
  const maxRetries = spawnPolicy.gateway.maxRetries;
  const retryDelayMs = spawnPolicy.gateway.retryDelayMs;
  const requestTimeoutMs = spawnPolicy.gateway.timeoutMs;
  const budget = selectTruthyValue(() => (opts.budget), () => (null));
  const signal = selectTruthyValue(() => (opts.signal), () => (null));
  const shouldTrackActive = opts.trackActive !== false;
  const observabilityIdentity = opts.observabilityIdentity && typeof opts.observabilityIdentity === 'object'
    ? opts.observabilityIdentity
    : null;

  const spawnArgs: AnyRecord = {
    task: requiredNonEmptyString(prompt, 'prompt'),
    runtime,
    label,
    model,
    cwd,
    thread: spawnPolicy.thread,
    mode: spawnPolicy.mode,
    cleanup: spawnPolicy.cleanup,
  };
  if (observabilityIdentity) {
    spawnArgs.runId = selectDefinedValue(() => (selectDefinedValue(() => (observabilityIdentity.run_id), () => (observabilityIdentity.runId))), () => (null));
    spawnArgs.project = selectDefinedValue(() => (observabilityIdentity.project), () => (null));
    spawnArgs.dispatchId = selectDefinedValue(() => (selectDefinedValue(() => (observabilityIdentity.dispatch_id), () => (observabilityIdentity.dispatchId))), () => (null));
    spawnArgs.gatewayLabel = requiredNonEmptyString(observabilityIdentity.gateway_label, 'observabilityIdentity.gateway_label');
    spawnArgs.agentType = selectDefinedValue(() => (observabilityIdentity.agent_type), () => (null));
    spawnArgs.moduleId = selectDefinedValue(() => (observabilityIdentity.module_id), () => (null));
    spawnArgs.gateId = selectDefinedValue(() => (observabilityIdentity.gate_id), () => (null));
    spawnArgs.metadata = {
      run_id: spawnArgs.runId,
      project: spawnArgs.project,
      dispatch_id: spawnArgs.dispatchId,
      gateway_label: spawnArgs.gatewayLabel,
      agent_type: spawnArgs.agentType,
      module_id: spawnArgs.moduleId,
      gate_id: spawnArgs.gateId,
      gate_type: selectDefinedValue(() => (observabilityIdentity.gate_type), () => (null)),
      attempt: selectDefinedValue(() => (observabilityIdentity.attempt), () => (null)),
    };
  }
  if (!isSubagent) {
    spawnArgs.agentId = agentId;
    spawnArgs.streamTo = spawnPolicy.streamTo;
    if (thinking) spawnArgs.thinking = thinking;
  }

  log('STEP', `Spawning ${isSubagent ? 'subagent' : 'ACP'} session: ${label} (model: ${model}, agentId: ${agentId}${thinking && !isSubagent ? `, thinking: ${thinking}` : ''})`);

  let lastErr;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const raw = await requestGateway(spawnGatewaySession, 'session spawn', spawnArgs, requestTimeoutMs, {
        gatewayUrl,
        gatewayToken,
        maxRetries,
        retryDelayMs,
        budget,
        signal,
      });
      const result: AnyRecord = requireGatewayDetails(raw, 'session spawn');
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
      if (isNonRetryableGatewayContractError(err)) {
        const contractErr = new Error(`Gateway session spawn contract invalid for '${label}': ${(err as any).message}`) as Error & { code?: string; gatewayStatus?: number };
        contractErr.code = 'gateway_spawn_contract_invalid';
        contractErr.gatewayStatus = 400;
        throw contractErr;
      }
      if (attempt < maxRetries) {
        log('WARN', `Spawn attempt ${attempt}/${maxRetries} failed: ${errorMessage(err)} - retrying in ${retryDelayMs / 1000}s`);
        await sleep(retryDelayMs, { budget, signal });
      }
    }
  }

  throw new Error(`Failed to spawn session '${label}' after ${maxRetries} attempts: ${errorMessage(lastErr)}`);
}

// ── Kill ─────────────────────────────────────────────────────────────────────

function parseGatewayToolText(raw: AnyRecord) {
  const text = raw?.result?.content?.find?.((entry: AnyRecord) => entry?.type === 'text')?.text;
  if (selectTruthyValue(() => (!text), () => (typeof text !== 'string'))) return null;
  try {
    return JSON.parse(text);
  } catch (_error) {
    return null;
  }
}

function requireGatewayDetails(raw: AnyRecord, endpoint: string) {
  if (raw?.result?.details && typeof raw.result.details === 'object') return raw.result.details;
  if (raw?.details && typeof raw.details === 'object') return raw.details;
  const parsed = parseGatewayToolText(raw);
  if (parsed && typeof parsed === 'object') return parsed;
  throw new Error(`Gateway ${endpoint} response missing typed details`);
}

function normalizeGatewayDetails(raw: AnyRecord) {
  return requireGatewayDetails(raw, 'details');
}

function subagentListConfirmsInactive(raw: AnyRecord, childSessionKey: any, label: any) {
  const details = normalizeGatewayDetails(raw);
  const active = Array.isArray(details?.active) ? details.active : null;
  if (!active) return false;
  return !active.some((entry: AnyRecord) => (
    selectTruthyValue(() => (selectTruthyValue(() => (entry?.sessionKey === childSessionKey), () => (entry?.key === childSessionKey))), () => ((label && entry?.label === label)))
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
  const runtime = resolveRuntime({ runtime: opts.runtime, model: selectTruthyValue(() => (opts.model), () => (null)) });
  const isSubagent = runtime === 'subagent';
  const label = selectDefinedValue(() => (opts.label), () => (''));
  const killPolicy = resolveKillPolicy(opts, isSubagent);
  const confirmTimeoutMs = killPolicy.confirmTimeoutMs;
  const confirmPollMs = killPolicy.confirmPollMs;
  const cleanupConfirmTimeoutMs = resolveCleanupConfirmTimeoutMs(
    killPolicy.cleanupConfirmTimeoutMs,
    confirmTimeoutMs,
  );
  const statusTimeoutMs = killPolicy.statusTimeoutMs;
  const requestTimeoutMs = killPolicy.requestTimeoutMs;
  const stopRequestTimeoutMs = killPolicy.stopRequestTimeoutMs;
  const listTimeoutMs = killPolicy.listTimeoutMs;
  const acpxTimeoutMs = killPolicy.acpxTimeoutMs;
  const budget = selectTruthyValue(() => (opts.budget), () => (null));
  const signal = selectTruthyValue(() => (opts.signal), () => (null));
  const waitOptions = { budget, signal };

  log('STEP', `Killing ${isSubagent ? 'subagent' : 'ACP'} session: ${childSessionKey}${label ? ` (${label})` : ''}`);
  let requested = false;
  let confirmed = false;
  let state = 'session_stop_status_not_observed';
  let cleanupAttempted = false;

  throwIfCallerAbort(signal, budget);
  let confirmation = await readSessionLifecycleState(childSessionKey, gatewayUrl, gatewayToken, statusTimeoutMs, {
    ...waitOptions,
    maxRetries: killPolicy.statusGateway.maxRetries,
    retryDelayMs: killPolicy.statusGateway.retryDelayMs,
  });
  if (!confirmation.active && isStoppedSessionState(confirmation.state)) {
    confirmed = true;
    if (confirmation.state) state = confirmation.state;
    log('OK', `Session already stopped: ${childSessionKey} (${state})`);
    return assertValidKillSessionResult({ requested, confirmed, state, cleanupAttempted });
  }

  if (isSubagent) {
    try {
      await requestGateway(killGatewaySubagent, 'subagent kill', childSessionKey, requestTimeoutMs, {
        gatewayUrl,
        gatewayToken,
        maxRetries: killPolicy.requestGateway.maxRetries,
        retryDelayMs: killPolicy.requestGateway.retryDelayMs,
        ...waitOptions,
      });
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
        (sessionKey: any, timeoutMs: number, waitOptions: AnyRecord) => sendGatewaySessionMessage(sessionKey, killPolicy.stopMessage, timeoutMs, waitOptions),
        'session message',
        childSessionKey,
        stopRequestTimeoutMs,
        {
          gatewayUrl,
          gatewayToken,
          maxRetries: killPolicy.stopGateway.maxRetries,
          retryDelayMs: killPolicy.stopGateway.retryDelayMs,
          ...waitOptions,
        },
      );
      requested = true;
      log('INFO', `Stop requested for session: ${childSessionKey}`);
    } catch (err) {
      if (isCallerAbort(err, signal, budget)) throw err;
      log('WARN', `Could not request stop for session '${childSessionKey}' - ${(err as any).message}`);
    }
  }

  confirmation = await waitForSessionStop(childSessionKey, gatewayUrl, gatewayToken, confirmTimeoutMs, confirmPollMs, statusTimeoutMs, {
    ...waitOptions,
    maxRetries: killPolicy.statusGateway.maxRetries,
    retryDelayMs: killPolicy.statusGateway.retryDelayMs,
  });
  confirmed = confirmation.confirmed;
  if (confirmation.state) state = confirmation.state;

  if (!confirmed && isSubagent && requested) {
    try {
      const listResult = await requestGateway(
        (_unused: any, timeoutMs: number, waitOptions: AnyRecord) => listGatewaySubagents(timeoutMs, waitOptions),
        'subagent list',
        null,
        listTimeoutMs,
        {
          gatewayUrl,
          gatewayToken,
          maxRetries: killPolicy.listGateway.maxRetries,
          retryDelayMs: killPolicy.listGateway.retryDelayMs,
          ...waitOptions,
        },
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
    confirmation = await waitForSessionStop(childSessionKey, gatewayUrl, gatewayToken, cleanupConfirmTimeoutMs, confirmPollMs, statusTimeoutMs, {
      ...waitOptions,
      maxRetries: killPolicy.statusGateway.maxRetries,
      retryDelayMs: killPolicy.statusGateway.retryDelayMs,
    });
    confirmed = confirmation.confirmed;
    if (confirmation.state) state = confirmation.state;
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
    killPolicy: session.killPolicy,
    runtime: session.runtime,
    model: session.model,
    agentId: session.agentId,
    label: session.gatewayLabel,
  }) as AnyRecord;
  clearActiveSession({ preserveFile: !result?.confirmed });
  return !!result?.confirmed;
}
