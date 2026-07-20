// @ts-expect-error Node built-in ambient types are not installed for this migration island.
import fs from 'fs';
// @ts-expect-error Node built-in ambient types are not installed for this migration island.
import { execFileSync } from 'child_process';
import { appendPipelineLifecycleEvent, loadStatus, saveStatus } from '../services/status-store.ts';
import { log } from '../core/logger.ts';
import { resolveGatewayInvokeUrl, resolveGatewayToken } from '../integrations/gateway.ts';
import { closeTelemetryRedis } from '../services/telemetry.ts';
import { transitionModuleStatus } from '../lifecycle-state.ts';
import { getTrackedAgent, listTrackedAgents, trackAgent, untrackAgent } from './lifecycle.ts';
import { terminateSession } from './session-termination.ts';
import { buildSubprocessEnv } from '../security.ts';
import { sessionLifecyclePolicies } from '../core/session-policy.ts';
import { finalizeEvidencePlane } from '../services/evidence-plane.ts';

import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
declare const process: any;
type AnyRecord = Record<string, any>;
type PsRow = { pid: number, ppid: number, command: string };

const STATUS = { PASS: 'PASS', BLOCKED: 'BLOCKED', FAIL: 'FAIL' };
const PROCESS_FAILURE_CODE = 1;
const DEFAULT_CANCEL_SIGNAL = 'signal';
const _shutdownState: AnyRecord = { config: null, statusDir: null, currentLabel: null, shuttingDown: false };

function objectRecord(value: unknown): AnyRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as AnyRecord : {};
}

function textValue(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.trim();
}

function errorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as AnyRecord).message;
    if (typeof message === 'string' && message.trim()) return message;
  }
  return String(error);
}

function firstDefined(...values: unknown[]) {
  for (const value of values) {
    if (value !== undefined && value !== null) return value;
  }
  return null;
}

function signalName(signal: unknown): string {
  return selectTruthyValue(() => (textValue(signal)), () => (DEFAULT_CANCEL_SIGNAL));
}

function parsePsTable(): PsRow[] | null {
  try {
    const out = execFileSync('ps', ['-eo', 'pid=,ppid=,command='], {
      encoding: 'utf8',
      timeout: 10000,
      stdio: ['ignore', 'pipe', 'ignore'],
      env: buildSubprocessEnv(),
    });
    return out.split('\n').map(line => line.trim()).filter(Boolean).map(line => {
      const match = line.match(/^(\d+)\s+(\d+)\s+(.*)$/);
      return match ? { pid: Number(match[1]), ppid: Number(match[2]), command: match[3] } : null;
    }).filter(Boolean) as PsRow[];
  } catch (_error) { return null; }
}
function collectDescendants(rootPid: number, byParent: Map<number, PsRow[]>, acc: Set<number> = new Set()) {
  const children = selectDefinedValue(() => (byParent.get(rootPid)), () => ([]));
  for (const child of children) {
    if (acc.has(child.pid)) continue;
    acc.add(child.pid);
    collectDescendants(child.pid, byParent, acc);
  }
  return acc;
}
function signalPid(pid: number, signal: string) { try { process.kill(pid, signal); return true; } catch (_error) { return false; } }
function pidAlive(pid: number) { try { process.kill(pid, 0); return true; } catch (_error) { return false; } }
function isWrapperCommand(command: string | null) {
  return /\bclaude-agent-acp\b|\bnpm\s+exec\b.*\bacp\b|\bacpx\b/i.test(textValue(command));
}
function readProcEnv(pid: number): AnyRecord | null {
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
  } catch (_error) {
    return null;
  }
}
function isTrackedAcpEnv(env: AnyRecord | null, project: string | null) {
  if (selectTruthyValue(() => (!env), () => (env.OPENCLAW_SHELL !== 'acp'))) return false;
  if (project && env.CURRENT_PROJECT && env.CURRENT_PROJECT !== project) return false;
  return true;
}
function getTrackedEntryBySessionKey(sessionKey: string) {
  for (const [, entry] of listTrackedAgents()) {
    if (entry?.sessionKey === sessionKey) return entry;
  }
  return null;
}
function isSessionLinked(command: string | null, agentId: string | null, sessionKey: string, gatewayLabel: string | null = null) {
  const hay = textValue(command);
  return selectTruthyValue(() => (selectTruthyValue(() => ((!!gatewayLabel && hay.includes(gatewayLabel))), () => ((!!sessionKey && hay.includes(sessionKey))))), () => ((!!agentId && hay.includes(agentId))));
}
function isSessionIdentityLinked(command: string | null, sessionKey: string, gatewayLabel: string | null = null) {
  const hay = textValue(command);
  return selectTruthyValue(() => ((!!gatewayLabel && hay.includes(gatewayLabel))), () => ((!!sessionKey && hay.includes(sessionKey))));
}
function isSessionEnvLinked(env: AnyRecord | null, sessionKey: string, gatewayLabel: string | null = null) {
  if (!env) return false;
  return selectTruthyValue(() => ((!!sessionKey && [env.SESSION_KEY, env.OPENCLAW_SESSION_KEY, env.ACP_SESSION_KEY, env.CHILD_SESSION_KEY].includes(sessionKey))), () => ((!!gatewayLabel && [env.GATEWAY_LABEL, env.OPENCLAW_GATEWAY_LABEL, env.ACP_GATEWAY_LABEL].includes(gatewayLabel))));
}
export function buildVictimSet(agentId: string | null, sessionKey: string, gatewayLabel: string | null = null, opts: AnyRecord = {}) {
  const table = opts.parsePsTable ? opts.parsePsTable() : parsePsTable();
  if (!table) return [];
  const readEnv = opts.readProcEnv ? opts.readProcEnv : readProcEnv;

  const tracked = getTrackedEntryBySessionKey(sessionKey);
  const resolvedGatewayLabel = selectTruthyValue(() => (selectTruthyValue(() => (gatewayLabel), () => (tracked?.gatewayLabel))), () => (null));
  const project = selectTruthyValue(() => (selectTruthyValue(() => (tracked?.project), () => (_shutdownState.config?.project))), () => (null));
  const byParent = new Map<number, PsRow[]>();
  const byPid = new Map<number, PsRow>();
  for (const row of table) {
    byPid.set(row.pid, row);
    if (!byParent.has(row.ppid)) byParent.set(row.ppid, []);
    byParent.get(row.ppid).push(row);
  }

  const roots = table.filter(row => {
    if (row.pid === process.pid) return false;
    const isWrapper = isWrapperCommand(row.command);
    const env = isWrapper ? readEnv(row.pid) : null;
    if (selectTruthyValue(() => (isSessionIdentityLinked(row.command, sessionKey, resolvedGatewayLabel)), () => (isSessionEnvLinked(env, sessionKey, resolvedGatewayLabel)))) {
      if (isWrapper) return true;
      return isTrackedAcpEnv(readEnv(row.pid), project);
    }
    if (isSessionLinked(row.command, agentId, sessionKey, resolvedGatewayLabel)) {
      if (isWrapper) return false;
      return isTrackedAcpEnv(readEnv(row.pid), project);
    }
    if (!isWrapper) return false;
    return false;
  });

  const orphanRoots = table.filter(row => {
    if (row.pid === process.pid) return false;
    if (row.ppid !== 1) return false;
    if (!isWrapperCommand(row.command)) return false;
    const env = readEnv(row.pid);
    if (!isSessionIdentityLinked(row.command, sessionKey, resolvedGatewayLabel) && !isSessionEnvLinked(env, sessionKey, resolvedGatewayLabel)) return false;
    return isTrackedAcpEnv(env, project);
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

export async function reaperAfterKill(agentId: string | null, sessionKey: string, gatewayLabel: string | null = null) {
  try {
    await new Promise(resolve => setTimeout(resolve, 2000));
    const victims = buildVictimSet(agentId, sessionKey, gatewayLabel);
    for (const row of victims) if (signalPid(row.pid, 'SIGTERM')) log('DEBUG', `Reaped PID ${row.pid} (${row.command})`);
    await new Promise(resolve => setTimeout(resolve, 1000));
    for (const row of victims) if (pidAlive(row.pid) && signalPid(row.pid, 'SIGKILL')) log('DEBUG', `Reaped PID ${row.pid} (${row.command})`);
  } catch (e: any) { log('DEBUG', `ACP reaper skipped (non-fatal): ${e.message}`); }
}

async function stopTrackedSession(config: AnyRecord, label: string, entry: AnyRecord, gatewayUrl: string | null, gatewayToken: string | null) {
  const sessionKey = entry?.sessionKey;
  const result = await terminateSession(sessionKey, {
    ...sessionLifecyclePolicies(config),
    runtime: selectTruthyValue(() => (entry?.runtime), () => (null)),
    model: selectTruthyValue(() => (entry?.model), () => (null)),
    agentId: selectTruthyValue(() => (entry?.agentId), () => (null)),
    label: firstDefined(entry?.gatewayLabel, label),
    gatewayUrl,
    gatewayToken,
    cleanup: async () => reaperAfterKill(selectTruthyValue(() => (entry?.agentId), () => (null)), sessionKey, selectTruthyValue(() => (selectTruthyValue(() => (entry?.gatewayLabel), () => (label))), () => (null))),
  });
  return result;
}

async function performSignalShutdown(signal: string, stateConfig: AnyRecord | null, statusDir: string | null) {
  const gatewayUrl = resolveGatewayInvokeUrl();
  const gatewayToken = resolveGatewayToken();
  const trackedAgents = listTrackedAgents();

  if (trackedAgents.length > 0) {
    for (const [label, entry] of trackedAgents) {
      const sessionKey = firstDefined(entry?.sessionKey, entry);
      if (!sessionKey) continue;
      try {
        const result = await stopTrackedSession(objectRecord(stateConfig), label, entry, gatewayUrl, gatewayToken);
        log('INFO', `Shutdown: stop ${result.confirmed ? 'confirmed' : 'unconfirmed'} for session '${label}' (${sessionKey}, ${result.state})`);
      } catch (e: any) {
        log('WARN', `Shutdown: failed to stop session '${label}' (${sessionKey}): ${e.message}`);
      }
    }
  }

  if (stateConfig && statusDir) {
    try {
      const status = loadStatus(stateConfig, statusDir);
      if (status && ![STATUS.PASS, STATUS.BLOCKED].includes(status.status)) {
        const interruptedTransition = transitionModuleStatus(status, STATUS.FAIL, {
          note: `Interrupted by ${signal}`,
        });
        saveStatus(stateConfig, statusDir, status, interruptedTransition);
      }
    } catch (e: any) {
      log('WARN', `Shutdown: failed to persist interrupted module status: ${errorMessage(e)}`);
    }
  }

  if (stateConfig) {
    try {
      appendPipelineLifecycleEvent(stateConfig, 'pipeline_run.halted', {
        result: {
          terminal_status: 'cancelled',
          terminal_decision: {
            reasonCode: `PIPELINE_CANCELLED_BY_${signalName(signal).toUpperCase()}`,
          },
          reason: `PIPELINE_CANCELLED_BY_${signalName(signal).toUpperCase()}`,
        },
        stepType: 'pipeline',
        stepId: 'user_cancellation',
        haltReason: `pipeline_cancelled_by_${signalName(signal).toLowerCase()}`,
      });
    } catch (e: any) {
      log('WARN', `Shutdown: failed to persist pipeline cancellation lifecycle event: ${errorMessage(e)}`);
    }
    try {
      finalizeEvidencePlane(stateConfig, { outcome:'cancelled', reason_code:`PIPELINE_CANCELLED_BY_${signalName(signal).toUpperCase()}`, duration_ms:null, progress:stateConfig._progress??null });
    } catch (e:any) {
      log('WARN', `Shutdown: failed to persist terminal closure: ${errorMessage(e)}`);
    }
  }

  try {
    await closeTelemetryRedis();
  } catch (e: any) {
    log('DEBUG', `Shutdown: telemetry Redis close failed (non-critical): ${errorMessage(e)}`);
  }
}

export function registerShutdownHooks(config: AnyRecord) {
  const handler = (signal: string) => {
    if (_shutdownState.shuttingDown) {
      log('WARN', `Received ${signal} during in-flight shutdown — ignoring duplicate signal`);
      return;
    }
    _shutdownState.shuttingDown = true;
    log('WARN', `Received ${signal} — initiating graceful shutdown`);
    const stateConfig = firstDefined(config, _shutdownState.config);
    const { statusDir } = _shutdownState;
      void performSignalShutdown(signal, stateConfig, statusDir)
      .catch((err: any) => {
        log('WARN', `Shutdown cleanup failed (non-fatal): ${errorMessage(err)}`);
      })
      .finally(() => {
        process.exit(PROCESS_FAILURE_CODE);
      });
  };
  process.on('SIGTERM', handler);
  process.on('SIGINT', handler);
}
export function setShutdownContext(config: AnyRecord, agentType: string, moduleId: string, statusDir: string | null) {
  _shutdownState.config = config;
  _shutdownState.statusDir = statusDir;
  const agentConf = config.agents?.[agentType];
  if (selectTruthyValue(() => (!agentConf), () => (agentConf.dispatch !== 'redis'))) {
    const label = `${agentType}-${moduleId}`;
    if (!getTrackedAgent(label)) trackAgent(config, label, null, null, null, null);
    _shutdownState.currentLabel = label;
  } else {
    _shutdownState.currentLabel = null;
  }
}
export function clearShutdownContext() {
  if (_shutdownState.currentLabel) {
    const currentEntry = getTrackedAgent(_shutdownState.currentLabel);
    if (currentEntry && !currentEntry.sessionKey) {
      untrackAgent(_shutdownState.currentLabel);
    }
    _shutdownState.currentLabel = null;
  }
  _shutdownState.statusDir = null;
}
