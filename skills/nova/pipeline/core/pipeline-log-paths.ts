import fs from 'fs';
import path from 'path';
import { getRunId } from './runtime.ts';
import {
  assertPathInside,
  assertSafePathSegment,
} from './path-safety.ts';

export function projectLogDir(config: any) {
  if (config?.paths?.swarm_dir) return path.join(config.paths.swarm_dir, 'logs');
  if (config?.paths?.modules_dir) {
    return path.join(path.dirname(config.paths.modules_dir), 'logs');
  }
  return null;
}

export function projectLogSubdir(config: any, ...segments: any[]) {
  const logDir = projectLogDir(config);
  if (!logDir) return null;
  const safeSegments = segments.map((segment: any, index: number) =>
    assertSafePathSegment(segment, `project log segment ${index + 1}`));
  return assertPathInside(
    path.join(logDir, ...safeSegments),
    logDir,
    'project log path',
    'project log root',
  );
}

export function pipelineLogDir(config: any) {
  return projectLogSubdir(config, 'pipeline');
}

export function ensureProjectLogDir(config: any) {
  const logDir = projectLogDir(config);
  if (logDir) fs.mkdirSync(logDir, { recursive: true });
  return logDir;
}

export function resolvePipelineRunLogDir(
  config: any,
  runId: any = getRunId(config),
) {
  const logDir = pipelineLogDir(config);
  if (!logDir) throw new Error('pipeline log dir: required for pipeline run log path');
  if (!runId) throw new Error('pipeline run id: required for pipeline run log path');
  const safeRunId = assertSafePathSegment(runId, 'pipeline run id');
  return assertPathInside(
    path.join(logDir, 'runs', safeRunId),
    logDir,
    'pipeline run log path',
    'pipeline log root',
  );
}

export function ensurePipelineRunLogDir(config: any) {
  const runLogDir = resolvePipelineRunLogDir(config);
  if (runLogDir) fs.mkdirSync(runLogDir, { recursive: true });
  return runLogDir;
}

export function archValidatorLogDir(config: any) {
  return projectLogSubdir(config, 'architecture-validator');
}
