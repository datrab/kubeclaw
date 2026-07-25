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
export {
  agentEndedReadBlockMs, agentEndedSettleMs, buildForgeAgentEndedIdentity,
  createAgentEndedTelemetryReader, matchesForgeAgentEndedTelemetry, shouldSettleAgentEnded,
} from './agent-observability-forge-reader.ts';

export const AGENT_OBSERVABILITY_FORGE_COMPLETION_SOURCE = 'agent_observability_agent_ended';
export const AGENT_OBSERVABILITY_FORGE_READY_REASON = 'agent_ended_meaningful_diff';
export const AGENT_OBSERVABILITY_FORGE_NO_WORK_REASON = 'agent_ended_no_meaningful_diff';
export const AGENT_OBSERVABILITY_FORGE_FALLBACK_READY_REASON = 'session_ended_meaningful_diff';
export const AGENT_OBSERVABILITY_FORGE_FALLBACK_NO_WORK_REASON = 'session_ended_no_meaningful_diff';
const INJECTED_DIFF_EVIDENCE_SOURCE = 'injected';

const RUNTIME_PATH_PREFIXES = [
  '.swarm/',
  'logs/',
];

function stringValue(value: any) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function rawStringValue(value: any) {
  if (selectTruthyValue(() => (value === undefined), () => (value === null))) return '';
  return String(value);
}

function arrayValue(value: any) {
  return Array.isArray(value) ? value : [];
}

function objectRecord(value: any) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function firstDefined(...values: any) {
  for (const value of values) {
    if (value !== undefined && value !== null) return value;
  }
  return null;
}

function forgeCompletionSource(opts: any = {}) {
  return firstDefined(opts.source, AGENT_OBSERVABILITY_FORGE_COMPLETION_SOURCE);
}


function normalizeRelPath(value: any = '') {
  return rawStringValue(value)
    .replace(/\\/g, '/')
    .replace(/^"|"$/g, '')
    .replace(/^(?:\.\/)+/, '')
    .replace(/^\/+/, '');
}

function porcelainPath(line: any = '') {
  const raw = String(line).replace(/^[ MADRCU?!]{1,2}\s+/, '').trim();
  return normalizeRelPath(raw.includes(' -> ') ? raw.split(' -> ').pop() : raw);
}

function isInsidePath(child: any, parent: any) {
  if (selectTruthyValue(() => (!child), () => (!parent))) return false;
  const relative = path.relative(path.resolve(parent), path.resolve(child));
  return selectTruthyValue(() => (relative === ''), () => ((!!relative && !relative.startsWith('..') && !path.isAbsolute(relative))));
}

function moduleRelativePath(config: any, moduleDir: any, fileName: any) {
  const modulesDir = config?.paths?.modules_dir;
  if (selectTruthyValue(() => (selectTruthyValue(() => (!modulesDir), () => (!config?.repo_root))), () => (!moduleDir))) return null;
  const abs = path.resolve(modulesDir, moduleDir, fileName);
  return normalizeRelPath(path.relative(config.repo_root, abs));
}

function projectScopeRelPath(config: any) {
  const repoRoot = stringValue(config?.repo_root);
  const swarmDir = stringValue(config?.paths?.swarm_dir);
  if (!repoRoot) return null;
  if (!swarmDir) return null;
  return normalizeRelPath(path.relative(repoRoot, path.dirname(swarmDir)));
}

function isProjectScopedPath(config: any, relPath: any) {
  const scope = projectScopeRelPath(config);
  if (!scope) {
    throw new Error('Forge completion diff evidence requires repo_root and paths.swarm_dir to determine project scope');
  }
  const normalized = normalizeRelPath(relPath);
  return selectTruthyValue(() => (normalized === scope), () => (normalized.startsWith(`${scope}/`)));
}

function buildIgnoredPathSet(config: any, moduleDir: any, extraIgnoredPaths: any = []) {
  return new Set([
    moduleRelativePath(config, moduleDir, 'forge-completion.json'),
    ...extraIgnoredPaths,
  ].filter((value: any): value is string => typeof value === 'string' && value.length > 0).map((value: any) => normalizeRelPath(value)));
}

export function isForgeCompletionControlPath(relPath: any, config: any = {}, moduleDir: any = null, extraIgnoredPaths: any = []) {
  const normalized = normalizeRelPath(relPath);
  if (!normalized) return true;
  if (RUNTIME_PATH_PREFIXES.some((prefix: any) => selectTruthyValue(() => (normalized === prefix.slice(0, -1)), () => (normalized.startsWith(prefix))))) return true;
  if (selectTruthyValue(() => (normalized.includes('/.swarm/')), () => (normalized.startsWith('.swarm/')))) return true;
  const ignored = buildIgnoredPathSet(config, moduleDir, extraIgnoredPaths);
  return ignored.has(normalized);
}

function gitPathList(config: any, args: any) {
  const output = gitExec(config.repo_root, args);
  return output.split('\n').map(normalizeRelPath).filter(Boolean);
}

function statusPaths(config: any) {
  const output = gitExec(config.repo_root, ['status', '--porcelain', '--untracked-files=all']);
  return output.split('\n').filter(Boolean).map(porcelainPath).filter(Boolean);
}

function summarizePaths(paths: any = []) {
  if (paths.length === 0) return 'Forge agent ended without meaningful file changes';
  const preview = paths.slice(0, 5).join(', ');
  const suffix = paths.length > 5 ? ` (+${paths.length - 5} more)` : '';
  return `Forge agent ended with meaningful changes: ${preview}${suffix}`;
}

function injectedDiffEvidence(opts: any) {
  const paths = [...new Set(arrayValue(opts.diffEvidence.paths).map(normalizeRelPath).filter(Boolean))];
  const ignoredPaths = [...new Set(arrayValue(opts.diffEvidence.ignored_paths).map(normalizeRelPath).filter(Boolean))];
  return {
    ok: opts.diffEvidence.ok !== false, hasMeaningfulChanges: Boolean(opts.diffEvidence.hasMeaningfulChanges),
    paths, ignoredPaths, headBefore: opts.diffEvidence.headBefore ?? null,
    headNow: opts.diffEvidence.headNow ?? null,
    source: stringValue(opts.diffEvidence.source) ?? INJECTED_DIFF_EVIDENCE_SOURCE,
    error: opts.diffEvidence.error ?? null,
  };
}

function unavailableDiffEvidence(opts: any, source: string, code: string, message: string) {
  return {
    ok: false, hasMeaningfulChanges: false, paths: [], ignoredPaths: [],
    headBefore: opts.headBefore ?? null, headNow: null, source,
    error: { code, message },
  };
}

export function collectMeaningfulForgeDiffEvidence(config: any, moduleDir: any, opts: any = {}) {
  if (opts.diffEvidence) return injectedDiffEvidence(opts);

  if (!config?.repo_root) {
    return unavailableDiffEvidence(opts, 'repo_root_required', 'FORGE_COMPLETION_REPO_ROOT_REQUIRED',
      'Forge completion polling requires typed repo_root diff context');
  }
  if (!projectScopeRelPath(config)) {
    return unavailableDiffEvidence(opts, 'project_scope_required', 'FORGE_COMPLETION_PROJECT_SCOPE_REQUIRED',
      'Forge completion polling requires typed repo_root and paths.swarm_dir diff context');
  }

  const extraIgnoredPaths = arrayValue(opts.ignoredPaths);
  const meaningful = new Set<string>();
  const ignored = new Set<string>();
  const addPath = (relPath: any) => {
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
  } catch (error: any) {
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

export function buildForgeCompletionStatusFromDiff(diffEvidence: any, event: any = null, opts: any = {}) {
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
