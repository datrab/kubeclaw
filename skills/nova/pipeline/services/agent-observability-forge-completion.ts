// services/agent-observability-forge-completion.ts — Phase 5 Forge completion authority.
//
// Forge readiness is decided from canonical agent.ended telemetry plus meaningful
// git evidence. Agent-side forge-completion.json remains readable for migration
// diagnostics, but it is not completion authority here.

import path from 'path';
import { STATUS } from '../core/constants.ts';
import { getRunId } from '../core/runtime.ts';
import { gitExec, headHash, invalidateHeadHash } from '../integrations/git-worktree.ts';
import { createRedisClient, loadRedisCtor } from '../telemetry.ts';
import { getTelemetryStreamKeyForRun } from './telemetry-stream.ts';

export const AGENT_OBSERVABILITY_FORGE_COMPLETION_SOURCE = 'agent_observability_agent_ended';
export const AGENT_OBSERVABILITY_FORGE_READY_REASON = 'agent_ended_meaningful_diff';
export const AGENT_OBSERVABILITY_FORGE_NO_WORK_REASON = 'agent_ended_no_meaningful_diff';
export const AGENT_OBSERVABILITY_FORGE_FALLBACK_READY_REASON = 'session_ended_meaningful_diff';
export const AGENT_OBSERVABILITY_FORGE_FALLBACK_NO_WORK_REASON = 'session_ended_no_meaningful_diff';

const DEFAULT_SETTLE_MS = 15000;
const DEFAULT_XREAD_BLOCK_MS = 1;
const RUNTIME_PATH_PREFIXES = [
  '.swarm/',
  'logs/',
];

function stringValue(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function normalizeRelPath(value = '') {
  return String(value || '')
    .replace(/\\/g, '/')
    .replace(/^"|"$/g, '')
    .replace(/^(?:\.\/)+/, '')
    .replace(/^\/+/, '');
}

function porcelainPath(line = '') {
  const raw = String(line).slice(3).trim();
  return normalizeRelPath(raw.includes(' -> ') ? raw.split(' -> ').pop() : raw);
}

function isInsidePath(child, parent) {
  if (!child || !parent) return false;
  const relative = path.relative(path.resolve(parent), path.resolve(child));
  return relative === '' || (!!relative && !relative.startsWith('..') && !path.isAbsolute(relative));
}

function moduleRelativePath(config, moduleDir, fileName) {
  const modulesDir = config?.paths?.modules_dir;
  if (!modulesDir || !config?.repo_root || !moduleDir) return null;
  const abs = path.resolve(modulesDir, moduleDir, fileName);
  return normalizeRelPath(path.relative(config.repo_root, abs));
}

function buildIgnoredPathSet(config, moduleDir, extraIgnoredPaths = []) {
  return new Set([
    moduleRelativePath(config, moduleDir, 'forge-completion.json'),
    ...extraIgnoredPaths,
  ].filter(Boolean).map(normalizeRelPath));
}

export function isForgeCompletionControlPath(relPath, config = {}, moduleDir = null, extraIgnoredPaths = []) {
  const normalized = normalizeRelPath(relPath);
  if (!normalized) return true;
  if (RUNTIME_PATH_PREFIXES.some((prefix) => normalized === prefix.slice(0, -1) || normalized.startsWith(prefix))) return true;
  if (normalized.includes('/.swarm/') || normalized.startsWith('.swarm/')) return true;
  const ignored = buildIgnoredPathSet(config, moduleDir, extraIgnoredPaths);
  return ignored.has(normalized);
}

function gitPathList(config, args) {
  const output = gitExec(config.repo_root, args);
  return output.split('\n').map(normalizeRelPath).filter(Boolean);
}

function statusPaths(config) {
  const output = gitExec(config.repo_root, ['status', '--porcelain', '--untracked-files=all']);
  return output.split('\n').filter(Boolean).map(porcelainPath).filter(Boolean);
}

function summarizePaths(paths = []) {
  if (paths.length === 0) return 'Forge agent ended without meaningful file changes';
  const preview = paths.slice(0, 5).join(', ');
  const suffix = paths.length > 5 ? ` (+${paths.length - 5} more)` : '';
  return `Forge agent ended with meaningful changes: ${preview}${suffix}`;
}

export function collectMeaningfulForgeDiffEvidence(config, moduleDir, opts = {}) {
  if (opts.diffEvidence) {
    const paths = [...new Set((opts.diffEvidence.paths || []).map(normalizeRelPath).filter(Boolean))];
    const ignoredPaths = [...new Set((opts.diffEvidence.ignored_paths || opts.diffEvidence.ignoredPaths || []).map(normalizeRelPath).filter(Boolean))];
    return {
      ok: opts.diffEvidence.ok !== false,
      hasMeaningfulChanges: Boolean(opts.diffEvidence.hasMeaningfulChanges ?? opts.diffEvidence.has_meaningful_changes ?? paths.length > 0),
      paths,
      ignoredPaths,
      headBefore: opts.diffEvidence.headBefore ?? opts.diffEvidence.head_before ?? opts.headBefore ?? null,
      headNow: opts.diffEvidence.headNow ?? opts.diffEvidence.head_now ?? null,
      source: opts.diffEvidence.source || 'injected',
      error: opts.diffEvidence.error || null,
    };
  }

  if (!config?.repo_root) {
    return {
      ok: false,
      hasMeaningfulChanges: false,
      paths: [],
      ignoredPaths: [],
      headBefore: opts.headBefore || null,
      headNow: null,
      source: 'repo_root_required',
      error: {
        code: 'FORGE_COMPLETION_REPO_ROOT_REQUIRED',
        message: 'Forge completion polling requires typed repo_root diff context',
      },
    };
  }

  const extraIgnoredPaths = opts.ignoredPaths || [];
  const meaningful = new Set();
  const ignored = new Set();
  const addPath = (relPath) => {
    const normalized = normalizeRelPath(relPath);
    if (!normalized) return;
    if (isForgeCompletionControlPath(normalized, config, moduleDir, extraIgnoredPaths)) ignored.add(normalized);
    else meaningful.add(normalized);
  };

  try {
    invalidateHeadHash(config);
    const headNow = headHash(config);
    const headBefore = opts.headBefore || null;

    if (headBefore && headNow && headBefore !== headNow) {
      for (const relPath of gitPathList(config, ['diff', '--name-only', `${headBefore}..${headNow}`])) addPath(relPath);
    }

    for (const relPath of statusPaths(config)) addPath(relPath);

    return {
      ok: true,
      hasMeaningfulChanges: meaningful.size > 0,
      paths: [...meaningful].sort(),
      ignoredPaths: [...ignored].sort(),
      headBefore,
      headNow,
      source: 'git',
    };
  } catch (error) {
    return {
      ok: false,
      hasMeaningfulChanges: false,
      paths: [],
      ignoredPaths: [...ignored].sort(),
      headBefore: opts.headBefore || null,
      headNow: null,
      source: 'git',
      error,
    };
  }
}

export function buildForgeCompletionStatusFromDiff(diffEvidence, event = null, opts = {}) {
  const ready = Boolean(diffEvidence?.hasMeaningfulChanges);
  return {
    status: ready ? STATUS.READY_FOR_TESTING : STATUS.FAIL,
    source: opts.source || AGENT_OBSERVABILITY_FORGE_COMPLETION_SOURCE,
    summary: ready ? summarizePaths(diffEvidence.paths) : 'Forge agent ended without meaningful diff evidence',
    detail: ready ? null : 'Agent ended but only control/runtime artifacts changed, or no files changed.',
    completed_at: event?.ended_at || event?.ts || new Date().toISOString(),
    agent_ended_at: event?.ended_at || event?.ts || null,
    outcome: event?.outcome ?? null,
    reason: event?.reason ?? null,
    module_id: event?.module_id ?? opts.identity?.module_id ?? null,
    dispatch_id: event?.dispatch_id ?? opts.identity?.dispatch_id ?? null,
    gateway_label: event?.gateway_label ?? event?.label ?? opts.identity?.gateway_label ?? null,
    session_key: event?.session_key ?? opts.identity?.session_key ?? null,
    meaningful_paths: diffEvidence.paths || [],
    ignored_paths: diffEvidence.ignoredPaths || [],
    head_before: diffEvidence.headBefore || null,
    head_now: diffEvidence.headNow || null,
  };
}

function decodeRedisEntry(rawEntry) {
  if (!Array.isArray(rawEntry) || typeof rawEntry[0] !== 'string' || !Array.isArray(rawEntry[1])) return null;
  const data = {};
  for (let i = 0; i < rawEntry[1].length; i += 2) data[String(rawEntry[1][i])] = String(rawEntry[1][i + 1] ?? '');
  return { id: rawEntry[0], data };
}

function parseTelemetryEvent(entry) {
  const raw = entry?.data?.data;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.type !== 'agent.ended') return null;
    return { ...parsed, redis_id: entry.id };
  } catch (_error) {
    return null;
  }
}

function decodeXreadEntries(result) {
  const decoded = [];
  if (!Array.isArray(result)) return decoded;
  for (const streamResult of result) {
    const entries = streamResult?.[1];
    if (!Array.isArray(entries)) continue;
    for (const rawEntry of entries) {
      const entry = decodeRedisEntry(rawEntry);
      if (entry) decoded.push(entry);
    }
  }
  return decoded;
}

function matchesKnownIdentity(expectedValue, actualValue) {
  const expected = stringValue(expectedValue);
  const actual = stringValue(actualValue);
  return !expected || !actual || expected === actual;
}

export function matchesForgeAgentEndedTelemetry(event = {}, identity = {}) {
  if (event.type !== 'agent.ended') return false;
  if (event.agent_type && event.agent_type !== 'forge') return false;
  if (event.agent_scope && event.agent_scope !== 'agent') return false;
  const expectedModule = stringValue(identity.module_id) || stringValue(identity.moduleDir);
  if (expectedModule && event.module_id && event.module_id !== expectedModule) return false;
  if (!matchesKnownIdentity(identity.run_id, event.run_id)) return false;
  if (!matchesKnownIdentity(identity.dispatch_id, event.dispatch_id)) return false;
  if (!matchesKnownIdentity(identity.session_key, event.session_key)) return false;
  if (!matchesKnownIdentity(identity.gateway_label, event.gateway_label || event.label)) return false;
  return true;
}

export function buildForgeAgentEndedIdentity(config, moduleDir, opts = {}) {
  const tracked = opts.trackedAgent || null;
  return {
    run_id: opts.runId || opts.run_id || tracked?.run_id || getRunId(config) || null,
    module_id: opts.moduleId || opts.module_id || moduleDir || tracked?.moduleId || null,
    moduleDir,
    dispatch_id: opts.dispatchId || opts.dispatch_id || tracked?.telemetry_dispatch_id || tracked?.dispatch_id || null,
    session_key: opts.sessionKey || opts.session_key || tracked?.sessionKey || null,
    gateway_label: opts.gatewayLabel || opts.gateway_label || tracked?.gatewayLabel || opts.sessionLabel || null,
  };
}

export function createAgentEndedTelemetryReader(config, opts = {}) {
  if (opts.agentEndedReader) return opts.agentEndedReader;
  const runId = opts.runId || opts.run_id || getRunId(config) || '';
  const project = config?.project || '';
  if (!config?.telemetry?.enabled && !config?.telemetry?.stream_key) {
    return null;
  }
  if (!runId || !project) return null;

  const stream = opts.stream || getTelemetryStreamKeyForRun(config, runId);
  const blockMs = opts.blockMs ?? DEFAULT_XREAD_BLOCK_MS;
  let lastId = opts.startId || '$';
  let client = null;

  function redis() {
    if (client) return client;
    const RedisCtor = opts.RedisCtor || loadRedisCtor();
    client = createRedisClient(RedisCtor, opts.redis || {}, {
      retryStrategy: opts.retryStrategy || ((times) => Math.min(times * 100, 1000)),
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      lazyConnect: true,
    });
    client.on?.('error', () => {});
    return client;
  }

  return {
    async read(identity) {
      const result = await redis().xread('BLOCK', String(blockMs), 'COUNT', '10', 'STREAMS', stream, lastId);
      let matched = null;
      for (const entry of decodeXreadEntries(result)) {
        if (entry.id) lastId = entry.id;
        const event = parseTelemetryEvent(entry);
        if (!event) continue;
        if (!matched && matchesForgeAgentEndedTelemetry(event, identity)) matched = event;
      }
      return matched;
    },
    close() {
      if (!client) return;
      const current = client;
      client = null;
      try {
        if (typeof current.disconnect === 'function') current.disconnect();
        else void current.quit?.().catch?.(() => {});
      } catch (_error) {
        // best effort only
      }
    },
  };
}

export function shouldSettleAgentEnded(seenAtMs, nowMs = Date.now(), settleMs = DEFAULT_SETTLE_MS) {
  return seenAtMs > 0 && nowMs - seenAtMs < settleMs;
}

export function agentEndedSettleMs(config = {}, opts = {}) {
  return opts.agentEndedSettleMs ?? opts.settleMs ?? config.agent_observability_forge_completion_settle_ms ?? config.session_end_grace_ms ?? DEFAULT_SETTLE_MS;
}
