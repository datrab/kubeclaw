import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
// services/agent-observability-forge-completion.ts — Phase 5 Forge completion authority.
//
// Forge readiness is decided from canonical agent.ended telemetry plus meaningful
// git evidence. The typed forge-completion.json path is ignored as control output
// during this decision and is not completion authority here.

import path from 'path';
import { STATUS } from '../core/constants.ts';
import { getRunId } from '../core/runtime.ts';
import { gitExec, headHash, invalidateHeadHash } from '../integrations/git-worktree.ts';
import { createRedisClient, loadRedisCtor } from '../telemetry.ts';
import { getTelemetryStreamKeyForRun } from './telemetry-stream.ts';
import { agentObservabilityForgeCompletionWait } from './agent-observability-config.ts';

export const AGENT_OBSERVABILITY_FORGE_COMPLETION_SOURCE = 'agent_observability_agent_ended';
export const AGENT_OBSERVABILITY_FORGE_READY_REASON = 'agent_ended_meaningful_diff';
export const AGENT_OBSERVABILITY_FORGE_NO_WORK_REASON = 'agent_ended_no_meaningful_diff';
export const AGENT_OBSERVABILITY_FORGE_FALLBACK_READY_REASON = 'session_ended_meaningful_diff';
export const AGENT_OBSERVABILITY_FORGE_FALLBACK_NO_WORK_REASON = 'session_ended_no_meaningful_diff';
const INJECTED_DIFF_EVIDENCE_SOURCE = 'injected';
const REDIS_XREAD_LATEST_ID = '$';

const RUNTIME_PATH_PREFIXES = [
  '.swarm/',
  'logs/',
];

function stringValue(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function rawStringValue(value) {
  if (selectTruthyValue(() => (value === undefined), () => (value === null))) return '';
  return String(value);
}

function arrayValue(value) {
  return Array.isArray(value) ? value : [];
}

function objectRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function firstDefined(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null) return value;
  }
  return null;
}

function forgeCompletionSource(opts = {}) {
  return firstDefined(opts.source, AGENT_OBSERVABILITY_FORGE_COMPLETION_SOURCE);
}

function agentEndedStreamKey(config, runId, opts = {}) {
  return firstDefined(opts.stream, getTelemetryStreamKeyForRun(config, runId));
}

function agentEndedReadBlockPolicy(config, opts = {}) {
  return firstDefined(opts.blockMs, agentEndedReadBlockMs(config));
}

function agentEndedRedisCtor(opts = {}) {
  return firstDefined(opts.RedisCtor, loadRedisCtor());
}

function agentEndedRedisRetryStrategy(times) {
  return Math.min(times * 100, 1000);
}

function agentEndedSettlePolicy(config = {}, opts = {}) {
  return firstDefined(opts.agentEndedSettleMs, opts.settleMs, agentObservabilityForgeCompletionWait(config).settleMs);
}

function agentEndedReadBlockConfigPolicy(config = {}, opts = {}) {
  return firstDefined(opts.blockMs, agentObservabilityForgeCompletionWait(config).xreadBlockMs);
}

function normalizeRelPath(value = '') {
  return rawStringValue(value)
    .replace(/\\/g, '/')
    .replace(/^"|"$/g, '')
    .replace(/^(?:\.\/)+/, '')
    .replace(/^\/+/, '');
}

function porcelainPath(line = '') {
  const raw = String(line).replace(/^[ MADRCU?!]{1,2}\s+/, '').trim();
  return normalizeRelPath(raw.includes(' -> ') ? raw.split(' -> ').pop() : raw);
}

function isInsidePath(child, parent) {
  if (selectTruthyValue(() => (!child), () => (!parent))) return false;
  const relative = path.relative(path.resolve(parent), path.resolve(child));
  return selectTruthyValue(() => (relative === ''), () => ((!!relative && !relative.startsWith('..') && !path.isAbsolute(relative))));
}

function moduleRelativePath(config, moduleDir, fileName) {
  const modulesDir = config?.paths?.modules_dir;
  if (selectTruthyValue(() => (selectTruthyValue(() => (!modulesDir), () => (!config?.repo_root))), () => (!moduleDir))) return null;
  const abs = path.resolve(modulesDir, moduleDir, fileName);
  return normalizeRelPath(path.relative(config.repo_root, abs));
}

function projectScopeRelPath(config) {
  const repoRoot = stringValue(config?.repo_root);
  const swarmDir = stringValue(config?.paths?.swarm_dir);
  if (selectTruthyValue(() => (!repoRoot), () => (!swarmDir))) return null;
  return normalizeRelPath(path.relative(repoRoot, path.dirname(swarmDir)));
}

function isProjectScopedPath(config, relPath) {
  const scope = projectScopeRelPath(config);
  if (!scope) {
    throw new Error('Forge completion diff evidence requires repo_root and paths.swarm_dir to determine project scope');
  }
  const normalized = normalizeRelPath(relPath);
  return selectTruthyValue(() => (normalized === scope), () => (normalized.startsWith(`${scope}/`)));
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
  if (RUNTIME_PATH_PREFIXES.some((prefix) => selectTruthyValue(() => (normalized === prefix.slice(0, -1)), () => (normalized.startsWith(prefix))))) return true;
  if (selectTruthyValue(() => (normalized.includes('/.swarm/')), () => (normalized.startsWith('.swarm/')))) return true;
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
    const paths = [...new Set(arrayValue(opts.diffEvidence.paths).map(normalizeRelPath).filter(Boolean))];
    const ignoredPaths = [...new Set(arrayValue(opts.diffEvidence.ignored_paths).map(normalizeRelPath).filter(Boolean))];
    return {
      ok: opts.diffEvidence.ok !== false,
      hasMeaningfulChanges: Boolean(opts.diffEvidence.hasMeaningfulChanges),
      paths,
      ignoredPaths,
      headBefore: selectDefinedValue(() => (opts.diffEvidence.headBefore), () => (null)),
      headNow: selectDefinedValue(() => (opts.diffEvidence.headNow), () => (null)),
      source: selectDefinedValue(() => (stringValue(opts.diffEvidence.source)), () => (INJECTED_DIFF_EVIDENCE_SOURCE)),
      error: selectDefinedValue(() => (opts.diffEvidence.error), () => (null)),
    };
  }

  if (!config?.repo_root) {
    return {
      ok: false,
      hasMeaningfulChanges: false,
      paths: [],
      ignoredPaths: [],
      headBefore: selectDefinedValue(() => (opts.headBefore), () => (null)),
      headNow: null,
      source: 'repo_root_required',
      error: {
        code: 'FORGE_COMPLETION_REPO_ROOT_REQUIRED',
        message: 'Forge completion polling requires typed repo_root diff context',
      },
    };
  }
  if (!projectScopeRelPath(config)) {
    return {
      ok: false,
      hasMeaningfulChanges: false,
      paths: [],
      ignoredPaths: [],
      headBefore: selectDefinedValue(() => (opts.headBefore), () => (null)),
      headNow: null,
      source: 'project_scope_required',
      error: {
        code: 'FORGE_COMPLETION_PROJECT_SCOPE_REQUIRED',
        message: 'Forge completion polling requires typed repo_root and paths.swarm_dir diff context',
      },
    };
  }

  const extraIgnoredPaths = arrayValue(opts.ignoredPaths);
  const meaningful = new Set();
  const ignored = new Set();
  const addPath = (relPath) => {
    const normalized = normalizeRelPath(relPath);
    if (!normalized) return;
    if (selectTruthyValue(() => (!isProjectScopedPath(config, normalized)), () => (isForgeCompletionControlPath(normalized, config, moduleDir, extraIgnoredPaths)))) ignored.add(normalized);
    else meaningful.add(normalized);
  };

  try {
    invalidateHeadHash(config);
    const headNow = headHash(config);
    const headBefore = selectDefinedValue(() => (opts.headBefore), () => (null));

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
      headBefore: selectDefinedValue(() => (opts.headBefore), () => (null)),
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
    source: forgeCompletionSource(opts),
    summary: ready ? summarizePaths(diffEvidence.paths) : 'Forge agent ended without meaningful diff evidence',
    detail: ready ? null : 'Agent ended but only control/runtime artifacts changed, or no files changed.',
    completed_at: (selectDefinedValue(() => (event?.ended_at), () => (new Date().toISOString()))),
    agent_ended_at: (selectDefinedValue(() => (event?.ended_at), () => (null))),
    outcome: selectDefinedValue(() => (event?.outcome), () => (null)),
    reason: selectDefinedValue(() => (event?.reason), () => (null)),
    module_id: selectDefinedValue(() => (selectDefinedValue(() => (event?.module_id), () => (opts.identity?.module_id))), () => (null)),
    dispatch_id: selectDefinedValue(() => (selectDefinedValue(() => (event?.dispatch_id), () => (opts.identity?.dispatch_id))), () => (null)),
    gateway_label: selectDefinedValue(() => (selectDefinedValue(() => (selectDefinedValue(() => (event?.gateway_label), () => (event?.label))), () => (opts.identity?.gateway_label))), () => (null)),
    session_key: selectDefinedValue(() => (selectDefinedValue(() => (event?.session_key), () => (opts.identity?.session_key))), () => (null)),
    meaningful_paths: arrayValue(diffEvidence.paths),
    ignored_paths: arrayValue(diffEvidence.ignoredPaths),
    head_before: selectDefinedValue(() => (diffEvidence.headBefore), () => (null)),
    head_now: selectDefinedValue(() => (diffEvidence.headNow), () => (null)),
  };
}

function decodeRedisEntry(rawEntry) {
  if (selectTruthyValue(() => (selectTruthyValue(() => (!Array.isArray(rawEntry)), () => (typeof rawEntry[0] !== 'string'))), () => (!Array.isArray(rawEntry[1])))) return null;
  const data = {};
  for (let i = 0; i < rawEntry[1].length; i += 2) data[String(rawEntry[1][i])] = rawStringValue(rawEntry[1][i + 1]);
  return { id: rawEntry[0], data };
}

function parseTelemetryEvent(entry) {
  const raw = entry?.data?.data;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (selectTruthyValue(() => (!parsed), () => (parsed.type !== 'agent.ended'))) return null;
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
  return selectTruthyValue(() => (selectTruthyValue(() => (!expected), () => (!actual))), () => (expected === actual));
}

export function matchesForgeAgentEndedTelemetry(event = {}, identity = {}) {
  if (event.type !== 'agent.ended') return false;
  if (event.agent_type && event.agent_type !== 'forge') return false;
  if (event.agent_scope && event.agent_scope !== 'agent') return false;
  const expectedModule = (selectDefinedValue(() => (stringValue(identity.module_id)), () => (null)));
  if (expectedModule && event.module_id && event.module_id !== expectedModule) return false;
  if (!matchesKnownIdentity(identity.run_id, event.run_id)) return false;
  if (!matchesKnownIdentity(identity.dispatch_id, event.dispatch_id)) return false;
  if (!matchesKnownIdentity(identity.session_key, event.session_key)) return false;
  if (!matchesKnownIdentity(identity.gateway_label, (selectDefinedValue(() => (event.gateway_label), () => (null))))) return false;
  return true;
}

export function buildForgeAgentEndedIdentity(config, moduleDir, opts = {}) {
  const tracked = selectDefinedValue(() => (opts.trackedAgent), () => (null));
  return {
    run_id: (selectDefinedValue(() => (opts.runId), () => (null))),
    module_id: (selectDefinedValue(() => (opts.moduleId), () => (null))),
    moduleDir,
    attempt: (selectDefinedValue(() => (opts.attempt), () => (null))),
    dispatch_id: (selectDefinedValue(() => (opts.dispatchId), () => (null))),
    session_key: (selectDefinedValue(() => (opts.sessionKey), () => (null))),
    gateway_label: (selectDefinedValue(() => (opts.gatewayLabel), () => (null))),
  };
}

export function createAgentEndedTelemetryReader(config, opts = {}) {
  if (opts.agentEndedReader) return opts.agentEndedReader;
  const runId = (selectDefinedValue(() => (opts.runId), () => ('')));
  const project = stringValue(config?.project);
  if (config?.telemetry?.enabled !== true) {
    return null;
  }
  if (selectTruthyValue(() => (!runId), () => (!project))) return null;

  const stream = agentEndedStreamKey(config, runId, opts);
  const blockMs = agentEndedReadBlockPolicy(config, opts);
  let lastId = selectDefinedValue(() => (stringValue(opts.startId)), () => (REDIS_XREAD_LATEST_ID));
  let client = null;
  let redisReady = false;

  function redis() {
    if (client) return client;
    const RedisCtor = agentEndedRedisCtor(opts);
    client = createRedisClient(RedisCtor, objectRecord(opts.redis), {
      retryStrategy: typeof opts.retryStrategy === 'function' ? opts.retryStrategy : agentEndedRedisRetryStrategy,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      lazyConnect: true,
    });
    client.on?.('error', () => {});
    return client;
  }

  async function ensureRedisReady() {
    const current = redis();
    if (redisReady) return current;
    const status = typeof current.status === 'string' ? current.status : '';
    if (typeof current.connect === 'function' && status !== 'ready') {
      await current.connect();
    }
    if (typeof current.ping === 'function') {
      await current.ping();
    }
    redisReady = true;
    return current;
  }

  return {
    async read(identity) {
      const current = await ensureRedisReady();
      const result = await current.xread('BLOCK', String(blockMs), 'COUNT', '10', 'STREAMS', stream, lastId);
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
      redisReady = false;
      try {
        if (typeof current.disconnect === 'function') current.disconnect();
        else void current.quit?.().catch?.(() => {});
      } catch (_error) {
        // best effort only
      }
    },
  };
}

export function shouldSettleAgentEnded(seenAtMs, nowMs = Date.now(), settleMs) {
  if (selectTruthyValue(() => (!Number.isFinite(Number(settleMs))), () => (Number(settleMs) < 0))) {
    throw new Error('agent_observability forge completion settle_ms must be a non-negative number');
  }
  return seenAtMs > 0 && nowMs - seenAtMs < settleMs;
}

export function agentEndedSettleMs(config = {}, opts = {}) {
  const value = agentEndedSettlePolicy(config, opts);
  const normalized = Number(value);
  if (Number.isFinite(normalized) && normalized >= 0) return normalized;
  throw new Error('agent_observability forge completion settle_ms must be a non-negative number');
}

export function agentEndedReadBlockMs(config = {}, opts = {}) {
  const value = agentEndedReadBlockConfigPolicy(config, opts);
  const normalized = Number(value);
  if (Number.isFinite(normalized) && normalized >= 0) return normalized;
  throw new Error('agent_observability forge completion read block policy must resolve to a non-negative number');
}
