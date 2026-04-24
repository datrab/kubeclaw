import fs from 'fs';
import path from 'path';
import { getRunId, createEffectReceipt, createOpaqueId, isoNow } from '../core/runtime.js';
import { validateSafePath } from '../core/paths.js';
import { isPlainObject } from './validation.js';
import { getTelemetryStreamKey } from '../../../common/pipeline/telemetry.js';

const ARTIFACT_INLINE_FORMATS = new Set(['json', 'text', 'markdown']);
const ARTIFACT_PERSIST_FORMATS = new Set([...ARTIFACT_INLINE_FORMATS, 'file_copy']);

function getResolvedRunLogDir(config, runId) {
  if (config?._runLogDir) return config._runLogDir;
  if (!config?._logDir || !runId) return null;
  return path.join(config._logDir, 'pipeline', 'runs', runId);
}

function sanitizeSegment(value, fallback = 'unknown') {
  const normalized = String(value || fallback).trim().replace(/[^a-zA-Z0-9._-]+/g, '_');
  return normalized || fallback;
}

function toPortableRelativePath(basePath, targetPath) {
  if (!basePath) return targetPath;
  return path.relative(basePath, targetPath).split(path.sep).join('/');
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
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value.trim();
}

function assertOptionalObject(value, label) {
  if (value === undefined) return undefined;
  if (!isPlainObject(value)) {
    throw new Error(`${label} must be a plain object when provided`);
  }
  return { ...value };
}

function resolveArtifactExtension(request) {
  if (request.format === 'json') return '.json';
  if (request.format === 'markdown') return '.md';
  if (request.format === 'text') return '.txt';
  if (request.format === 'file_copy') {
    const sourceExt = path.extname(request.sourcePath || '').trim();
    return sourceExt || '.bin';
  }
  return '.dat';
}

function resolveArtifactLanePaths(config = {}, { hookFamily = 'unknown', stageId = 'unknown', moduleId = 'unknown' } = {}) {
  const runId = config?._runId || config?.run_id || getRunId(config) || null;
  const runLogDir = getResolvedRunLogDir(config, runId);
  if (!runLogDir) {
    throw new Error('Plugin artifact lane requires a resolved run log directory on config._runLogDir or config._logDir');
  }

  const laneDir = path.join(
    runLogDir,
    'plugin-artifacts',
    sanitizeSegment(moduleId),
    sanitizeSegment(hookFamily),
    sanitizeSegment(stageId),
  );

  return {
    runId,
    runLogDir,
    laneDir,
    dataDir: path.join(laneDir, 'data'),
    indexPath: path.join(laneDir, 'index.json'),
  };
}

function readArtifactIndex(indexPath) {
  return readJsonIfPresent(indexPath, []);
}

function writeArtifactIndex(indexPath, entries) {
  writeJson(indexPath, entries);
}

function normalizeArtifactRef(config, entry) {
  return {
    type: entry.type,
    path: entry.path,
    ...(entry.label ? { label: entry.label } : {}),
    ...(entry.role ? { role: entry.role } : {}),
  };
}

function validateArtifactQuery(query = {}) {
  if (!isPlainObject(query)) throw new Error('Artifact query must be a plain object');
  const limit = query.limit == null ? null : Number(query.limit);
  if (limit != null && (!Number.isInteger(limit) || limit < 1)) {
    throw new Error('Artifact query limit must be a positive integer when provided');
  }
  return {
    ...(query.type ? { type: assertNonEmptyString(query.type, 'Artifact query type') } : {}),
    ...(query.role ? { role: assertNonEmptyString(query.role, 'Artifact query role') } : {}),
    ...(query.label ? { label: assertNonEmptyString(query.label, 'Artifact query label') } : {}),
    ...(limit != null ? { limit } : {}),
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
      if (!(typeof request.content === 'string' || isPlainObject(request.content) || Array.isArray(request.content))) {
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

  if (request.format === 'text' || request.format === 'markdown') {
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
  const runId = config?._runId || config?.run_id || getRunId(config) || null;
  const pipelineDir = config?._logDir ? path.join(config._logDir, 'pipeline') : null;
  const runLogDir = getResolvedRunLogDir(config, runId);
  const runDir = runId ? `runs/${runId}` : null;

  return {
    run_id: runId,
    telemetry_stream_key: runId ? getTelemetryStreamKey(config?.project || '', runId) : null,
    pipeline_dir: pipelineDir,
    run_log_dir: runLogDir,
    latest_json_path: pipelineDir ? path.join(pipelineDir, 'latest.json') : null,
    pipeline_summary_path: pipelineDir ? path.join(pipelineDir, 'summary.json') : null,
    global_nova_injections_jsonl_path: pipelineDir ? path.join(pipelineDir, 'nova-injections.jsonl') : null,
    run_summary_path: runLogDir ? path.join(runLogDir, 'summary.json') : null,
    run_nova_injections_jsonl_path: runLogDir ? path.join(runLogDir, 'nova-injections.jsonl') : null,
    relative: {
      run_dir: runDir,
      path: runDir,
      pipeline_jsonl: runDir ? `${runDir}/pipeline.jsonl` : null,
      discord_jsonl: runDir ? `${runDir}/discord.jsonl` : null,
      summary_json: runDir ? `${runDir}/summary.json` : null,
      nova_injections_jsonl: runDir ? `${runDir}/nova-injections.jsonl` : null,
      pipeline_summary_json: 'summary.json',
      latest_json: 'latest.json',
    },
  };
}

export function getPluginArtifactBundle(config = {}, { hookFamily = null, stageId = null, moduleId = null } = {}) {
  const paths = resolveArtifactLanePaths(config, { hookFamily, stageId, moduleId });
  return {
    run_id: paths.runId,
    lane_dir: paths.laneDir,
    lane_data_dir: paths.dataDir,
    lane_index_path: paths.indexPath,
    relative_lane_dir: toPortableRelativePath(config?.repo_root || paths.runLogDir, paths.laneDir),
  };
}

export function buildLatestPointer(config = {}, {
  status = 'running',
  startedAt = null,
  completedAt = null,
  exitCode = null,
} = {}) {
  const artifacts = getPipelineArtifactBundle(config);
  return {
    run_id: artifacts.run_id,
    status,
    telemetry_stream_key: artifacts.telemetry_stream_key,
    run_dir: artifacts.relative.run_dir,
    path: artifacts.relative.path,
    pipeline_jsonl: artifacts.relative.pipeline_jsonl,
    discord_jsonl: artifacts.relative.discord_jsonl,
    summary_json: artifacts.relative.summary_json,
    nova_injections_jsonl: artifacts.relative.nova_injections_jsonl,
    started_at: startedAt,
    completed_at: completedAt,
    exit_code: exitCode,
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
    pipeline_summary_json: artifacts.relative.pipeline_summary_json,
    latest_json: artifacts.relative.latest_json,
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
  const saveEntries = (entries) => writeArtifactIndex(lanePaths.indexPath, entries);

  return {
    async get(ref) {
      const lookupRef = assertNonEmptyString(ref, 'Artifact ref');
      const match = getEntries().find((entry) => entry.path === lookupRef || entry.requestId === lookupRef || entry.abs_path === lookupRef);
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
        sanitizeSegment(normalizedRequest.type),
        normalizedRequest.role ? sanitizeSegment(normalizedRequest.role) : null,
        normalizedRequest.label ? sanitizeSegment(normalizedRequest.label) : null,
        suggestionBase ? sanitizeSegment(suggestionBase) : null,
        sanitizeSegment(requestId),
      ].filter(Boolean).join('__') + extension;
      const absPath = path.join(lanePaths.dataDir, fileName);
      writeArtifactPayload(absPath, normalizedRequest);

      const artifactRef = {
        type: normalizedRequest.type,
        path: toPortableRelativePath(config?.repo_root || lanePaths.runLogDir, absPath),
        ...(normalizedRequest.label ? { label: normalizedRequest.label } : {}),
        ...(normalizedRequest.role ? { role: normalizedRequest.role } : {}),
      };

      const entry = {
        ...artifactRef,
        abs_path: absPath,
        hookFamily,
        stageId,
        moduleId,
        requestId,
        recordedAt,
        format: normalizedRequest.format,
        metadata: normalizedRequest.metadata || null,
        invocation: {
          moduleId: invocation?.moduleId ?? null,
          gateId: invocation?.gateId ?? null,
          attempt: invocation?.attempt ?? null,
          dispatchId: invocation?.dispatchId ?? null,
        },
      };

      const entries = getEntries();
      entries.push(entry);
      saveEntries(entries);

      return {
        ...createEffectReceipt({ requestId, recordedAt }),
        artifact: normalizeArtifactRef(config, entry),
      };
    },
  };
}
