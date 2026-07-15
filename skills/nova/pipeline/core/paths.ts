import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
// core/paths.ts — Path helpers for swarm module/gate layout

// @ts-expect-error Node built-in ambient types are not installed for this migration island.
import fs from 'fs';
// @ts-expect-error Node built-in ambient types are not installed for this migration island.
import path from 'path';
import { getRunId } from './runtime.ts';

const ALLOWED_PATH_PREFIXES = ['/app/', '/opt/', '/home/'];
const UNSAFE_PATH_SEGMENT_NAMES = new Set(['.', '..']);

// Single canonical safe-path validator for the refactored pipeline.
export function validateSafePath(filePath: any, label: any) {
  if (selectTruthyValue(() => (!filePath), () => (typeof filePath !== 'string'))) {
    throw new Error(`${label}: path is empty or not a string`);
  }
  const normalized = path.resolve(filePath);
  const allowed = ALLOWED_PATH_PREFIXES.some((prefix) => {
    const resolvedPrefix = path.resolve(prefix);
    const prefixWithSep = resolvedPrefix.endsWith(path.sep) ? resolvedPrefix : `${resolvedPrefix}${path.sep}`;
    return selectTruthyValue(() => (normalized === resolvedPrefix), () => (normalized.startsWith(prefixWithSep)));
  });
  if (!allowed) {
    throw new Error(
      `${label}: path '${normalized}' not in allowed prefixes [${ALLOWED_PATH_PREFIXES.join(', ')}]. ` +
      `Update ALLOWED_PATH_PREFIXES in core/paths.ts if this is intentional.`
    );
  }
  return normalized;
}

export function swarmRoot(config: any)         { return config.paths.swarm_dir; }
export function projectSrcPath(config: any) {
  const sourcePath = config?.paths?.project_src_dir;
  if (selectTruthyValue(() => (typeof sourcePath !== 'string'), () => (!sourcePath.trim()))) {
    throw new Error('config.paths.project_src_dir: required source root path');
  }
  return sourcePath;
}
export function relPath(config: any, absPath: any)  { return path.relative(config.repo_root, absPath); }
export function portableRelPath(config: any, absPath: any) { return relPath(config, absPath).split(path.sep).join('/'); }

function firstDefined(...values: any[]) {
  for (const value of values) {
    if (value !== undefined && value !== null) return value;
  }
  return null;
}

function requiredRepoRoot(config: any, label: any = 'repository root') {
  if (selectTruthyValue(() => (typeof config?.repo_root !== 'string'), () => (!config.repo_root.trim()))) {
    throw new Error(`${label}: required non-empty string`);
  }
  return config.repo_root;
}

function unsafePathSegmentSyntax(segment: string) {
  if (/[\0/\\]/u.test(segment)) return true;
  if (path.isAbsolute(segment)) return true;
  return UNSAFE_PATH_SEGMENT_NAMES.has(segment);
}

function portableArtifactRefPath(config: any, absPath: any) {
  const basePath = requiredRepoRoot(config);
  return path.relative(basePath, absPath).split(path.sep).join('/');
}

function rootedPrefix(root: any) {
  const resolvedRoot = path.resolve(root);
  return resolvedRoot.endsWith(path.sep) ? resolvedRoot : `${resolvedRoot}${path.sep}`;
}

function isPathInside(candidate: any, root: any) {
  const resolvedCandidate = path.resolve(candidate);
  const resolvedRoot = path.resolve(root);
  return selectTruthyValue(() => (resolvedCandidate === resolvedRoot), () => (resolvedCandidate.startsWith(rootedPrefix(resolvedRoot))));
}

function assertPathInside(candidate: any, root: any, label: any, scopeDescription: any = 'swarm root') {
  const resolvedCandidate = path.resolve(candidate);
  const resolvedRoot = path.resolve(root);
  if (isPathInside(resolvedCandidate, resolvedRoot)) return resolvedCandidate;
  throw new Error(`${label}: path escapes ${scopeDescription}: ${candidate}`);
}

function assertRelativePathInput(inputPath: any, label: any, scopeDescription: any) {
  if (selectTruthyValue(() => (typeof inputPath !== 'string'), () => (!inputPath.trim()))) {
    throw new Error(`${label}: path is empty or not a string`);
  }
  if (inputPath.includes('\0')) throw new Error(`${label}: path contains a null byte`);
  if (path.isAbsolute(inputPath)) throw new Error(`${label}: path must be relative to ${scopeDescription}`);
  const segments = inputPath.split(/[\\/]+/).filter(Boolean);
  if (segments.includes('..')) throw new Error(`${label}: path must not contain parent traversal`);
  return inputPath;
}

export function assertSafePathSegment(segment: any, label: any, opts: any = {}) {
  if (segment === '' && opts.allowEmpty === true) return segment;
  if (selectTruthyValue(() => (typeof segment !== 'string'), () => (!segment.trim()))) {
    throw new Error(`${label}: identifier is empty or not a string`);
  }
  if (unsafePathSegmentSyntax(segment)) {
    throw new Error(`${label}: identifier must be a single safe path segment`);
  }
  return segment;
}

export function modulePath(config: any, dir: any) {
  const moduleDir = assertRelativePathInput(dir, 'module.dir', 'modules root');
  return assertPathInside(path.resolve(config.paths.modules_dir, moduleDir), config.paths.modules_dir, 'module.dir', 'modules root');
}

export function modulePathRef(config: any, dir: any) {
  return portableArtifactRefPath(config, modulePath(config, dir));
}

export function moduleBusterMdPath(config: any, dir: any) {
  return path.join(modulePath(config, dir), 'BUSTER.md');
}

export function moduleBusterMdPathRef(config: any, dir: any) {
  return portableArtifactRefPath(config, moduleBusterMdPath(config, dir));
}

export function moduleBusterOutputPath(config: any, dir: any) {
  const moduleDir = assertRelativePathInput(dir, 'module.dir', 'modules root');
  return assertPathInside(path.resolve(config.paths.modules_dir, moduleDir, 'buster-output.json'), config.paths.modules_dir, 'module buster output_file', 'modules root');
}

export function moduleBusterOutputPathRef(config: any, dir: any) {
  return portableArtifactRefPath(config, moduleBusterOutputPath(config, dir));
}

export function moduleBusterTestWorkspacePath(config: any, dir: any, attempt: any) {
  const moduleDir = assertRelativePathInput(dir, 'module.dir', 'modules root');
  return assertPathInside(path.resolve(config.paths.modules_dir, moduleDir, 'tests', `attempt-${attempt}`), config.paths.modules_dir, 'module buster test workspace', 'modules root');
}

export function moduleBusterTestWorkspacePathRef(config: any, dir: any, attempt: any) {
  return portableArtifactRefPath(config, moduleBusterTestWorkspacePath(config, dir, attempt));
}

function assertArtifactFileName(fileName: any, label: any) {
  if (selectTruthyValue(() => (typeof fileName !== 'string'), () => (!fileName.trim()))) {
    throw new Error(`${label}: file name is empty or not a string`);
  }
  if (selectTruthyValue(() => (selectTruthyValue(() => (fileName.includes('\0')), () => (path.isAbsolute(fileName)))), () => (path.basename(fileName) !== fileName))) {
    throw new Error(`${label}: file name must be a single relative path segment`);
  }
  return fileName;
}

export function resolveSwarmArtifactPath(config: any, artifactPath: any, label: any = 'swarm artifact path') {
  assertRelativePathInput(artifactPath, label, 'swarm root');
  return assertPathInside(path.resolve(swarmRoot(config), artifactPath), swarmRoot(config), label);
}

export function swarmArtifactRefPath(config: any, artifactPath: any, label: any = 'swarm artifact path') {
  return portableArtifactRefPath(config, resolveSwarmArtifactPath(config, artifactPath, label));
}

export function swarmArtifactTopLevelRef(config: any, artifactPath: any, label: any = 'swarm artifact path') {
  const ref = path.relative(swarmRoot(config), resolveSwarmArtifactPath(config, artifactPath, label)).split(path.sep).join('/');
  const [topLevel] = ref.split('/').filter(Boolean);
  if (!topLevel) throw new Error(`${label}: path must include a top-level artifact directory`);
  return topLevel;
}

export function resolveRepoRelativePath(config: any, repoPath: any, label: any = 'repo path') {
  if (selectTruthyValue(() => (!config?.repo_root), () => (typeof config.repo_root !== 'string'))) {
    throw new Error(`${label}: repository root is unavailable`);
  }
  assertRelativePathInput(repoPath, label, 'repository root');
  return assertPathInside(path.resolve(config.repo_root, repoPath), config.repo_root, label, 'repository root');
}

export function resolveRepoRealPath(config: any, repoPath: any, label: any = 'repo path') {
  const candidatePath = resolveRepoRelativePath(config, repoPath, label);
  const repoRealPath = fs.realpathSync(config.repo_root);
  const realPath = fs.realpathSync(candidatePath);
  if (!isPathInside(realPath, repoRealPath)) {
    throw new Error(`${label}: path resolves outside repository root: ${repoPath}`);
  }
  return realPath;
}

export function gateOutputPath(config: any, gate: any) {
  if (!gate?.output_file) return null;
  return resolveSwarmArtifactPath(config, gate.output_file, 'gate.output_file');
}

export function gateInstructionsPath(config: any, gate: any) {
  if (!gate?.instructions_file) return null;
  return resolveSwarmArtifactPath(config, gate.instructions_file, 'gate.instructions_file');
}

export function gateOutputPathRef(config: any, gate: any) {
  return gate?.output_file ? portableArtifactRefPath(config, gateOutputPath(config, gate)) : null;
}

export function gateInstructionsPathRef(config: any, gate: any) {
  return gate?.instructions_file ? portableArtifactRefPath(config, gateInstructionsPath(config, gate)) : null;
}

export function gateWorkDirPathRef(config: any) {
  return portableArtifactRefPath(config, swarmRoot(config));
}

export function reviewGateOutputDirRef(config: any, gate: any) {
  return gate?.review_output_dir ? swarmArtifactRefPath(config, gate.review_output_dir, 'gate.review_output_dir') : null;
}

export function gateInstructionsTopLevelRef(config: any, gate: any) {
  return gate?.instructions_file ? swarmArtifactTopLevelRef(config, gate.instructions_file, 'gate.instructions_file') : null;
}

export function reviewGateOutputPath(config: any, gate: any, reviewerLabel: any) {
  const label = assertArtifactFileName(`${reviewerLabel}-${gate.review_name}.json`, 'review gate output file');
  if (!gate?.review_output_dir) {
    throw new Error('review gate output path requires gate.review_output_dir');
  }
  return resolveSwarmArtifactPath(
    config,
    path.join(gate.review_output_dir, label),
    'review gate output path'
  );
}

export function approvalGateArtifactPaths(config: any, gateId: any) {
  const dir = gateLogDir(config, gateId);
  if (!dir) return null;
  return {
    dir,
    requestJson: path.join(dir, 'approval-request.json'),
    requestMarkdown: path.join(dir, 'approval-request.md'),
    decisionJson: path.join(dir, 'approval-decision.json'),
    transitionsJsonl: path.join(dir, 'approval-transitions.jsonl'),
  };
}

export function approvalGateArtifactRefPaths(config: any, gateId: any) {
  const safeGateId = assertSafePathSegment(gateId, 'gate id');
  if (!config?.paths?.swarm_dir) {
    return {
      statePath: `.swarm/${safeGateId}-gate-status.json`,
      requestJson: `.swarm/logs/gates/${safeGateId}/approval-request.json`,
      requestMarkdown: `.swarm/logs/gates/${safeGateId}/approval-request.md`,
      decisionJson: `.swarm/logs/gates/${safeGateId}/approval-decision.json`,
      transitionsJsonl: `.swarm/logs/gates/${safeGateId}/approval-transitions.jsonl`,
    };
  }
  const statePath = portableArtifactRefPath(config, gateStatusPath(config, safeGateId));
  if (!projectLogDir(config)) {
    return {
      statePath,
      requestJson: `.swarm/logs/gates/${safeGateId}/approval-request.json`,
      requestMarkdown: `.swarm/logs/gates/${safeGateId}/approval-request.md`,
      decisionJson: `.swarm/logs/gates/${safeGateId}/approval-decision.json`,
      transitionsJsonl: `.swarm/logs/gates/${safeGateId}/approval-transitions.jsonl`,
    };
  }
  const artifacts = approvalGateArtifactPaths(config, safeGateId);
  if (!artifacts) return null;
  return {
    statePath,
    requestJson: portableArtifactRefPath(config, artifacts.requestJson),
    requestMarkdown: portableArtifactRefPath(config, artifacts.requestMarkdown),
    decisionJson: portableArtifactRefPath(config, artifacts.decisionJson),
    transitionsJsonl: portableArtifactRefPath(config, artifacts.transitionsJsonl),
  };
}

export function runRedisLogDir(config: any) {
  const runLogDir = resolvePipelineRunLogDir(config);
  return runLogDir ? path.join(runLogDir, 'redis') : null;
}

export function redisLogArtifactPath(config: any, fileName: any = 'redis-exchanges.jsonl', scope: any = 'project') {
  const safeFileName = assertArtifactFileName(fileName, 'Redis artifact file name');
  const dir = scope === 'project' ? redisLogDir(config) : scope === 'run' ? runRedisLogDir(config) : null;
  if (!dir && scope !== 'project' && scope !== 'run') throw new Error(`Redis artifact scope must be 'project' or 'run'`);
  return dir ? path.join(dir, safeFileName) : null;
}

export function redisLogArtifactTargets(config: any, fileName: any = 'redis-exchanges.jsonl') {
  return [
    redisLogArtifactPath(config, fileName, 'project'),
    redisLogArtifactPath(config, fileName, 'run'),
  ].filter(Boolean);
}

export function completionStreamKey(config: any) {
  return `swarm:pipeline:${config.project}:completions`;
}

function approvalSignalStreamIdentity(config: any, state: any = {}) {
  return {
    project: firstDefined(state?.project, config?.project),
    runId: firstDefined(state?.run_id, config?.run_id),
  };
}

function encodeRedisKeyPart(value: any, label: any) {
  const normalized = String(value == null ? '' : value).trim();
  if (!normalized) throw new Error(`${label}: required for Redis stream key`);
  return encodeURIComponent(normalized);
}

export function approvalSignalStreamKey(config: any, state: any = {}) {
  const { project, runId } = approvalSignalStreamIdentity(config, state);
  return `swarm:pipeline:${encodeRedisKeyPart(project, 'project')}:${encodeRedisKeyPart(runId, 'run_id')}:approval-signals`;
}

export function gateStatusPath(config: any, gateId: any) {
  const safeGateId = assertSafePathSegment(gateId, 'gate id');
  return assertPathInside(path.join(swarmRoot(config), `${safeGateId}-gate-status.json`), swarmRoot(config), 'gate status path');
}

export function moduleLogDir(config: any, dir: any) {
  return projectLogSubdir(config, 'modules', dir);
}

export function moduleLintLogDir(config: any, dir: any) {
  return projectLogSubdir(config, 'modules', dir, 'lint');
}

export function gateLogDir(config: any, gateId: any) {
  return gateId ? projectLogSubdir(config, 'gates', gateId) : null;
}
export function gateActiveSessionPath(config: any, gateId: any) {
  const dir = gateLogDir(config, gateId); return dir ? path.join(dir, 'active-session.json') : null;
}

export function gateLintLogDir(config: any, gateId: any) {
  return projectLogSubdir(config, 'gates', gateId, 'lint');
}

export function costLogDir(config: any) {
  return projectLogSubdir(config, 'cost');
}

export function redisLogDir(config: any) {
  return projectLogSubdir(config, 'redis');
}

function projectLogSubdir(config: any, ...segments: any[]) {
  const logDir = projectLogDir(config);
  if (!logDir) return null;
  const safeSegments = segments.map((segment, index) => assertSafePathSegment(segment, `project log segment ${index + 1}`));
  return assertPathInside(path.join(logDir, ...safeSegments), logDir, 'project log path', 'project log root');
}

export function projectLogDir(config: any) {
  return config?.paths?.swarm_dir ? path.join(config.paths.swarm_dir, 'logs') : config?.paths?.modules_dir ? path.join(path.dirname(config.paths.modules_dir), 'logs') : null;
}

export function pipelineLogDir(config: any) {
  return projectLogSubdir(config, 'pipeline');
}

export function ensureProjectLogDir(config: any) {
  const logDir = projectLogDir(config); if (logDir) fs.mkdirSync(logDir, { recursive: true }); return logDir;
}

export function resolvePipelineRunLogDir(config: any, runId: any = getRunId(config)) {
  const logDir = pipelineLogDir(config);
  if (!logDir) throw new Error('pipeline log dir: required for pipeline run log path');
  if (!runId) throw new Error('pipeline run id: required for pipeline run log path');
  const safeRunId = assertSafePathSegment(runId, 'pipeline run id');
  return assertPathInside(path.join(logDir, 'runs', safeRunId), logDir, 'pipeline run log path', 'pipeline log root');
}

export function ensurePipelineRunLogDir(config: any) {
  const runLogDir = resolvePipelineRunLogDir(config); if (runLogDir) fs.mkdirSync(runLogDir, { recursive: true }); return runLogDir;
}

export function archValidatorLogDir(config: any) {
  return projectLogSubdir(config, 'architecture-validator');
}

export function pipelineRunLogDir(config: any) {
  const runId = getRunId(config);
  const logDir = pipelineLogDir(config);
  if (selectTruthyValue(() => (!logDir), () => (!runId))) return null;
  const safeRunId = assertSafePathSegment(runId, 'pipeline run id');
  return assertPathInside(path.join(logDir, 'runs', safeRunId), logDir, 'pipeline run log path', 'pipeline log root');
}
