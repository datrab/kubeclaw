import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
// core/paths.ts — Path helpers for swarm module/gate layout

import fs from 'fs';
import path from 'path';
import {
  projectLogDir,
  projectLogSubdir,
  resolvePipelineRunLogDir,
} from './pipeline-log-paths.ts';
import {
  assertPathInside,
  assertRelativePathInput,
  assertSafePathSegment,
  isPathInside,
  portableArtifactRefPath,
} from './path-safety.ts';

export { assertSafePathSegment, validateSafePath } from './path-safety.ts';
export {
  archValidatorLogDir,
  ensurePipelineRunLogDir,
  ensureProjectLogDir,
  pipelineLogDir,
  projectLogDir,
  resolvePipelineRunLogDir,
} from './pipeline-log-paths.ts';

export function swarmRoot(config: any)         { return config.paths.swarm_dir; }
export function projectSrcPath(config: any) {
  const sourcePath = config?.paths?.project_src_dir;
  if (selectTruthyValue(() => (typeof sourcePath !== 'string'), () => (!sourcePath.trim()))) {
    throw new Error('config.paths.project_src_dir: required source root path');
  }
  return sourcePath;
}
export function relPath(config: any, absPath: any)  { return path.relative(config.repo_root, absPath); }
function portableRelPath(config: any, absPath: any) { return relPath(config, absPath).split(path.sep).join('/'); }

function firstDefined(...values: any[]) {
  for (const value of values) {
    if (value !== undefined && value !== null) return value;
  }
  return null;
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

function moduleBusterTestWorkspacePath(config: any, dir: any, attempt: any) {
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

function swarmArtifactRefPath(config: any, artifactPath: any, label: any = 'swarm artifact path') {
  return portableArtifactRefPath(config, resolveSwarmArtifactPath(config, artifactPath, label));
}

function swarmArtifactTopLevelRef(config: any, artifactPath: any, label: any = 'swarm artifact path') {
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

function runRedisLogDir(config: any) {
  const runLogDir = resolvePipelineRunLogDir(config);
  return runLogDir ? path.join(runLogDir, 'redis') : null;
}

function redisLogArtifactPath(config: any, fileName: any = 'redis-exchanges.jsonl', scope: any = 'project') {
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

function redisLogDir(config: any) {
  return projectLogSubdir(config, 'redis');
}
