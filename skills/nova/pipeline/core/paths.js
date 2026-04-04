// core/paths.js — Path helpers for swarm module/gate layout

import path from 'path';
import { getRunId } from './runtime.js';

const ALLOWED_PATH_PREFIXES = ['/app/', '/opt/', '/home/'];

// Single canonical safe-path validator for the refactored pipeline.
export function validateSafePath(filePath, label) {
  if (!filePath || typeof filePath !== 'string') {
    throw new Error(`${label}: path is empty or not a string`);
  }
  const normalized = path.resolve(filePath);
  const allowed = ALLOWED_PATH_PREFIXES.some(prefix => normalized.startsWith(prefix));
  if (!allowed) {
    throw new Error(
      `${label}: path '${normalized}' not in allowed prefixes [${ALLOWED_PATH_PREFIXES.join(', ')}]. ` +
      `Update ALLOWED_PATH_PREFIXES in core/paths.js if this is intentional.`
    );
  }
  return normalized;
}

export function modulePath(config, dir)   { return path.join(config.paths.modules_dir, dir); }
export function statusPath(config, dir)   { return path.join(modulePath(config, dir), 'status.json'); }
export function swarmRoot(config)         { return config.paths.swarm_dir; }
export function projectSrcPath(config)    { return path.dirname(config.paths.swarm_dir); }
export function relPath(config, absPath)  { return path.relative(config.repo_root, absPath); }

export function completionStreamKey(config) {
  return `swarm:pipeline:${config.project}:completions`;
}

export function gateStatusPath(config, gateId) {
  return path.join(swarmRoot(config), `${gateId}-gate-status.json`);
}

export function moduleLogDir(config, dir) {
  return path.join(config._logDir, 'modules', dir);
}

export function moduleTestLogDir(config, dir) {
  return path.join(config._logDir, 'modules', dir, 'tests');
}

export function moduleLintLogDir(config, dir) {
  return path.join(config._logDir, 'modules', dir, 'lint');
}

export function gateLogDir(config, gateId) {
  return path.join(config._logDir, 'gates', gateId);
}

export function gateTestLogDir(config, gateId) {
  return path.join(config._logDir, 'gates', gateId, 'tests');
}

export function gateLintLogDir(config, gateId) {
  return path.join(config._logDir, 'gates', gateId, 'lint');
}

export function costLogDir(config) {
  return path.join(config._logDir, 'cost');
}

export function redisLogDir(config) {
  return path.join(config._logDir, 'redis');
}

export function archValidatorLogDir(config) {
  return path.join(config._logDir, 'architecture-validator');
}

// Returns the run-scoped log directory: .swarm/logs/pipeline/runs/<run_id>/
// All pipeline-level runtime artifacts go here to prevent shared-file conflicts.
export function pipelineRunLogDir(config) {
  const runId = getRunId(config);
  return path.join(config._logDir, 'pipeline', 'runs', runId);
}
