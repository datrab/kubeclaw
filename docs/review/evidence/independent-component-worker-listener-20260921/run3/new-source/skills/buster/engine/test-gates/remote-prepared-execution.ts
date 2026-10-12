import crypto from 'node:crypto';
import path from 'node:path';
import { ensureDirectoryDurable } from '@kubeclaw/plugin-foundation/observability/durable-delivery';
import { remotePlanResultDigest, remotePlanResultReceipt, validatePipelineTestGateContract,
  type RemotePlanResultV1 } from '@kubeclaw/pipeline-test-gate-contract';
import { preparedPlanRuntimeRoot } from './prepared-plan-paths.ts';
import { cleanupTerminalWorkspace } from './terminal-workspace.ts';
import { createBusterCapabilityRuntime } from './capability-runtime.ts';
import { TestPlanRunner, type TestPlanRunResult } from './runner.ts';
import type { BusterStagedAdmission } from './preparation-input.ts';
import type { PreparedPlanJob, PreparedSourceReference } from './preparation-header.ts';
import type { BusterRemotePlanServiceOptions } from './remote-plan-service.ts';

type ExecutionPaths = Parameters<NonNullable<BusterRemotePlanServiceOptions['execute']>>[1];

async function executionPaths(options: BusterRemotePlanServiceOptions, jobId: string,
  source: PreparedSourceReference): Promise<ExecutionPaths> {
  const jobRoot = path.join(preparedPlanRuntimeRoot(options.runtimeRoot), crypto.createHash('sha256').update(jobId).digest('hex'));
  await ensureDirectoryDurable(jobRoot);
  const workspaceRoot = path.join(jobRoot, 'workspace');
  const repositoryRoot = path.join(workspaceRoot, 'repository');
  const artifactRoot = path.join(jobRoot, 'artifacts');
  const observabilityRoot = path.join(jobRoot, 'observability');
  for (const directory of [repositoryRoot, workspaceRoot, artifactRoot, observabilityRoot]) await ensureDirectoryDurable(directory);
  const sourceRepositoryRoot = await options.preparation.repository(source);
  return { jobRoot, repositoryRoot, sourceRepositoryRoot, workspaceRoot, artifactRoot, observabilityRoot };
}

async function runPlan(options: BusterRemotePlanServiceOptions, job: PreparedPlanJob,
  paths: ExecutionPaths, signal: AbortSignal): Promise<TestPlanRunResult> {
  signal.throwIfAborted();
  const capabilities = createBusterCapabilityRuntime(options, paths);
  if (options.execute) return options.execute(job, paths, signal);
  return new TestPlanRunner({ plan: job.plan, registry: options.registry,
    workspaceRoot: paths.workspaceRoot, repositoryRoot: paths.repositoryRoot,
    sourceRepositoryRoot: paths.sourceRepositoryRoot, artifactRoot: paths.artifactRoot,
    observabilityRoot: paths.observabilityRoot, maximumConcurrency: job.maximumConcurrency,
    grants: new Map(Object.entries(job.grants)),
    ...(capabilities.invoker ? { capabilityInvoker: capabilities.invoker } : {}), signal,
  }).run().finally(() => capabilities.shutdown());
}

/** Accepted wire and source publication precede mutable per-attempt execution. */
export async function executeBusterPreparedJob(options: BusterRemotePlanServiceOptions,
  prepared: BusterStagedAdmission, signal: AbortSignal, now: () => Date): Promise<void> {
  const { job } = prepared;
  try {
    const extracted = await options.preparation.extract(prepared);
    await options.store.attachSource(extracted);
    await options.store.transition(job.jobId, ['accepted'], 'running', now().toISOString());
    const paths = await executionPaths(options, job.jobId, extracted.source);
    const run = await runPlan(options, job, paths, signal);
    if (run.cleanupErrors.length === 0 && run.attempts.every(attempt => attempt.executionState === 'completed')) {
      await cleanupTerminalWorkspace(paths.jobRoot);
    }
    if (signal.aborted) {
      await options.store.transition(job.jobId, ['running', 'cancelling'], 'cancelled',
        now().toISOString(), { error: 'cancelled by Nova' });
      return;
    }
    const unsigned = { schemaVersion: 'buster-plan-result.v1' as const,
      workerRevision: options.workerRevision, jobId: job.jobId, planId: job.plan.planId,
      planDigest: job.plan.planDigest, runId: job.plan.runId,
      attempts: [...run.attempts], nodes: [...run.nodes], cleanupErrors: [...run.cleanupErrors], completedAt: now().toISOString() };
    const resultDigest = remotePlanResultDigest(unsigned);
    const result: RemotePlanResultV1 = { ...unsigned, resultDigest, receipt: remotePlanResultReceipt(job.jobId, resultDigest) };
    validatePipelineTestGateContract('remotePlanResult', result);
    await options.store.complete(job.jobId, result, now().toISOString());
  } catch (error) {
    const current = await options.store.get(job.jobId).then(value => value.payload.status).catch((readError: unknown) => {
      throw new AggregateError([error, readError], 'BUSTER_REMOTE_TERMINAL_STATUS_UNREADABLE');
    });
    if (['completed', 'failed', 'cancelled'].includes(current.state)) return;
    const cancelled = signal.aborted || current.state === 'cancelling';
    await options.store.transition(job.jobId, [current.state], cancelled ? 'cancelled' : 'failed', now().toISOString(),
      { error: error instanceof Error ? error.message : String(error) });
  }
}
