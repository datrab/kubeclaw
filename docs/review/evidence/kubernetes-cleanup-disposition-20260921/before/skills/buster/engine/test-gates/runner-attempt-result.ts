import fs from 'node:fs';
import { validatePipelineTestGateContract, type AttemptResultV1, type EvidenceRefV1, type ExecutionState, type ProviderInvocationV1, type ProviderResultV1, type ReportAdapterResultV1, type ResolvedPlanNodeV1, type ResourceUseV1, type TestOutcome } from '@kubeclaw/pipeline-test-gate-contract';
import type { WorkerAttemptResultV1 } from '@kubeclaw/pipeline-worker-core-contract';
import type { LoadedTestProvider } from './provider-loader.ts';
import type { TestProviderExecutionContext } from '@kubeclaw/plugin-sdk';
import { validateAndMapOutputs } from './provider-result-validation.ts';
import { detail, digest, freeze, receipt, resultIdentity } from './runner-values.ts';
import type { TestPlanRunnerOptions } from './runner-types.ts';
import type { RunnerProviderState } from './runner-provider-state.ts';
import type { prepareRunnerAttempt } from './runner-attempt-preparation.ts';
import type { createLogCapture } from './runner-log-capture.ts';
interface ResultOwner {
 readonly options: TestPlanRunnerOptions;
 readonly now: () => Date;
 readonly id: () => string;
 readonly authorityId: string;
 readonly cleanupErrors: { nodeId: string; message: string }[];
 cleanupProvider(node: ResolvedPlanNodeV1, instance: LoadedTestProvider,
   invocation: ProviderInvocationV1, log: TestProviderExecutionContext['log']): Promise<boolean>;
}
interface ResultInput {
 readonly prepared: ReturnType<typeof prepareRunnerAttempt>;
 readonly state: RunnerProviderState;
 readonly node: ResolvedPlanNodeV1;
 readonly attemptNumber: number;
 readonly issuedAt: Date;
 readonly busterLog: ReturnType<typeof createLogCapture>;
 readonly workerResult: WorkerAttemptResultV1 | null;
 readonly workerRuntimeFault: string | null;
}
const EMPTY_COUNTS = Object.freeze({ total: 0, passed: 0, failed: 0, skipped: 0 });
function attemptSummary(evidenceFault: string | null, runtimeFault: string | null,
  result: WorkerAttemptResultV1 | null): string {
  if (evidenceFault !== null) return evidenceFault;
  if (runtimeFault !== null) return runtimeFault;
  return busterWorkerSummary(result?.summary ?? "WORKER_RUNTIME_FAILED");
}

function busterWorkerSummary(value: string): string {
  const mapped: Record<string, string> = {
    WORKER_ATTEMPT_CANCELLED: "TEST_PROVIDER_CANCELLED",
    WORKER_ATTEMPT_TIMEOUT: "TEST_PROVIDER_TIMEOUT",
    WORKER_CPU_LIMIT: "TEST_PROVIDER_CPU_LIMIT",
    WORKER_LOG_LIMIT: "TEST_PROVIDER_LOG_LIMIT",
    WORKER_MEMORY_LIMIT: "TEST_PROVIDER_MEMORY_LIMIT",
    WORKER_PROCESS_LIMIT: "TEST_PROVIDER_PROCESS_LIMIT",
  };
  return mapped[value] ?? value;
}

async function cleanupFaultedFixture(owner: ResultOwner, input: ResultInput): Promise<boolean> {
 const { state, node, busterLog, workerResult, workerRuntimeFault } = input;
 const { invocation } = input.prepared;
    let retainedFaultCleanupFailed = false;
    if (
      state.retainFixture &&
      (workerRuntimeFault || workerResult?.state !== "completed") &&
      state.instance
    ) {
      retainedFaultCleanupFailed = !(await owner.cleanupProvider(
        node,
        state.instance,
        invocation,
        busterLog.contextLog,
      ));
      state.retainFixture = false;
    }
 return retainedFaultCleanupFailed;
}

function mapCompletedOutputs(input: ResultInput, workerExecutionState: ExecutionState,
  completedProviderResult: ProviderResultV1 | null, evidence: EvidenceRefV1[]): void {
 const { state } = input;
 const { entry } = input.prepared;
    if (workerExecutionState === "completed" && completedProviderResult) {
      try {
        state.producedOutputs = validateAndMapOutputs(
          entry,
          completedProviderResult,
          new Map(evidence.map((item) => [item.evidenceId, item])),
        );
      } catch (error) {
        state.evidenceFault = detail(error);
        state.producedOutputs = [];
      }
    }
}

function attemptResources(workerResult: WorkerAttemptResultV1 | null,
  busterLog: ResultInput['busterLog'], evidence: EvidenceRefV1[]): ResourceUseV1 {
    const resources: ResourceUseV1 = {
      ...(workerResult?.resources.cpuTimeMs !== undefined
        ? { cpuTimeMs: workerResult.resources.cpuTimeMs }
        : {}),
      ...(workerResult?.resources.maximumMemoryBytes !== undefined
        ? { maximumMemoryBytes: workerResult.resources.maximumMemoryBytes }
        : {}),
      logBytes: workerResult?.resources.logBytes ?? busterLog.bytes(),
      artifactBytes: evidence.reduce(
        (sum, item) => sum + item.artifact.sizeBytes,
        0,
      ),
    };
 return resources;
}

function providerResultFields(faulted: boolean, provider: ProviderResultV1 | null,
  worker: WorkerAttemptResultV1 | null) {
  const reports = worker?.specialistResult?.values?.reports;
  return {
    counts: faulted ? EMPTY_COUNTS : provider!.counts,
    findings: faulted ? [] : provider!.findings,
    metrics: faulted ? [] : provider!.metrics,
    reports: !faulted && Array.isArray(reports) ? reports as unknown as ReportAdapterResultV1[] : [],
    providerDetails: faulted ? null : provider!.providerDetails,
  };
}

function workerExecutionStateFor(owner: ResultOwner, input: ResultInput): ExecutionState {
  if (input.workerRuntimeFault) return owner.options.signal?.aborted ? 'cancelled' : 'errored';
  if (input.workerResult?.state === 'interrupted') return 'errored';
  return input.workerResult?.state ?? 'errored';
}

function cleanupFailedFor(worker: WorkerAttemptResultV1 | null, retainedFailure: boolean): boolean {
  if (worker?.cleanup.state === 'failed') return true;
  if (retainedFailure) return true;
  return worker?.error?.code === 'WORKER_TERMINATION_FAILED';
}

function unsignedAttemptResult(owner: ResultOwner, input: ResultInput,
  facts: { executionState: ExecutionState; outcome: TestOutcome; completedProviderResult: ProviderResultV1 | null; evidence: EvidenceRefV1[] }) {
 const { state, node, attemptNumber, issuedAt, busterLog, workerResult, workerRuntimeFault } = input;
 const { attemptId } = input.prepared;
 const { executionState, outcome, completedProviderResult, evidence } = facts;
    const fallbackCompletedAt = owner.now();
    const resources = attemptResources(workerResult, busterLog, evidence);
    const faulted = executionState !== "completed";
    const unsigned = {
      schemaVersion: "attempt-result.v1" as const,
      ...resultIdentity(owner.options.plan, node),
      attemptId,
      attemptNumber,
      provider: node.provider,
      mode: node.mode,
      executionState,
      outcome,
      startedAt: workerResult?.startedAt ?? issuedAt.toISOString(),
      completedAt:
        workerResult?.completedAt ?? fallbackCompletedAt.toISOString(),
      durationMs:
        workerResult?.durationMs ??
        Math.max(0, fallbackCompletedAt.getTime() - issuedAt.getTime()),
      summary: attemptSummary(state.evidenceFault, workerRuntimeFault, workerResult),
      ...providerResultFields(faulted, completedProviderResult, workerResult),
      evidence,
      outputs: faulted ? [] : state.producedOutputs,
      resources,
      exitCode: workerResult?.exitCode ?? null,
      signal: workerResult?.signal ?? null,
    };
 return unsigned;
}

function completedProviderResultFor(input: ResultInput): ProviderResultV1 | null {
  return (input.workerResult?.specialistResult?.values?.providerResult
    ?? input.state.providerResult) as ProviderResultV1 | null;
}

export async function finalizeRunnerAttempt(owner: ResultOwner, input: ResultInput) {
 const { state, node, attemptNumber, issuedAt, busterLog, workerResult, workerRuntimeFault } = input;
 const { attemptId, attemptRepository, entry, invocation } = input.prepared;
    const completedProviderResult = completedProviderResultFor(input);
    const retainedFaultCleanupFailed = await cleanupFaultedFixture(owner, input);
    const workerExecutionState = workerExecutionStateFor(owner, input);
    const workerOutcome: TestOutcome =
      workerExecutionState === "completed"
        ? completedProviderResult!.outcome
        : null;
    const evidence = (workerResult?.evidence ?? []) as EvidenceRefV1[];
    mapCompletedOutputs(input, workerExecutionState, completedProviderResult, evidence);
    const executionState: ExecutionState = state.evidenceFault
      ? "errored"
      : workerExecutionState;
    const outcome: TestOutcome =
      executionState === "completed" ? workerOutcome : null;
    const unsigned = unsignedAttemptResult(owner, input, { executionState, outcome, completedProviderResult, evidence });
    const resultDigest = digest(unsigned);
    const result: AttemptResultV1 = {
      ...unsigned,
      resultDigest,
      receipt: receipt(owner.authorityId, owner.id(), resultDigest),
    };
    validatePipelineTestGateContract("attemptResult", result);
    const cleanupFailed = cleanupFailedFor(workerResult, retainedFaultCleanupFailed);
    if (cleanupFailed)
      owner.cleanupErrors.push({
        nodeId: node.id,
        message: workerResult?.cleanup.summary ?? "Cleanup failed.",
      });
    if (!state.retainFixture) {
      await fs.promises.rm(attemptRepository, { recursive: true, force: true });
    }
    return { result: freeze(result), instance: state.instance, invocation, cleanupFailed };
}
