import type { DeclaredEvidenceV1, EvidenceRefV1, ProducedOutputV1, ProviderInvocationV1, ProviderResultV1, ResolvedPlanNodeV1 } from '@kubeclaw/pipeline-test-gate-contract';
import type { TestProviderExecutionContext } from '@kubeclaw/plugin-sdk';
import type { TestProviderRegistryEntry } from '@kubeclaw/plugin-foundation/registry/types';
import type { LoadedTestProvider, TestProviderLoader } from './provider-loader.ts';
import type { createLogCapture } from './runner-log-capture.ts';
import type { TestPlanRunnerOptions } from './runner-types.ts';
import type { ReportAdapterExecutor } from './specialist-report-finalization.ts';

/** Mutable facts of one invocation only; the operation and its evidence phase share this owner. */
export interface RunnerProviderState {
  instance: LoadedTestProvider | null;
  providerResult: ProviderResultV1 | null;
  producedOutputs: ProducedOutputV1[];
  retainFixture: boolean;
  stagedFiles: DeclaredEvidenceV1[];
  stagedErrorFiles: DeclaredEvidenceV1[];
  stagingWork: Promise<void> | null;
  loadWork: Promise<LoadedTestProvider> | null;
  executionStarted: boolean;
  fixtureInitializationStarted: boolean;
  evidenceFault: string | null;
}

export interface RunnerProviderInput {
  readonly options: TestPlanRunnerOptions;
  readonly node: ResolvedPlanNodeV1;
  readonly entry: TestProviderRegistryEntry;
  readonly invocation: ProviderInvocationV1;
  readonly workspaceRoot: string;
  readonly attemptId: string;
  readonly evidenceDirectory: string;
  readonly stagedEvidenceDirectory: string;
  readonly stagedErrorEvidenceDirectory: string;
  readonly runnerEvidenceDirectory: string;
  readonly granted: readonly string[];
  readonly providerResultLimit: number;
  readonly cleanupTimeoutMs: number;
  readonly retainAnyLog: boolean;
  readonly busterLog: ReturnType<typeof createLogCapture>;
  readonly loader: TestProviderLoader;
  readonly reportAdapterRuntime: ReportAdapterExecutor;
  context(signal: AbortSignal, log: TestProviderExecutionContext['log'], granted: ReadonlySet<string>,
    inputs: ProviderInvocationV1['inputs']): TestProviderExecutionContext;
  collectEvidence(entry: TestProviderRegistryEntry, attemptId: string, directory: string,
    declarations: readonly DeclaredEvidenceV1[], maximumFiles: number, maximumBytes: number,
    signal: AbortSignal): Promise<EvidenceRefV1[]>;
}

export function createRunnerProviderState(): RunnerProviderState {
  return { instance: null, providerResult: null, producedOutputs: [], retainFixture: false,
    stagedFiles: [], stagedErrorFiles: [], stagingWork: null, loadWork: null,
    executionStarted: false, fixtureInitializationStarted: false, evidenceFault: null };
}
