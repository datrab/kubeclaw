import { readBusterOriginalExecution } from './original-execution.ts';
import crypto from 'node:crypto';
import { freeze } from './runner-values.ts';
import { assertBusterInput } from './preparation-input.ts';
import { assertPreparedSource, preparationDigest } from './preparation-header.ts';
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
  const capabilities = createBusterCapabilityRuntime(options, paths, options.executionPolicy.processInput);
  if (options.execute) return options.execute(job, paths, signal);
  return new TestPlanRunner({ plan: job.plan, registry: options.registry,
    workspaceRoot: paths.workspaceRoot, repositoryRoot: paths.repositoryRoot,
    sourceRepositoryRoot: paths.sourceRepositoryRoot, artifactRoot: paths.artifactRoot,
    observabilityRoot: paths.observabilityRoot, maximumConcurrency: job.maximumConcurrency,
    ...(options.workerCore ? {workerCore: options.workerCore} : {}), grants: new Map(Object.entries(job.grants)), workerLocalRuntime: options.workerLocalRuntime, executionPolicy: options.executionPolicy,
    ...(capabilities.invoker ? { capabilityInvoker: capabilities.invoker } : {}), signal,
  }).run().finally(() => capabilities.shutdown());
}

/** Accepted wire and source publication precede mutable per-attempt execution. */
export async function executeBusterPreparedJob(options: BusterRemotePlanServiceOptions,
  prepared: BusterStagedAdmission, signal: AbortSignal, now: () => Date): Promise<void> {
  // Keep the existing accepted wire/source/producer closure through asynchronous
  // extraction, publication and cleanup. Readonly types do not isolate ownership.
  prepared = freeze(structuredClone(prepared));
  const { job } = prepared;
  try {
    const retained = (await options.store.get(job.jobId)).payload;
    if (retained.schemaVersion === 'buster-plan-job-record.v3') {
      const original = readBusterOriginalExecution(retained.originalExecution);
      const { workerCore: _currentWorkerCore, ...base } = options;
      options = { ...base, executionPolicy: original.executionPolicy,
        workerLocalRuntime: original.workerLocalRuntime,
        ...(original.workerCore === null ? {} : {workerCore: original.workerCore}) };
    } else if (options.originalExecution !== undefined) {
      throw new Error('BUSTER_ORIGINAL_EXECUTION_UNAVAILABLE');
    }
    assertBusterInput(prepared.input, job);
    // Durable status/capture metadata is not part of the retained root wire identity.
    const staged: BusterStagedAdmission = prepared.input.schemaVersion === 'buster-staged-input.v1'
      ? {job, input: prepared.input} : {job, input: prepared.input};
    const extracted = freeze(structuredClone(await options.preparation.extract(staged)));
    assertPreparedSource(extracted.source, job);
    if (preparationDigest(extracted.job) !== prepared.input.headerDigest) {
      throw new Error('BUSTER_PREPARATION_HEADER_CHANGED');
    }
    await options.store.attachSource(extracted);
    await options.store.transition(job.jobId, ['accepted'], 'running', now().toISOString());
    const paths = await executionPaths(options, job.jobId, extracted.source);
    const run = freeze(structuredClone(await runPlan(options, job, paths, signal)));
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
