import type { LintExecutionRequest } from './engine/index.ts';

function kubernetesPayload(kubernetes: unknown): LintExecutionRequest['kubernetes'] {
if (kubernetes !== undefined && (!kubernetes || typeof kubernetes !== 'object' || Array.isArray(kubernetes))) {
    throw new Error('LINT_KUBERNETES_INPUT_INVALID');
  }
  const rawManifests = kubernetes === undefined ? undefined : (kubernetes as Record<string, unknown>).rawManifests;
  const helmCharts = kubernetes === undefined ? undefined : (kubernetes as Record<string, unknown>).helmCharts;
  if (kubernetes !== undefined && (![rawManifests, helmCharts].every((entries) => Array.isArray(entries)
    && entries.every((entry) => typeof entry === 'string')))) {
    throw new Error('LINT_KUBERNETES_INPUT_INVALID');
  }
  return kubernetes === undefined ? undefined : { rawManifests: rawManifests as string[], helmCharts: helmCharts as string[] };
}

export function requestPayload(value: Readonly<Record<string, unknown>>): LintExecutionRequest {
  const tier = value.tier;
  if (tier !== 'pre-check' && tier !== 'full') throw new Error('LINT_TIER_INVALID');
  const changedFiles = value.changedFiles;
  if (changedFiles !== undefined && (!Array.isArray(changedFiles) || changedFiles.some((item) => typeof item !== 'string'))) {
    throw new Error('LINT_CHANGED_FILES_INVALID');
  }
  if (typeof value.workingDirectory !== 'string') throw new Error('LINT_WORKING_DIRECTORY_INVALID');
  if (typeof value.policyPath !== 'string') throw new Error('LINT_POLICY_PATH_INVALID');
  if (typeof value.policyProject !== 'string') throw new Error('LINT_POLICY_PROJECT_INVALID');
  const kubernetes = kubernetesPayload(value.kubernetes);
  return {
    workingDirectory: value.workingDirectory,
    policyPath: value.policyPath,
    policyProject: value.policyProject,
    tier,
    ...(typeof value.project === 'string' ? { project: value.project } : {}),
    ...(typeof value.modulePath === 'string' ? { modulePath: value.modulePath } : {}),
    ...(Array.isArray(changedFiles) ? { changedFiles: changedFiles as string[] } : {}),
    ...(kubernetes === undefined ? {} : { kubernetes }),
    ...(value.includeDebt === true ? { includeDebt: true } : {}),
    ...(value.includeExperimental === true ? { includeExperimental: true } : {}),
  };
}
