import type { ArtifactRef, PluginInvocationContext, StageResult } from '@kubeclaw/plugin-sdk';

interface LintInput {
  readonly workingDirectory: string;
  readonly project?: string;
  readonly modulePath?: string;
  readonly changedFiles?: readonly string[];
}

function requiredConfig(config: Readonly<Record<string, unknown>>, key: string): string {
  const value = config[key];
  if (typeof value !== 'string' || value.length === 0) throw new Error(`lint config is invalid: ${key}`);
  return value;
}

function numeric(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

export function resultForReport(
  report: Readonly<Record<string, unknown>>,
  artifact: ArtifactRef,
): StageResult {
  const summary = report.summary as Readonly<Record<string, unknown>> | undefined;
  const failedTools = numeric(summary?.tools_failed);
  const blocking = numeric(summary?.total_blocking);
  if (failedTools > 0) {
    return {
      schemaVersion: 'stage-result.v2',
      outcome: 'blocked',
      reason: {
        code: 'lint.tool_execution_failed',
        message: `${failedTools} required lint tool(s) failed`,
      },
      artifacts: [artifact],
    };
  }
  if (blocking > 0) {
    return {
      schemaVersion: 'stage-result.v2',
      outcome: 'request_fix',
      reason: {
        code: 'lint.blocking_findings',
        message: `${blocking} blocking lint finding(s) require remediation`,
      },
      artifacts: [artifact],
    };
  }
  return { schemaVersion: 'stage-result.v2', outcome: 'passed', artifacts: [artifact] };
}

async function execute(
  input: LintInput,
  context: PluginInvocationContext,
  tier: 'pre-check' | 'full',
): Promise<StageResult> {
  const response = await context.invoke('lint.execute', {
    operation: 'run_report',
    resource: { type: 'lint.project', canonicalId: input.project || input.workingDirectory },
    payload: {
      workingDirectory: input.workingDirectory,
      policyPath: requiredConfig(context.contract.config, 'policyPath'),
      policyProject: requiredConfig(context.contract.config, 'policyProject'),
      tier,
      ...(input.project ? { project: input.project } : {}),
      ...(input.modulePath ? { modulePath: input.modulePath } : {}),
      ...(input.changedFiles ? { changedFiles: [...input.changedFiles] } : {}),
      includeDebt: context.contract.config.includeDebt === true,
      includeExperimental: context.contract.config.includeExperimental === true,
    },
  });
  const report = response.report as Readonly<Record<string, unknown>>;
  const stored = await context.invoke('artifacts.write', {
    operation: 'put_json',
    resource: { type: 'artifact.object', canonicalId: `lint:${tier}:${input.project || 'project'}` },
    payload: { namespace: 'kubeclaw.lint', mediaType: 'application/json', value: report },
  });
  const artifact = stored.artifact as ArtifactRef;
  return resultForReport(report, artifact);
}

export function executePreCheck(input: LintInput, context: PluginInvocationContext): Promise<StageResult> {
  return execute(input, context, 'pre-check');
}

export function executeFull(input: LintInput, context: PluginInvocationContext): Promise<StageResult> {
  return execute(input, context, 'full');
}
