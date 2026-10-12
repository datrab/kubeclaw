import { requireRepositoryPath } from './paths.ts';
import fs from 'node:fs';
import { assertNotAborted } from './process.ts';
import path from 'node:path';

import { detectProjectTypes, resolveScope, takeDiscoveryDiagnostics } from './discovery.ts';
import { runAllTools as runToolsForRegistry } from './report.ts';
import { validateLintReport } from './report-contract.ts';
import {
  loadLintPolicy,
  policyDigest,
  selectPolicyProject,
  validatePolicyTargetPaths,
} from './policy.ts';
import { buildToolRegistry } from './tool-registry.ts';

export interface LintExecutionRequest {
  readonly signal?: AbortSignal;
  readonly workingDirectory: string;
  readonly policyPath: string;
  readonly policyProject: string;
  readonly tier: 'pre-check' | 'full';
  readonly project?: string;
  readonly modulePath?: string;
  readonly changedFiles?: readonly string[];
  readonly includeDebt?: boolean;
  readonly includeExperimental?: boolean;
  readonly kubernetes?: {
    readonly rawManifests: readonly string[];
    readonly helmCharts: readonly string[];
  };
}

function kubernetesInputPaths(values: readonly string[], field: string): string[] {
  if (values.length > 256) throw new Error(`LINT_KUBERNETES_INPUT_LIMIT:${field}`);
  const normalized = values.map((value) => {
    if (typeof value !== 'string' || value.length === 0) throw new Error(`LINT_KUBERNETES_INPUT_INVALID:${field}`);
    const candidate = path.posix.normalize(value.replace(/\\/gu, '/'));
    if (path.posix.isAbsolute(candidate) || candidate === '..' || candidate.startsWith('../')) {
      throw new Error(`LINT_KUBERNETES_INPUT_ESCAPE:${field}:${value}`);
    }
    return candidate;
  });
  if (new Set(normalized).size !== normalized.length) throw new Error(`LINT_KUBERNETES_INPUT_DUPLICATE:${field}`);
  return normalized;
}

function effectivePolicyProject(project: Record<string, any>, input: LintExecutionRequest['kubernetes']): Record<string, any> {
  if (input === undefined) return project;
  const rawManifests = kubernetesInputPaths(input.rawManifests, 'rawManifests');
  const helmCharts = kubernetesInputPaths(input.helmCharts, 'helmCharts');
  if (rawManifests.length + helmCharts.length === 0) throw new Error('LINT_KUBERNETES_INPUT_EMPTY');
  return {
    ...project,
    kubernetes: { ...project.kubernetes, raw_manifests: rawManifests, helm_charts: helmCharts },
  };
}

function normalizeModulePath(repositoryRoot: string, value: string | undefined): string | null {
  if (!value) return null;
  if (path.isAbsolute(value)) throw new Error('LINT_MODULE_PATH_ABSOLUTE');
  const normalized = path.normalize(value);
  const absolute = requireRepositoryPath(repositoryRoot, path.resolve(repositoryRoot, normalized));
  const relative = path.relative(repositoryRoot, absolute);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('LINT_MODULE_PATH_ESCAPE');
  return normalized;
}

function normalizeChangedFiles(repositoryRoot: string, values: readonly string[] | undefined): string[] {
  if (!values) return [];
  return values.map((value) => {
    if (typeof value !== 'string' || value.length === 0) throw new Error('LINT_CHANGED_FILE_INVALID');
    if (path.isAbsolute(value)) throw new Error('LINT_CHANGED_FILE_ABSOLUTE');
    const normalized = path.normalize(value);
    if (normalized === '..' || normalized.startsWith(`..${path.sep}`)) throw new Error('LINT_CHANGED_FILE_ESCAPE');
    requireRepositoryPath(repositoryRoot, path.resolve(repositoryRoot, normalized));
    return normalized.split(path.sep).join('/');
  });
}

export async function executeLintReport(request: LintExecutionRequest): Promise<Record<string, unknown>> {
  assertNotAborted(request.signal);
  const repositoryRoot = fs.realpathSync(request.workingDirectory);
  const policyPath = fs.realpathSync(request.policyPath);
  const policy = loadLintPolicy(policyPath);
  const policyProject = effectivePolicyProject(selectPolicyProject(policy, request.policyProject), request.kubernetes);
  validatePolicyTargetPaths(repositoryRoot, policy, policyProject);
  const modulePath = normalizeModulePath(repositoryRoot, request.modulePath);
  const changedFiles = normalizeChangedFiles(repositoryRoot, request.changedFiles);
  const { types: projectTypes } = detectProjectTypes(repositoryRoot, policyProject, policy.global_exclusions);
  const context: Record<string, any> = {
    signal: request.signal,
    repoRoot: repositoryRoot,
    modulePath,
    requestedModulePath: modulePath,
    project: request.project || path.basename(repositoryRoot),
    tier: request.tier,
    changedFiles,
    changedFilesRequested: changedFiles.length > 0,
    projectTypes,
    policy,
    policyPath,
    policyDigest: policyDigest(policy),
    policyProject,
    includeDebt: request.includeDebt === true,
    includeExperimental: request.includeExperimental === true,
    diagnostics: takeDiscoveryDiagnostics(),
    matchedBaselineKeys: new Set<string>(),
  };
  if (changedFiles.length > 0) context.changedFiles = resolveScope(context);
  else resolveScope(context);
  context.diagnostics = [
    ...(Array.isArray(context.diagnostics) ? context.diagnostics : []),
    ...takeDiscoveryDiagnostics(),
  ];
  const report = await runToolsForRegistry(context, buildToolRegistry(policy, projectTypes));
  assertNotAborted(request.signal);
  validateLintReport(report);
  if (request.tier === 'full' && !context.changedFilesRequested && !modulePath) {
    const completedTools = new Set(Object.entries((report as any).tools)
      .filter(([, result]: any) => result.status === 'ok')
      .map(([toolId]) => toolId));
    const stale = policy.baseline.entries
      .map((entry: any) => `${entry.tool}:${entry.fingerprint}`)
      .filter((key: string) => completedTools.has(key.slice(0, key.indexOf(':'))))
      .filter((key: string) => !context.matchedBaselineKeys.has(key));
    if (stale.length > 0) {
      throw Object.assign(new Error(`Lint baseline contains ${stale.length} stale fingerprint(s); prune resolved debt before accepting new changes.`), {
        code: 'LINT_BASELINE_STALE',
        stale,
      });
    }
  }
  return report as Record<string, unknown>;
}
