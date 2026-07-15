import fs from 'fs';
import path from 'path';
import { getRunId, createEffectReceipt, createOpaqueId, isoNow } from '../core/runtime.ts';
import { pipelineLogDir, resolvePipelineRunLogDir, validateSafePath } from '../core/paths.ts';
import { isPlainObject } from './validation.ts';
import { getTelemetryStreamKey } from '../telemetry.ts';

import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
const ARTIFACT_INLINE_FORMATS = new Set(['json', 'text', 'markdown']);
const ARTIFACT_PERSIST_FORMATS = new Set([...ARTIFACT_INLINE_FORMATS, 'file_copy']);
const ARTIFACT_INDEX_LOCK_STALE_MS = 5 * 60 * 1000;

export const PIPELINE_ARTIFACT_AUTHORITY_ROLES = Object.freeze({
  RUN_SCOPED_REPLAY: 'run_scoped_replay',
  LATEST_POINTER: 'latest_pointer',
  OPERATOR_MIRROR: 'operator_mirror',
  DIAGNOSTIC_FALLBACK: 'diagnostic_fallback',
  SUMMARY_OPERATOR_VIEW: 'summary_operator_view',
  PLUGIN_ARTIFACT_REFERENCE: 'plugin_artifact_reference',
});

export const PIPELINE_ARTIFACT_SURFACES = Object.freeze({
  RUN_PIPELINE_JSONL: 'run_pipeline_jsonl',
  RUN_DISCORD_JSONL: 'run_discord_jsonl',
  RUN_SUMMARY_JSON: 'run_summary_json',
  LATEST_JSON: 'latest_json',
  GLOBAL_PIPELINE_JSONL: 'global_pipeline_jsonl',
  GLOBAL_DISCORD_JSONL: 'global_discord_jsonl',
  PIPELINE_SUMMARY_JSON: 'pipeline_summary_json',
  BUSTER_DIAGNOSTIC: 'buster_diagnostic',
  FALLBACK_TELEMETRY: 'fallback_telemetry',
  PLUGIN_ARTIFACT_INDEX: 'plugin_artifact_index',
});

const RUN_SCOPED_REPLAY_SURFACES = new Set([
  PIPELINE_ARTIFACT_SURFACES.RUN_PIPELINE_JSONL,
  PIPELINE_ARTIFACT_SURFACES.RUN_DISCORD_JSONL,
  PIPELINE_ARTIFACT_SURFACES.RUN_SUMMARY_JSON,
]);

const OPERATOR_MIRROR_SURFACES = new Set([
  PIPELINE_ARTIFACT_SURFACES.GLOBAL_PIPELINE_JSONL,
  PIPELINE_ARTIFACT_SURFACES.GLOBAL_DISCORD_JSONL,
  PIPELINE_ARTIFACT_SURFACES.PIPELINE_SUMMARY_JSON,
]);

const DIAGNOSTIC_FALLBACK_SURFACES = new Set([
  PIPELINE_ARTIFACT_SURFACES.BUSTER_DIAGNOSTIC,
  PIPELINE_ARTIFACT_SURFACES.FALLBACK_TELEMETRY,
]);

function sanitizeSegment(value, label = 'Artifact segment') {
  const normalized = String(selectDefinedValue(() => (value), () => (''))).trim().replace(/[^a-zA-Z0-9._-]+/g, '_');
  if (!normalized) {
    throw new Error(`${label} must produce a non-empty artifact path segment`);
  }
  if (/^\.+$/.test(normalized)) {
    throw new Error(`${label} must not be dot-only`);
  }
  return normalized;
}

function toPortableRelativePath(basePath, targetPath) {
  if (!basePath) return targetPath;
  return path.relative(basePath, targetPath).split(path.sep).join('/');
}

function assertPathInside(candidatePath, rootPath, label) {
  const relativePath = path.relative(path.resolve(rootPath), path.resolve(candidatePath));
  if (selectTruthyValue(() => (relativePath === ''), () => ((relativePath && !relativePath.startsWith('..') && !path.isAbsolute(relativePath))))) {
    return candidatePath;
  }
  throw new Error(`${label} must resolve inside plugin artifact root`);
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
  return dirPath;
}

function readJsonIfPresent(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
}

function assertNonEmptyString(value, label) {
  if (selectTruthyValue(() => (typeof value !== 'string'), () => (!value.trim()))) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value.trim();
}

function requireArtifactRepoRoot(config) {
  return assertNonEmptyString(config?.repo_root, 'config.repo_root');
}

function assertOptionalObject(value, label) {
  if (value === undefined) return undefined;
  if (!isPlainObject(value)) {
    throw new Error(`${label} must be a plain object when provided`);
  }
  return { ...value };
}

function numberOrNull(value) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function countFacts(value) {
  return isPlainObject(value)
    ? {
        total: numberOrNull(value.total),
        completed: numberOrNull(value.completed),
        failed_or_blocked: numberOrNull(value.failed_or_blocked),
        pending: numberOrNull(value.pending),
        status_counts: isPlainObject(value.status_counts) ? { ...value.status_counts } : {},
      }
    : {
        total: null,
        completed: null,
        failed_or_blocked: null,
        pending: null,
        status_counts: {},
      };
}

export function buildRunTestSummary(runFacts = null) {
  const agents = isPlainObject(runFacts?.agents) ? runFacts.agents : {};
  return {
    source: runFacts ? 'run_facts' : 'not_available',
    modules: countFacts(runFacts?.modules),
    gates: countFacts(runFacts?.gates),
    attempts: {
      forge: numberOrNull(agents.forge),
      buster: numberOrNull(agents.buster),
      echo: numberOrNull(agents.echo),
      total_agents: numberOrNull(agents.total),
    },
  };
}

export function buildRunCostSummary({
  usageAggregate = null,
  budgetStatus = null,
  costReportPath = null,
} = {}) {
  const usage = isPlainObject(usageAggregate?.run) ? usageAggregate.run : {};
  const inputTokens = numberOrNull(usage.input_tokens);
  const outputTokens = numberOrNull(usage.output_tokens);
  return {
    source: usageAggregate ? 'model_usage' : 'not_available',
    total_input_tokens: inputTokens,
    total_output_tokens: outputTokens,
    total_tokens: inputTokens != null && outputTokens != null ? inputTokens + outputTokens : null,
    estimated_cost_usd: numberOrNull(usage.estimated_cost_usd),
    budget_threshold_status: selectDefinedValue(() => (budgetStatus), () => (null)),
    cost_report_path: selectDefinedValue(() => (costReportPath), () => (null)),
  };
}

function assertCanonicalArtifactIdentity(artifact = {}) {
  if (!isPlainObject(artifact)) return;
  const removedAliases = [
    ['runId', 'run_id'],
    ['sessionKey', 'session_key'],
    ['dispatchId', 'dispatch_id'],
  ];
  for (const [removedAlias, canonicalField] of removedAliases) {
    if (Object.prototype.hasOwnProperty.call(artifact, removedAlias)) {
      throw new Error(`Artifact identity must use canonical '${canonicalField}' field; removed alias '${removedAlias}' is not accepted`);
    }
  }
}

function resolveArtifactExtension(request) {
  if (request.format === 'json') return '.json';
  if (request.format === 'markdown') return '.md';
  if (request.format === 'text') return '.txt';
  if (request.format === 'file_copy') {
    const sourceExt = path.extname(selectDefinedValue(() => (request.sourcePath), () => (''))).trim();
    return selectDefinedValue(() => (sourceExt), () => ('.bin'));
  }
  return '.dat';
}

function resolveArtifactLanePaths(config = {}, { hookFamily = null, stageId = null, moduleId = null } = {}) {
  const runId = selectTruthyValue(() => (selectTruthyValue(() => (selectTruthyValue(() => (config?._runId), () => (config?.run_id))), () => (getRunId(config)))), () => (null));
  const runLogDir = resolvePipelineRunLogDir(config, runId);
  if (!runLogDir) {
    throw new Error('Plugin artifact lane requires a resolved pipeline run log directory');
  }
  const pluginArtifactsRoot = path.join(runLogDir, 'plugin-artifacts');
  const laneModuleId = sanitizeSegment(assertNonEmptyString(moduleId, 'Plugin artifact moduleId'), 'Plugin artifact moduleId');
  const laneHookFamily = sanitizeSegment(assertNonEmptyString(hookFamily, 'Plugin artifact hookFamily'), 'Plugin artifact hookFamily');
  const laneStageId = sanitizeSegment(assertNonEmptyString(stageId, 'Plugin artifact stageId'), 'Plugin artifact stageId');
  const laneDir = path.join(
    pluginArtifactsRoot,
    laneModuleId,
    laneHookFamily,
    laneStageId,
  );
  const dataDir = path.join(laneDir, 'data');

  return {
    runId,
    runLogDir,
    laneDir: assertPathInside(laneDir, pluginArtifactsRoot, 'Plugin artifact lane path'),
    dataDir: assertPathInside(dataDir, pluginArtifactsRoot, 'Plugin artifact data path'),
    indexPath: assertPathInside(path.join(laneDir, 'index.json'), pluginArtifactsRoot, 'Plugin artifact index path'),
  };
}

function readArtifactIndex(indexPath) {
  return readJsonIfPresent(indexPath, []);
}

function writeArtifactIndex(indexPath, entries) {
  writeJson(indexPath, entries);
}

function sameArtifactIndexEntry(left, right) {
  return Boolean(selectTruthyValue(() => ((left?.path && right?.path && left.path === right.path)), () => ((left?.abs_path && right?.abs_path && left.abs_path === right.abs_path))));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withArtifactIndexLock(indexPath, fn) {
  const lockPath = `${indexPath}.lock`;
  ensureDir(path.dirname(lockPath));
  for (let attempt = 0; attempt < 200; attempt += 1) {
    try {
      fs.mkdirSync(lockPath);
      writeJson(path.join(lockPath, 'owner.json'), {
        pid: process.pid,
        acquired_at: isoNow(),
        index_path: indexPath,
      });
      try {
        return await fn();
      } finally {
        fs.rmSync(lockPath, { recursive: true, force: true });
      }
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
      try {
        const stat = fs.statSync(lockPath);
        if (Date.now() - stat.mtimeMs > ARTIFACT_INDEX_LOCK_STALE_MS) {
          fs.rmSync(lockPath, { recursive: true, force: true });
          continue;
        }
      } catch (statError) {
        if (statError?.code !== 'ENOENT') throw statError;
        continue;
      }
      await sleep(10);
    }
  }
  throw new Error(`Timed out waiting for plugin artifact index lock: ${indexPath}`);
}

async function appendArtifactIndexEntry(indexPath, entry) {
  return withArtifactIndexLock(indexPath, async () => {
    const entries = readArtifactIndex(indexPath);
    if (!entries.some((existing) => sameArtifactIndexEntry(existing, entry))) {
      entries.push(entry);
    }
    const tmpPath = `${indexPath}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`;
    writeArtifactIndex(tmpPath, entries);
    fs.renameSync(tmpPath, indexPath);
    return entries;
  });
}

function normalizeArtifactRef(config, entry) {
  return {
    type: entry.type,
    path: entry.path,
    ...(entry.label ? { label: entry.label } : {}),
    ...(entry.role ? { role: entry.role } : {}),
    ...(entry.authority ? { authority: entry.authority } : {}),
  };
}

function validateArtifactQuery(query = {}) {
  if (!isPlainObject(query)) throw new Error('Artifact query must be a plain object');
  const limit = query.limit == null ? null : Number(query.limit);
  if (limit != null && (selectTruthyValue(() => (!Number.isInteger(limit)), () => (limit < 1)))) {
    throw new Error('Artifact query limit must be a positive integer when provided');
  }
  return {
    ...(query.type ? { type: assertNonEmptyString(query.type, 'Artifact query type') } : {}),
    ...(query.role ? { role: assertNonEmptyString(query.role, 'Artifact query role') } : {}),
    ...(query.label ? { label: assertNonEmptyString(query.label, 'Artifact query label') } : {}),
    ...(limit != null ? { limit } : {}),
  };
}

export function classifyPipelineArtifactSurface(surface = null, artifact = {}) {
  const normalizedSurface = surface ? String(surface).trim() : '';
  if (normalizedSurface === PIPELINE_ARTIFACT_SURFACES.LATEST_JSON) return PIPELINE_ARTIFACT_AUTHORITY_ROLES.LATEST_POINTER;
  if (normalizedSurface === PIPELINE_ARTIFACT_SURFACES.PLUGIN_ARTIFACT_INDEX) return PIPELINE_ARTIFACT_AUTHORITY_ROLES.PLUGIN_ARTIFACT_REFERENCE;
  if (RUN_SCOPED_REPLAY_SURFACES.has(normalizedSurface)) return PIPELINE_ARTIFACT_AUTHORITY_ROLES.RUN_SCOPED_REPLAY;
  if (OPERATOR_MIRROR_SURFACES.has(normalizedSurface)) return PIPELINE_ARTIFACT_AUTHORITY_ROLES.OPERATOR_MIRROR;
  if (DIAGNOSTIC_FALLBACK_SURFACES.has(normalizedSurface)) return PIPELINE_ARTIFACT_AUTHORITY_ROLES.DIAGNOSTIC_FALLBACK;
  if (selectTruthyValue(() => (artifact?.artifact_fallback === true), () => (artifact?.seq === null))) return PIPELINE_ARTIFACT_AUTHORITY_ROLES.DIAGNOSTIC_FALLBACK;
  return PIPELINE_ARTIFACT_AUTHORITY_ROLES.OPERATOR_MIRROR;
}

export function buildPipelineArtifactAuthorityPolicy({
  surface = null,
  artifact = {},
  expectedRunId = null,
  expectedSessionKey = null,
  expectedDispatchId = null,
} = {}) {
  assertCanonicalArtifactIdentity(artifact);
  const role = classifyPipelineArtifactSurface(surface, artifact);
  const artifactRunId = selectTruthyValue(() => (artifact?.run_id), () => (null));
  const artifactSessionKey = selectTruthyValue(() => (artifact?.session_key), () => (null));
  const artifactDispatchId = selectTruthyValue(() => (artifact?.dispatch_id), () => (null));
  const runIdMatches = selectTruthyValue(() => (selectTruthyValue(() => (!expectedRunId), () => (!artifactRunId))), () => (String(expectedRunId) === String(artifactRunId)));
  const sessionKeyMatches = selectTruthyValue(() => (selectTruthyValue(() => (!expectedSessionKey), () => (!artifactSessionKey))), () => (String(expectedSessionKey) === String(artifactSessionKey)));
  const dispatchIdMatches = selectTruthyValue(() => (selectTruthyValue(() => (!expectedDispatchId), () => (!artifactDispatchId))), () => (String(expectedDispatchId) === String(artifactDispatchId)));
  const artifactMarkedFallback = artifact?.artifact_fallback === true;
  const artifactMissingSequence = artifact?.seq === null;
  const roleMarksDiagnosticFallback = role === PIPELINE_ARTIFACT_AUTHORITY_ROLES.DIAGNOSTIC_FALLBACK;
  const fallbackEvidence = [artifactMarkedFallback, artifactMissingSequence, roleMarksDiagnosticFallback].some(Boolean);
  const identityDrift = Boolean(selectTruthyValue(() => (selectTruthyValue(() => ((expectedRunId && artifactRunId && !runIdMatches)), () => ((expectedSessionKey && artifactSessionKey && !sessionKeyMatches)))), () => ((expectedDispatchId && artifactDispatchId && !dispatchIdMatches))));
  const stalePointer = Boolean(role === PIPELINE_ARTIFACT_AUTHORITY_ROLES.LATEST_POINTER && identityDrift);
  return {
    code: identityDrift ? 'artifact_identity_drift' : `${role}_evidence`,
    role,
    surface: selectTruthyValue(() => (surface), () => (null)),
    artifact_run_id: artifactRunId,
    expected_run_id: selectTruthyValue(() => (expectedRunId), () => (null)),
    run_id_matches: runIdMatches,
    artifact_session_key: artifactSessionKey,
    expected_session_key: selectTruthyValue(() => (expectedSessionKey), () => (null)),
    session_key_matches: sessionKeyMatches,
    artifact_dispatch_id: artifactDispatchId,
    expected_dispatch_id: selectTruthyValue(() => (expectedDispatchId), () => (null)),
    dispatch_id_matches: dispatchIdMatches,
    fallback_evidence: fallbackEvidence,
    identity_drift: identityDrift,
    stale_pointer: stalePointer,
    allow_lifecycle_authority: false,
    allow_session_authority: false,
    allow_scheduler_authority: false,
    allow_completion_authority: false,
    allow_ordering_authority: false,
    operator_replay_authority: role === PIPELINE_ARTIFACT_AUTHORITY_ROLES.RUN_SCOPED_REPLAY && runIdMatches && !fallbackEvidence,
    operator_pointer_only: role === PIPELINE_ARTIFACT_AUTHORITY_ROLES.LATEST_POINTER,
    diagnostic_evidence_only: [fallbackEvidence, roleMarksDiagnosticFallback].some(Boolean),
  };
}

export function projectPipelineArtifactEvidence({
  surface = null,
  path: artifactPath = null,
  artifact = {},
  expectedRunId = null,
  expectedSessionKey = null,
  expectedDispatchId = null,
} = {}) {
  assertCanonicalArtifactIdentity(artifact);
  const authority = buildPipelineArtifactAuthorityPolicy({ surface, artifact, expectedRunId, expectedSessionKey, expectedDispatchId });
  return {
    surface: selectTruthyValue(() => (surface), () => (null)),
    path: selectTruthyValue(() => (artifactPath), () => (null)),
    run_id: selectTruthyValue(() => (artifact?.run_id), () => (null)),
    role: authority.role,
    authority,
  };
}

function validatePersistArtifactRequest(request = {}) {
  if (!isPlainObject(request)) throw new Error('Artifact persist request must be a plain object');

  const type = assertNonEmptyString(request.type, 'Artifact type');
  const role = request.role === undefined ? undefined : assertNonEmptyString(request.role, 'Artifact role');
  const label = request.label === undefined ? undefined : assertNonEmptyString(request.label, 'Artifact label');
  const format = assertNonEmptyString(request.format, 'Artifact format');
  if (!ARTIFACT_PERSIST_FORMATS.has(format)) {
    throw new Error(`Artifact format '${format}' is not supported`);
  }

  const metadata = assertOptionalObject(request.metadata, 'Artifact metadata');
  const suggestedPath = request.suggestedPath === undefined ? undefined : assertNonEmptyString(request.suggestedPath, 'Artifact suggestedPath');

  if (ARTIFACT_INLINE_FORMATS.has(format)) {
    if (request.content === undefined) {
      throw new Error(`Artifact content is required when format='${format}'`);
    }
    if (format === 'json') {
      if (!(selectTruthyValue(() => (selectTruthyValue(() => (typeof request.content === 'string'), () => (isPlainObject(request.content)))), () => (Array.isArray(request.content))))) {
        throw new Error("Artifact json content must be a string, object, or array");
      }
    } else if (typeof request.content !== 'string') {
      throw new Error(`Artifact content for format='${format}' must be a string`);
    }
  }

  if (format === 'file_copy') {
    const sourcePath = assertNonEmptyString(request.sourcePath, 'Artifact sourcePath');
    validateSafePath(sourcePath, 'artifact.sourcePath');
  }

  return {
    type,
    ...(role ? { role } : {}),
    ...(label ? { label } : {}),
    format,
    ...(request.content !== undefined ? { content: request.content } : {}),
    ...(request.sourcePath ? { sourcePath: request.sourcePath } : {}),
    ...(suggestedPath ? { suggestedPath } : {}),
    ...(metadata ? { metadata } : {}),
  };
}

function writeArtifactPayload(targetPath, request) {
  if (request.format === 'json') {
    const payload = typeof request.content === 'string'
      ? request.content
      : JSON.stringify(request.content, null, 2);
    fs.writeFileSync(targetPath, payload);
    return;
  }

  if (selectTruthyValue(() => (request.format === 'text'), () => (request.format === 'markdown'))) {
    fs.writeFileSync(targetPath, request.content);
    return;
  }

  if (request.format === 'file_copy') {
    fs.copyFileSync(request.sourcePath, targetPath);
    return;
  }

  throw new Error(`Unsupported artifact format '${request.format}'`);
}

export function getPipelineArtifactBundle(config = {}) {
  const runId = selectTruthyValue(() => (selectTruthyValue(() => (selectTruthyValue(() => (config?._runId), () => (config?.run_id))), () => (getRunId(config)))), () => (null));
  const pipelineDir = pipelineLogDir(config);
  const runLogDir = resolvePipelineRunLogDir(config, runId);
  const runDir = runId ? `runs/${runId}` : null;
  const relative = {
    run_dir: runDir,
    path: runDir,
    pipeline_jsonl: runDir ? `${runDir}/pipeline.jsonl` : null,
    discord_jsonl: runDir ? `${runDir}/discord.jsonl` : null,
    summary_json: runDir ? `${runDir}/summary.json` : null,
    nova_injections_jsonl: runDir ? `${runDir}/nova-injections.jsonl` : null,
    buster_telemetry_fallback_jsonl: runDir ? `${runDir}/buster-telemetry-fallback.jsonl` : null,
    redis_exchanges_jsonl: runDir ? `${runDir}/redis/redis-exchanges.jsonl` : null,
    redis_ops_jsonl: runDir ? `${runDir}/redis/redis-ops.jsonl` : null,
    pipeline_summary_json: 'summary.json',
    latest_json: 'latest.json',
  };
  const authority = {
    pipeline_jsonl: projectPipelineArtifactEvidence({ surface: PIPELINE_ARTIFACT_SURFACES.RUN_PIPELINE_JSONL, path: relative.pipeline_jsonl, artifact: { run_id: runId }, expectedRunId: runId }),
    discord_jsonl: projectPipelineArtifactEvidence({ surface: PIPELINE_ARTIFACT_SURFACES.RUN_DISCORD_JSONL, path: relative.discord_jsonl, artifact: { run_id: runId }, expectedRunId: runId }),
    summary_json: projectPipelineArtifactEvidence({ surface: PIPELINE_ARTIFACT_SURFACES.RUN_SUMMARY_JSON, path: relative.summary_json, artifact: { run_id: runId }, expectedRunId: runId }),
    latest_json: projectPipelineArtifactEvidence({ surface: PIPELINE_ARTIFACT_SURFACES.LATEST_JSON, path: relative.latest_json, artifact: { run_id: runId }, expectedRunId: runId }),
    pipeline_summary_json: projectPipelineArtifactEvidence({ surface: PIPELINE_ARTIFACT_SURFACES.PIPELINE_SUMMARY_JSON, path: relative.pipeline_summary_json, artifact: { run_id: runId }, expectedRunId: runId }),
    buster_telemetry_fallback_jsonl: projectPipelineArtifactEvidence({ surface: PIPELINE_ARTIFACT_SURFACES.FALLBACK_TELEMETRY, path: relative.buster_telemetry_fallback_jsonl, artifact: { run_id: runId, artifact_fallback: true }, expectedRunId: runId }),
  };

  return {
    run_id: runId,
    telemetry_stream_key: config?.project && runId ? getTelemetryStreamKey(config.project, runId) : null,
    pipeline_dir: pipelineDir,
    run_log_dir: runLogDir,
    latest_json_path: pipelineDir ? path.join(pipelineDir, 'latest.json') : null,
    global_pipeline_jsonl_path: pipelineDir ? path.join(pipelineDir, 'pipeline.jsonl') : null,
    global_discord_jsonl_path: pipelineDir ? path.join(pipelineDir, 'discord.jsonl') : null,
    pipeline_summary_path: pipelineDir ? path.join(pipelineDir, 'summary.json') : null,
    global_nova_injections_jsonl_path: pipelineDir ? path.join(pipelineDir, 'nova-injections.jsonl') : null,
    global_buster_telemetry_fallback_jsonl_path: pipelineDir ? path.join(pipelineDir, 'buster-telemetry-fallback.jsonl') : null,
    run_pipeline_jsonl_path: runLogDir ? path.join(runLogDir, 'pipeline.jsonl') : null,
    run_discord_jsonl_path: runLogDir ? path.join(runLogDir, 'discord.jsonl') : null,
    run_summary_path: runLogDir ? path.join(runLogDir, 'summary.json') : null,
    run_nova_injections_jsonl_path: runLogDir ? path.join(runLogDir, 'nova-injections.jsonl') : null,
    run_buster_telemetry_fallback_jsonl_path: runLogDir ? path.join(runLogDir, 'buster-telemetry-fallback.jsonl') : null,
    run_redis_exchanges_jsonl_path: runLogDir ? path.join(runLogDir, 'redis', 'redis-exchanges.jsonl') : null,
    run_redis_ops_jsonl_path: runLogDir ? path.join(runLogDir, 'redis', 'redis-ops.jsonl') : null,
    relative,
    authority,
  };
}

export function getPluginArtifactBundle(config = {}, { hookFamily = null, stageId = null, moduleId = null } = {}) {
  const paths = resolveArtifactLanePaths(config, { hookFamily, stageId, moduleId });
  const repoRoot = requireArtifactRepoRoot(config);
  const relativeLaneDir = toPortableRelativePath(repoRoot, paths.laneDir);
  const relativeIndexPath = toPortableRelativePath(repoRoot, paths.indexPath);
  return {
    run_id: paths.runId,
    lane_dir: paths.laneDir,
    lane_data_dir: paths.dataDir,
    lane_index_path: paths.indexPath,
    relative_lane_dir: relativeLaneDir,
    authority: projectPipelineArtifactEvidence({
      surface: PIPELINE_ARTIFACT_SURFACES.PLUGIN_ARTIFACT_INDEX,
      path: relativeIndexPath,
      artifact: { run_id: paths.runId },
      expectedRunId: paths.runId,
    }),
  };
}

export function buildLatestPointer(config = {}, {
  status = 'running',
  startedAt = null,
  completedAt = null,
  terminalStatus = null,
  terminalDecision = null,
  runFacts = null,
  usageAggregate = null,
  budgetStatus = null,
  costReportPath = null,
} = {}) {
  const artifacts = getPipelineArtifactBundle(config);
  return {
    run_id: artifacts.run_id,
    pipeline_run_id: artifacts.run_id,
    status,
    telemetry_stream_key: artifacts.telemetry_stream_key,
    authority: buildPipelineArtifactAuthorityPolicy({
      surface: PIPELINE_ARTIFACT_SURFACES.LATEST_JSON,
      artifact: { run_id: artifacts.run_id, status, terminal_status: terminalStatus },
      expectedRunId: artifacts.run_id,
    }),
    run_dir: artifacts.relative.run_dir,
    path: artifacts.relative.path,
    pipeline_jsonl: artifacts.relative.pipeline_jsonl,
    discord_jsonl: artifacts.relative.discord_jsonl,
    summary_json: artifacts.relative.summary_json,
    nova_injections_jsonl: artifacts.relative.nova_injections_jsonl,
    buster_telemetry_fallback_jsonl: artifacts.relative.buster_telemetry_fallback_jsonl,
    redis_exchanges_jsonl: artifacts.relative.redis_exchanges_jsonl,
    redis_ops_jsonl: artifacts.relative.redis_ops_jsonl,
    started_at: startedAt,
    completed_at: completedAt,
    terminal_status: terminalStatus,
    terminal_decision: terminalDecision,
    run_facts: runFacts,
    module_statuses: runFacts?.modules || null,
    modules: runFacts?.modules || null,
    gates: runFacts?.gates || null,
    tests: buildRunTestSummary(runFacts),
    cost: buildRunCostSummary({ usageAggregate, budgetStatus, costReportPath }),
  };
}

export function buildSummaryArtifactBundle(config = {}) {
  const artifacts = getPipelineArtifactBundle(config);
  return {
    run_dir: artifacts.relative.run_dir,
    path: artifacts.relative.path,
    pipeline_jsonl: artifacts.relative.pipeline_jsonl,
    discord_jsonl: artifacts.relative.discord_jsonl,
    summary_json: artifacts.relative.summary_json,
    nova_injections_jsonl: artifacts.relative.nova_injections_jsonl,
    buster_telemetry_fallback_jsonl: artifacts.relative.buster_telemetry_fallback_jsonl,
    redis_exchanges_jsonl: artifacts.relative.redis_exchanges_jsonl,
    redis_ops_jsonl: artifacts.relative.redis_ops_jsonl,
    pipeline_summary_json: artifacts.relative.pipeline_summary_json,
    latest_json: artifacts.relative.latest_json,
    authority: artifacts.authority,
  };
}

export function createPluginArtifactsApi(config = {}, {
  hookFamily = null,
  stageId = null,
  moduleId = null,
  invocation = {},
  now = isoNow,
} = {}) {
  const lanePaths = resolveArtifactLanePaths(config, { hookFamily, stageId, moduleId });

  const getEntries = () => readArtifactIndex(lanePaths.indexPath);

  return {
    async get(ref) {
      const lookupRef = assertNonEmptyString(ref, 'Artifact ref');
      const match = getEntries().find((entry) => selectTruthyValue(() => (selectTruthyValue(() => (entry.path === lookupRef), () => (entry.requestId === lookupRef))), () => (entry.abs_path === lookupRef)));
      return match ? normalizeArtifactRef(config, match) : null;
    },

    async find(query = {}) {
      const normalizedQuery = validateArtifactQuery(query);
      let matches = getEntries();
      if (normalizedQuery.type) matches = matches.filter((entry) => entry.type === normalizedQuery.type);
      if (normalizedQuery.role) matches = matches.filter((entry) => entry.role === normalizedQuery.role);
      if (normalizedQuery.label) matches = matches.filter((entry) => entry.label === normalizedQuery.label);
      if (normalizedQuery.limit) matches = matches.slice(0, normalizedQuery.limit);
      return matches.map((entry) => normalizeArtifactRef(config, entry));
    },

    async persist(request = {}) {
      const normalizedRequest = validatePersistArtifactRequest(request);
      ensureDir(lanePaths.dataDir);
      const requestId = createOpaqueId('artifact');
      const recordedAt = now();
      const extension = resolveArtifactExtension(normalizedRequest);
      const suggestionBase = normalizedRequest.suggestedPath
        ? path.basename(normalizedRequest.suggestedPath, path.extname(normalizedRequest.suggestedPath))
        : null;
      const fileName = [
        sanitizeSegment(normalizedRequest.type, 'Artifact type'),
        normalizedRequest.role ? sanitizeSegment(normalizedRequest.role, 'Artifact role') : null,
        normalizedRequest.label ? sanitizeSegment(normalizedRequest.label, 'Artifact label') : null,
        suggestionBase ? sanitizeSegment(suggestionBase, 'Artifact suggestedPath') : null,
        sanitizeSegment(requestId, 'Artifact request id'),
      ].filter(Boolean).join('__') + extension;
      const absPath = path.join(lanePaths.dataDir, fileName);
      writeArtifactPayload(absPath, normalizedRequest);

      const artifactRef = {
        type: normalizedRequest.type,
        path: toPortableRelativePath(requireArtifactRepoRoot(config), absPath),
        ...(normalizedRequest.label ? { label: normalizedRequest.label } : {}),
        ...(normalizedRequest.role ? { role: normalizedRequest.role } : {}),
      };

      const authority = projectPipelineArtifactEvidence({
        surface: PIPELINE_ARTIFACT_SURFACES.PLUGIN_ARTIFACT_INDEX,
        path: artifactRef.path,
        artifact: { run_id: lanePaths.runId },
        expectedRunId: lanePaths.runId,
      });

      const entry = {
        ...artifactRef,
        authority,
        abs_path: absPath,
        hookFamily,
        stageId,
        moduleId,
        requestId,
        recordedAt,
        format: normalizedRequest.format,
        metadata: selectTruthyValue(() => (normalizedRequest.metadata), () => (null)),
        invocation: {
          moduleId: selectDefinedValue(() => (invocation?.moduleId), () => (null)),
          gateId: selectDefinedValue(() => (invocation?.gateId), () => (null)),
          attempt: selectDefinedValue(() => (invocation?.attempt), () => (null)),
          dispatchId: selectDefinedValue(() => (invocation?.dispatchId), () => (null)),
        },
      };

      await appendArtifactIndexEntry(lanePaths.indexPath, entry);

      return {
        ...createEffectReceipt({ requestId, recordedAt }),
        artifact: normalizeArtifactRef(config, entry),
      };
    },
  };
}
