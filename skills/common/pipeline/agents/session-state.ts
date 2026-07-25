import fs from 'fs';
import os from 'os';
import path from 'path';
import { assertValidSessionLifecycleRecord } from '../services/acp-gateway-contract.ts';
import { resolveRuntime } from './runtime.ts';

type AnyRecord = Record<string, any>;

const activeSessionState: { current: AnyRecord | null } = { current: null };

function errorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as AnyRecord).message;
    if (typeof message === 'string' && message.trim()) return message;
  }
  return String(error);
}

export function resolveActiveSessionStatePath(opts: AnyRecord = {}): string | null {
  return opts.activeStatePath ? path.resolve(opts.activeStatePath) : null;
}

function writeJsonAtomic(filePath: string, data: AnyRecord): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(data, null, 2)}\n`);
  fs.renameSync(temporaryPath, filePath);
}

function persistActiveSession(data: AnyRecord): void {
  assertValidSessionLifecycleRecord(data, 'active session record');
  const filePath = data.activeStatePath || null;
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

function clearPersistedActiveSession(filePath: string | null): void {
  if (!filePath) return;
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch (error) {
    try {
      process.stderr.write(`[session-lifecycle] active-session cleanup failed: ${errorMessage(error)}\n`);
    } catch (_stderrError) { /* INTENTIONAL_NONCRITICAL(best_effort_cleanup_failed): cleanup is idempotent or a primary failure remains authoritative. */ }
  }
}

export function getActiveSession(): AnyRecord | null {
  return activeSessionState.current ? { ...activeSessionState.current } : null;
}

export function clearActiveSession(opts: AnyRecord = {}): void {
  const filePath = activeSessionState.current?.activeStatePath || null;
  activeSessionState.current = null;
  if (opts.preserveFile !== true) clearPersistedActiveSession(filePath);
}

export function setActiveSession(data: AnyRecord): void {
  activeSessionState.current = { ...data };
  persistActiveSession(activeSessionState.current);
}

export function resolveSubagentTranscriptPath(childSessionKey: unknown): string | null {
  if (!childSessionKey) return null;
  try {
    const parentAgentId = String(childSessionKey).split(':')[1];
    if (!parentAgentId) return null;
    const sessionsDirectory = path.join(os.homedir(), '.openclaw', 'agents', parentAgentId, 'sessions');
    const sessionsData = JSON.parse(fs.readFileSync(path.join(sessionsDirectory, 'sessions.json'), 'utf8'));
    const entry = sessionsData?.[String(childSessionKey)];
    if (entry?.sessionFile) {
      return path.isAbsolute(entry.sessionFile)
        ? entry.sessionFile
        : path.resolve(sessionsDirectory, entry.sessionFile);
    }
    return entry?.sessionId ? path.join(sessionsDirectory, `${entry.sessionId}.jsonl`) : null;
  } catch (_error) { /* INTENTIONAL_NONCRITICAL(optional_probe_failed): unreadable transcript metadata is explicit absence. */
    return null;
  }
}

export function resolveSpawnTranscriptPath(spawnResult: AnyRecord, runtime: unknown): string | null {
  if (spawnResult.streamLogPath) return spawnResult.streamLogPath;
  if (resolveRuntime({ runtime, model: null }) !== 'subagent') return null;
  return resolveSubagentTranscriptPath(spawnResult.childSessionKey);
}
