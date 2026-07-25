import fs from 'fs';
import path from 'path';
import {
  createEffectReceipt,
  createOpaqueId,
  getRunId,
  isoNow,
} from '../core/runtime.ts';
import { resolvePipelineRunLogDir } from '../core/paths.ts';
import {
  PIPELINE_ARTIFACT_SURFACES,
  projectPipelineArtifactEvidence,
} from './artifact-authority.ts';
import {
  artifactExtension,
  validateArtifactQuery,
  validatePersistArtifactRequest,
  writeArtifactPayload,
} from './artifact-plugin-request.ts';
const INDEX_LOCK_STALE_MS = 5 * 60 * 1000;

function assertNonEmptyString(value: any, label: string) {
  if (typeof value === 'string' && value.trim()) return value.trim();
  throw new Error(`${label} must be a non-empty string`);
}

function sanitizeSegment(value: any, label: string) {
  const normalized = String(value ?? '')
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '_');
  if (!normalized) {
    throw new Error(`${label} must produce a non-empty artifact path segment`);
  }
  if (/^\.+$/.test(normalized)) {
    throw new Error(`${label} must not be dot-only`);
  }
  return normalized;
}

function assertPathInside(candidatePath: string, rootPath: string, label: string) {
  const relative = path.relative(
    path.resolve(rootPath),
    path.resolve(candidatePath)
  );
  if (
    relative === ''
    || (relative && !relative.startsWith('..') && !path.isAbsolute(relative))
  ) {
    return candidatePath;
  }
  throw new Error(`${label} must resolve inside plugin artifact root`);
}

function ensureDir(directory: string) {
  fs.mkdirSync(directory, { recursive: true });
  return directory;
}

function portableRelativePath(basePath: string, targetPath: string) {
  return path.relative(basePath, targetPath).split(path.sep).join('/');
}

function resolveRunId(config: any) {
  for (const value of [config?._runId, config?.run_id, getRunId(config)]) {
    if (value !== undefined && value !== null) return value;
  }
  return null;
}

function resolveArtifactLanePaths(config: any, lane: any) {
  const runId = resolveRunId(config);
  const runLogDir = resolvePipelineRunLogDir(config, runId);
  if (!runLogDir) {
    throw new Error(
      'Plugin artifact lane requires a resolved pipeline run log directory'
    );
  }
  const root = path.join(runLogDir, 'plugin-artifacts');
  const laneDir = path.join(
    root,
    sanitizeSegment(
      assertNonEmptyString(lane.moduleId, 'Plugin artifact moduleId'),
      'Plugin artifact moduleId'
    ),
    sanitizeSegment(
      assertNonEmptyString(lane.hookFamily, 'Plugin artifact hookFamily'),
      'Plugin artifact hookFamily'
    ),
    sanitizeSegment(
      assertNonEmptyString(lane.stageId, 'Plugin artifact stageId'),
      'Plugin artifact stageId'
    )
  );
  return {
    runId,
    laneDir: assertPathInside(laneDir, root, 'Plugin artifact lane path'),
    dataDir: assertPathInside(
      path.join(laneDir, 'data'),
      root,
      'Plugin artifact data path'
    ),
    indexPath: assertPathInside(
      path.join(laneDir, 'index.json'),
      root,
      'Plugin artifact index path'
    ),
  };
}

function readArtifactIndex(indexPath: string) {
  if (!fs.existsSync(indexPath)) return [];
  return JSON.parse(fs.readFileSync(indexPath, 'utf8'));
}

function writeJson(filePath: string, value: any) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
}

function sameArtifact(left: any, right: any) {
  return Boolean(
    (left?.path && right?.path && left.path === right.path)
    || (
      left?.abs_path
      && right?.abs_path
      && left.abs_path === right.abs_path
    )
  );
}

async function wait(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function removeStaleLock(lockPath: string, error: any) {
  if (error?.code !== 'EEXIST') throw error;
  try {
    const stat = fs.statSync(lockPath);
    if (Date.now() - stat.mtimeMs > INDEX_LOCK_STALE_MS) {
      fs.rmSync(lockPath, { recursive: true, force: true });
      return true;
    }
  } catch (statError: any) {
    if (statError?.code !== 'ENOENT') throw statError;
    return true;
  }
  return false;
}

async function withArtifactIndexLock(indexPath: string, operation: any) {
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
        return await operation();
      } finally {
        fs.rmSync(lockPath, { recursive: true, force: true });
      }
    } catch (error: any) {
      if (removeStaleLock(lockPath, error)) continue;
      await wait(10);
    }
  }
  throw new Error(
    `Timed out waiting for plugin artifact index lock: ${indexPath}`
  );
}

async function appendArtifactIndexEntry(indexPath: string, entry: any) {
  return withArtifactIndexLock(indexPath, async () => {
    const entries = readArtifactIndex(indexPath);
    if (!entries.some((existing: any) => sameArtifact(existing, entry))) {
      entries.push(entry);
    }
    const temporaryPath = `${indexPath}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`;
    writeJson(temporaryPath, entries);
    fs.renameSync(temporaryPath, indexPath);
    return entries;
  });
}

function artifactRef(entry: any) {
  return {
    type: entry.type,
    path: entry.path,
    ...(entry.label ? { label: entry.label } : {}),
    ...(entry.role ? { role: entry.role } : {}),
    ...(entry.authority ? { authority: entry.authority } : {}),
  };
}

export function getPluginArtifactBundle(config: any = {}, lane: any = {}) {
  const paths = resolveArtifactLanePaths(config, lane);
  const repoRoot = assertNonEmptyString(config?.repo_root, 'config.repo_root');
  return {
    run_id: paths.runId,
    lane_dir: paths.laneDir,
    lane_data_dir: paths.dataDir,
    lane_index_path: paths.indexPath,
    relative_lane_dir: portableRelativePath(repoRoot, paths.laneDir),
    authority: projectPipelineArtifactEvidence({
      surface: PIPELINE_ARTIFACT_SURFACES.PLUGIN_ARTIFACT_INDEX,
      path: portableRelativePath(repoRoot, paths.indexPath),
      artifact: { run_id: paths.runId },
      expectedRunId: paths.runId,
    }),
  };
}

export function readPluginArtifact(config: any, lane: any, ref: any) {
  const paths = resolveArtifactLanePaths(config, lane);
  const lookup = assertNonEmptyString(ref, 'Artifact ref');
  const match = readArtifactIndex(paths.indexPath).find((entry: any) =>
    entry.path === lookup
    || entry.requestId === lookup
    || entry.abs_path === lookup
  );
  return match ? artifactRef(match) : null;
}

export function findPluginArtifacts(config: any, lane: any, query: any) {
  const paths = resolveArtifactLanePaths(config, lane);
  const normalized = validateArtifactQuery(query);
  let matches = readArtifactIndex(paths.indexPath);
  if (normalized.type) {
    matches = matches.filter((entry: any) => entry.type === normalized.type);
  }
  if (normalized.role) {
    matches = matches.filter((entry: any) => entry.role === normalized.role);
  }
  if (normalized.label) {
    matches = matches.filter((entry: any) => entry.label === normalized.label);
  }
  if (normalized.limit) matches = matches.slice(0, normalized.limit);
  return matches.map(artifactRef);
}

function artifactFileName(request: any, requestId: string) {
  const suggestion = request.suggestedPath
    ? path.basename(
      request.suggestedPath,
      path.extname(request.suggestedPath)
    )
    : null;
  return [
    sanitizeSegment(request.type, 'Artifact type'),
    request.role ? sanitizeSegment(request.role, 'Artifact role') : null,
    request.label ? sanitizeSegment(request.label, 'Artifact label') : null,
    suggestion ? sanitizeSegment(suggestion, 'Artifact suggestedPath') : null,
    sanitizeSegment(requestId, 'Artifact request id'),
  ].filter(Boolean).join('__') + artifactExtension(request);
}

export async function persistPluginArtifact(input: any) {
  const paths = resolveArtifactLanePaths(input.config, input.lane);
  const request = validatePersistArtifactRequest(input.request);
  ensureDir(paths.dataDir);
  const requestId = createOpaqueId('artifact');
  const recordedAt = input.now();
  const absolutePath = path.join(
    paths.dataDir,
    artifactFileName(request, requestId)
  );
  writeArtifactPayload(absolutePath, request);
  const ref = {
    type: request.type,
    path: portableRelativePath(
      assertNonEmptyString(input.config?.repo_root, 'config.repo_root'),
      absolutePath
    ),
    ...(request.label ? { label: request.label } : {}),
    ...(request.role ? { role: request.role } : {}),
  };
  const entry = buildArtifactIndexEntry({
    ...input,
    paths,
    request,
    ref,
    requestId,
    recordedAt,
    absolutePath,
  });
  await appendArtifactIndexEntry(paths.indexPath, entry);
  return {
    ...createEffectReceipt({ requestId, recordedAt }),
    artifact: artifactRef(entry),
  };
}

function buildArtifactIndexEntry(input: any) {
  return {
    ...input.ref,
    authority: projectPipelineArtifactEvidence({
      surface: PIPELINE_ARTIFACT_SURFACES.PLUGIN_ARTIFACT_INDEX,
      path: input.ref.path,
      artifact: { run_id: input.paths.runId },
      expectedRunId: input.paths.runId,
    }),
    abs_path: input.absolutePath,
    hookFamily: input.lane.hookFamily,
    stageId: input.lane.stageId,
    moduleId: input.lane.moduleId,
    requestId: input.requestId,
    recordedAt: input.recordedAt,
    format: input.request.format,
    metadata: input.request.metadata ?? null,
    invocation: {
      moduleId: input.invocation?.moduleId ?? null,
      gateId: input.invocation?.gateId ?? null,
      attempt: input.invocation?.attempt ?? null,
      dispatchId: input.invocation?.dispatchId ?? null,
    },
  };
}
