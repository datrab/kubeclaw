import fs from 'node:fs';
import { withLintCandidate } from './candidate.ts';
import path from 'node:path';

import type { AdapterActivationContext, AdapterInstance } from '@kubeclaw/plugin-sdk';
import { executeLintReport, type LintExecutionRequest } from './engine/index.ts';

function configuredRoots(config: Readonly<Record<string, unknown>>, key: string): string[] {
  const value = config[key];
  if (!Array.isArray(value) || value.length === 0 || value.some((item) => typeof item !== 'string')) {
    throw new Error(`lint adapter ${key} must be a non-empty string array`);
  }
  return value.map((root) => fs.realpathSync(path.resolve(root as string)));
}

function requireInside(value: unknown, roots: readonly string[], label: string): string {
  if (typeof value !== 'string' || value.length === 0) throw new Error(`${label}_INVALID`);
  const canonical = fs.realpathSync(path.resolve(value));
  if (!roots.some((root) => canonical === root || canonical.startsWith(`${root}${path.sep}`))) {
    throw new Error(`${label}_DENIED:${canonical}`);
  }
  return canonical;
}

function requestPayload(value: Readonly<Record<string, unknown>>): LintExecutionRequest {
  const tier = value.tier;
  if (tier !== 'pre-check' && tier !== 'full') throw new Error('LINT_TIER_INVALID');
  const changedFiles = value.changedFiles;
  if (changedFiles !== undefined && (!Array.isArray(changedFiles) || changedFiles.some((item) => typeof item !== 'string'))) {
    throw new Error('LINT_CHANGED_FILES_INVALID');
  }
  if (typeof value.workingDirectory !== 'string') throw new Error('LINT_WORKING_DIRECTORY_INVALID');
  if (typeof value.policyPath !== 'string') throw new Error('LINT_POLICY_PATH_INVALID');
  if (typeof value.policyProject !== 'string') throw new Error('LINT_POLICY_PROJECT_INVALID');
  const kubernetes = value.kubernetes;
  if (kubernetes !== undefined && (!kubernetes || typeof kubernetes !== 'object' || Array.isArray(kubernetes))) {
    throw new Error('LINT_KUBERNETES_INPUT_INVALID');
  }
  const rawManifests = kubernetes === undefined ? undefined : (kubernetes as Record<string, unknown>).rawManifests;
  const helmCharts = kubernetes === undefined ? undefined : (kubernetes as Record<string, unknown>).helmCharts;
  if (kubernetes !== undefined && (![rawManifests, helmCharts].every((entries) => Array.isArray(entries)
    && entries.every((entry) => typeof entry === 'string')))) {
    throw new Error('LINT_KUBERNETES_INPUT_INVALID');
  }
  return {
    workingDirectory: value.workingDirectory,
    policyPath: value.policyPath,
    policyProject: value.policyProject,
    tier,
    ...(typeof value.project === 'string' ? { project: value.project } : {}),
    ...(typeof value.modulePath === 'string' ? { modulePath: value.modulePath } : {}),
    ...(Array.isArray(changedFiles) ? { changedFiles: changedFiles as string[] } : {}),
    ...(kubernetes === undefined ? {} : { kubernetes: {
      rawManifests: rawManifests as string[], helmCharts: helmCharts as string[],
    } }),
    ...(value.includeDebt === true ? { includeDebt: true } : {}),
    ...(value.includeExperimental === true ? { includeExperimental: true } : {}),
  };
}

export function activate(context: AdapterActivationContext): AdapterInstance {
  const repositoryRoots = configuredRoots(context.config, 'allowedRepositoryRoots');
  const policyRoots = configuredRoots(context.config, 'allowedPolicyRoots');
  return {
    async ready() {},
    async invoke({ request, signal, confidential, fence }) {
      if (!confidential) fence.assertCurrent();
      if (signal.aborted) throw new Error('ADAPTER_CANCELLED');
      if (request.capability !== 'lint.execute' || request.operation !== 'run_report') {
        throw new Error(`LINT_OPERATION_UNSUPPORTED:${request.capability}:${request.operation}`);
      }
      const payload = requestPayload(request.payload);
      const workingDirectory = requireInside(payload.workingDirectory, repositoryRoots, 'LINT_WORKING_DIRECTORY');
      const policyPath = requireInside(payload.policyPath, policyRoots, 'LINT_POLICY_PATH');
      const revision = request.payload.sourceRevision;
      if (revision !== undefined && (typeof revision !== 'string' || !/^[a-f0-9]{40}$/u.test(revision))) throw new Error('LINT_SOURCE_REVISION_INVALID');
      const run = (root: string) => executeLintReport({ ...payload, workingDirectory: root, policyPath });
      const report = revision === undefined ? await run(workingDirectory)
        : await withLintCandidate(workingDirectory, revision, run);
      return { report, ...(revision === undefined ? {} : { sourceRevision: revision }) };
    },
    async shutdown() {},
  };
}
