import { readWorkerCorePolicyCapture, type WorkerCorePolicyCapture } from '@kubeclaw/plugin-foundation/config/worker-core-policy';
import type { BusterExecutionSettings } from '@kubeclaw/plugin-foundation/config/buster-execution';
import type { AttemptResultV1, NodeResultV1, ProducedOutputV1, ProviderInvocationV1, ResolvedInputV1, ResolvedTestPlanV1 } from '@kubeclaw/pipeline-test-gate-contract';
import type { TestProviderCapabilityRequest } from '@kubeclaw/plugin-sdk';
import type { RegistrySnapshot } from '@kubeclaw/plugin-foundation/registry/types';
import type { WorkerAttemptEnvelopeV1 } from '@kubeclaw/pipeline-worker-core-contract';
import type { LocalWorkerRuntimePolicy } from '@kubeclaw/worker-core';
import type { FileDurableAttemptStore } from '@kubeclaw/plugin-foundation/observability/durable-attempts';
import type { FileObservabilityAdmissionStore } from '@kubeclaw/plugin-foundation/observability/durable-delivery';
import type { EvidenceStore } from './artifacts.ts';
import type { LoadedTestProvider, TestProviderLoader } from './provider-loader.ts';
import type { ReportAdapterExecutor } from './specialist-report-finalization.ts';
export interface TestPlanRunResult {
  readonly planId: string;
  readonly runId: string;
  readonly attempts: readonly AttemptResultV1[];
  readonly nodes: readonly NodeResultV1[];
  readonly cleanupErrors: readonly { nodeId: string; message: string }[];
}

export interface TestProviderCapabilityInvoker {
  invoke(
    capability: string,
    request: TestProviderCapabilityRequest,
    signal: AbortSignal,
    inputs?: readonly ResolvedInputV1[],
  ): Promise<Readonly<Record<string, unknown>>>;
}

export interface TestPlanRunnerOptions {
  readonly plan: ResolvedTestPlanV1;
  readonly registry: RegistrySnapshot;
  readonly workspaceRoot: string;
  readonly repositoryRoot: string;
  /** Trusted immutable source lease; attempt repositories remain workspace-local. */
  readonly sourceRepositoryRoot?: string;
  readonly artifactRoot: string;
  readonly observabilityRoot: string;
  readonly maximumConcurrency: number;
  readonly workerLocalRuntime: LocalWorkerRuntimePolicy;
  readonly workerCore?: WorkerCorePolicyCapture;
  readonly grants?: ReadonlyMap<string, readonly string[]>;
  readonly loader?: TestProviderLoader;
  readonly evidenceStore?: EvidenceStore;
  readonly capabilityInvoker?: TestProviderCapabilityInvoker;
  readonly signal?: AbortSignal;
  readonly executionPolicy: BusterExecutionSettings;
  readonly now?: () => Date;
  readonly id?: () => string;
  readonly workerRuntime?: WorkerAttemptRuntime;
  readonly durableAttemptStore?: FileDurableAttemptStore;
  readonly observabilityAdmissionStore?: FileObservabilityAdmissionStore;
  readonly reportAdapterRuntime?: ReportAdapterExecutor;
}

export interface WorkerAttemptRuntime {
  runAttempt<T>(
    envelope: WorkerAttemptEnvelopeV1,
    execute: (signal: AbortSignal) => Promise<T>,
  ): Promise<T>;
}

export interface AttemptExecution {
  readonly result: AttemptResultV1;
  readonly instance: LoadedTestProvider | null;
  readonly invocation: ProviderInvocationV1;
  readonly cleanupFailed: boolean;
}

export interface NodeExecution {
  readonly result: NodeResultV1;
  readonly attempts: readonly AttemptResultV1[];
  readonly outputs: readonly ProducedOutputV1[];
  readonly retainedFixture: AttemptExecution | null;
}

