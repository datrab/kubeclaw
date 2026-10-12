import { cleanupRetainedProvider, cleanupRetainedFixtures, type FixtureOwner } from './runner-fixtures.ts';
import { finalizeRunnerAttempt } from './runner-attempt-result.ts';
import { executeRunnerAttempt } from './runner-attempt-execution.ts';
import { createRunnerEnvelope } from './runner-attempt-envelope.ts';
import { prepareRunnerAttempt } from './runner-attempt-preparation.ts';
import { createRunnerProviderState } from './runner-provider-state.ts';
import { createRunnerProviderOperation } from './runner-provider-operation.ts';
import { validateRunnerOptions, prepareRunnerPaths, configuredWorkerRuntime } from './runner-setup.ts';
import { resumeRunnerCompletions, type CompletionOwner } from './runner-completion.ts';
export { createBusterWorkerProfiles } from './runner-worker-profile.ts';
import { executeRunnerNode } from './runner-node.ts';
import { RunnerScheduler } from './runner-scheduler.ts';
import type { AttemptExecution, NodeExecution, TestPlanRunnerOptions, TestPlanRunResult, WorkerAttemptRuntime } from './runner-types.ts';
export type { TestPlanRunnerOptions, TestPlanRunResult, TestProviderCapabilityInvoker, WorkerAttemptRuntime } from './runner-types.ts';
import { freeze, detail } from './runner-values.ts';
import { createLogCapture } from './runner-log-capture.ts';
export { validateAndMapOutputs } from './provider-result-validation.ts';
import { type ReportAdapterExecutor } from './specialist-report-finalization.ts';
export type { ReportAdapterExecutor } from './specialist-report-finalization.ts';
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { type DeclaredEvidenceV1, type EvidenceRefV1, type ProducedOutputV1, type ProviderInvocationV1, type ResolvedInputV1, type ResolvedPlanNodeV1 } from "@kubeclaw/pipeline-test-gate-contract";
import type { TestProviderCapabilityRequest, TestProviderExecutionContext } from "@kubeclaw/plugin-sdk";
import type { TestProviderRegistryEntry } from "@kubeclaw/plugin-foundation/registry/types";
import { FileObservabilityAdmissionStore } from "@kubeclaw/plugin-foundation/observability/durable-delivery";
import { FileDurableAttemptStore } from "@kubeclaw/plugin-foundation/observability/durable-attempts";
import { FileEvidenceStore, type EvidenceStore } from "./artifacts.ts";
import { RegisteredTestProviderLoader, type LoadedTestProvider, type TestProviderLoader } from "./provider-loader.ts";
import { FileReportArtifactReader, RegisteredReportAdapterRuntime } from "./report-adapter-runtime.ts";


export class TestPlanRunner {
  readonly #options: TestPlanRunnerOptions;
  readonly #loader: TestProviderLoader;
  readonly #store: EvidenceStore;
  readonly #now: () => Date;
  readonly #id: () => string;
  readonly #workspaceRoot: string;
  readonly #authorityId: string;
  readonly #workerRuntime: WorkerAttemptRuntime;
  readonly #durableAttemptStore: FileDurableAttemptStore;
  readonly #observabilityAdmissionStore: FileObservabilityAdmissionStore;
  readonly #reportAdapterRuntime: ReportAdapterExecutor;
  readonly #customDurableAttemptStore: boolean;
  readonly #cleanupErrors: { nodeId: string; message: string }[] = [];
  readonly #retainedFixtures: Array<{
    node: ResolvedPlanNodeV1;
    execution: AttemptExecution;
  }> = [];

  constructor(options: TestPlanRunnerOptions) {
    const { workerLocalRuntime, executionPolicy } = validateRunnerOptions(options);
    const { workspaceRoot, artifactRoot, observabilityRoot } = prepareRunnerPaths(options);
    this.#workspaceRoot = workspaceRoot;
    this.#options = { ...options, workerLocalRuntime, executionPolicy, artifactRoot, observabilityRoot };
    this.#loader = options.loader ?? new RegisteredTestProviderLoader(executionPolicy.observation);
    this.#store = options.evidenceStore ?? new FileEvidenceStore(artifactRoot);
    this.#reportAdapterRuntime = options.reportAdapterRuntime ?? new RegisteredReportAdapterRuntime(
      new FileReportArtifactReader([artifactRoot]), path.join(observabilityRoot, 'report-adapters'));
    this.#customDurableAttemptStore = options.durableAttemptStore !== undefined;
    this.#durableAttemptStore =
      options.durableAttemptStore ??
      new FileDurableAttemptStore(path.join(observabilityRoot, "attempts"), executionPolicy.stores.attempts);
    this.#observabilityAdmissionStore =
      options.observabilityAdmissionStore ??
      new FileObservabilityAdmissionStore(path.join(observabilityRoot, "admission"), executionPolicy.stores.admission);
    this.#now = options.now ?? (() => new Date());
    this.#id = options.id ?? (() => crypto.randomUUID());
    this.#authorityId = `test-runner:${options.plan.planDigest}`;
    this.#workerRuntime = configuredWorkerRuntime(options, workerLocalRuntime, this.#now);
  }

  async run(): Promise<TestPlanRunResult> {
    let recoveredCompletions = 0;
    if (
      this.#customDurableAttemptStore ||
      fs.existsSync(
        path.join(
          this.#options.observabilityRoot,
          "attempts",
          "attempt-store.json",
        ),
      )
    )
      recoveredCompletions = await resumeRunnerCompletions(this.#completionOwner());
    if (recoveredCompletions > 0)
      throw new Error(
        `TEST_RUNNER_RECOVERY_OWNED_BY_NOVA:${recoveredCompletions}`,
      );
    return new RunnerScheduler({
      options: this.#options,
      authorityId: this.#authorityId,
      id: this.#id,
      cleanupErrors: this.#cleanupErrors,
      executeNode: (node, outputs) => this.#executeNode(node, outputs),
      retainFixture: (node, execution) => this.#retainedFixtures.push({ node, execution }),
      cleanupFixtures: () => this.#cleanupFixtures(),
    }).run();
  }

  #executeNode(node: ResolvedPlanNodeV1,
    outputs: ReadonlyMap<string, readonly ProducedOutputV1[]>): Promise<NodeExecution> {
    return executeRunnerNode({
      options: this.#options, authorityId: this.#authorityId, id: this.#id,
      executeAttempt: (next, attempt, values) => this.#executeAttempt(next, attempt, values),
    }, node, outputs);
  }

  async #executeAttempt(
    node: ResolvedPlanNodeV1,
    attemptNumber: number,
    outputs: ReadonlyMap<string, readonly ProducedOutputV1[]>,
  ): Promise<AttemptExecution> {
    const prepared = prepareRunnerAttempt({ options: this.#options, workspaceRoot: this.#workspaceRoot, id: this.#id },
      node, attemptNumber, outputs);
    const { attemptId, attemptRepository, stagingBase, evidenceDirectory, stagedEvidenceDirectory,
      stagedErrorEvidenceDirectory, runnerEvidenceDirectory, entry, granted, preparationFault,
      missingCapability, invocation } = prepared;
    const state = createRunnerProviderState();
    const providerResultLimit = this.#options.executionPolicy.provider.maximumResultBytes;
    const busterLog = createLogCapture(node.limits.logBytes);
    const retainAnyLog = entry.registration.evidenceTypes.includes("log") &&
      [...node.evidence.onPass, ...node.evidence.onFail, ...node.evidence.onError].includes("log");
    const cleanupTimeoutMs = this.#options.executionPolicy.provider.cleanupTimeoutMs;
    const operation = createRunnerProviderOperation({
      options: this.#options, node, entry, invocation, workspaceRoot: this.#workspaceRoot,
      attemptId, evidenceDirectory, stagedEvidenceDirectory, stagedErrorEvidenceDirectory,
      runnerEvidenceDirectory, granted, providerResultLimit, cleanupTimeoutMs, retainAnyLog, busterLog,
      loader: this.#loader, reportAdapterRuntime: this.#reportAdapterRuntime,
      context: (signal, log, grants, inputs) => this.#context(signal, log, grants, inputs),
      collectEvidence: (provider, id, directory, declarations, files, bytes, signal) =>
        this.#collectEvidence(provider, id, directory, declarations, files, bytes, signal),
    }, state, preparationFault, missingCapability);
    const issuedAt = this.#now();
    const workerEnvelope = createRunnerEnvelope({ options: this.#options, node, attemptId, attemptNumber,
      granted, cleanupTimeoutMs, providerResultLimit, invocation, operation, issuedAt });
    const { workerResult, workerRuntimeFault } = await executeRunnerAttempt({
      options: this.#options, workerRuntime: this.#workerRuntime, now: this.#now,
      id: this.#id, authorityId: this.#authorityId, completion: this.#completionOwner(),
    }, workerEnvelope, operation, stagingBase);
    return finalizeRunnerAttempt({ options: this.#options, now: this.#now, id: this.#id,
      authorityId: this.#authorityId, cleanupErrors: this.#cleanupErrors,
      cleanupProvider: (next, instance, value, log) => this.#cleanupProvider(next, instance, value, log),
    }, { prepared, state, node, attemptNumber, issuedAt, busterLog, workerResult, workerRuntimeFault });
  }

  #completionOwner(): CompletionOwner {
    return { options: this.#options, attemptStore: this.#durableAttemptStore,
      admissionStore: this.#observabilityAdmissionStore, authorityId: this.#authorityId, now: this.#now };
  }

  #context(
    signal: AbortSignal,
    log: TestProviderExecutionContext["log"],
    granted: ReadonlySet<string>,
    inputs: readonly ResolvedInputV1[],
  ): TestProviderExecutionContext {
    return Object.freeze({
      signal,
      workspaceRoot: this.#workspaceRoot,
      log,
      invoke: async (
        capability: string,
        request: TestProviderCapabilityRequest,
        invocationSignal?: AbortSignal,
      ) => {
        if (!granted.has(capability))
          throw new Error(`TEST_PROVIDER_CAPABILITY_DENIED:${capability}`);
        if (!this.#options.capabilityInvoker)
          throw new Error(`TEST_PROVIDER_CAPABILITY_UNAVAILABLE:${capability}`);
        return this.#options.capabilityInvoker.invoke(
          capability,
          request,
          invocationSignal ? AbortSignal.any([signal, invocationSignal]) : signal,
          inputs,
        );
      },
    });
  }

  async #collectEvidence(
    entry: TestProviderRegistryEntry,
    attemptId: string,
    evidenceDirectory: string,
    declarations: readonly DeclaredEvidenceV1[],
    maximumFiles: number,
    maximumBytes: number,
    signal: AbortSignal,
  ): Promise<EvidenceRefV1[]> {
    signal.throwIfAborted();
    if (declarations.length > maximumFiles)
      throw new Error("TEST_PROVIDER_ARTIFACT_FILE_LIMIT");
    const ids = new Set<string>();
    const files = new Set<string>();
    const evidence: EvidenceRefV1[] = [];
    let total = 0;
    for (const declaration of declarations) {
      signal.throwIfAborted();
      if (ids.has(declaration.evidenceId) || files.has(declaration.file))
        throw new Error(
          `TEST_PROVIDER_EVIDENCE_DUPLICATE:${declaration.evidenceId}`,
        );
      ids.add(declaration.evidenceId);
      files.add(declaration.file);
      if (!entry.registration.evidenceTypes.includes(declaration.type))
        throw new Error(
          `TEST_PROVIDER_EVIDENCE_TYPE_INVALID:${declaration.type}`,
        );
      const stored = await this.#store.store(
        attemptId,
        evidenceDirectory,
        declaration,
        maximumBytes - total,
        signal,
      );
      signal.throwIfAborted();
      total += stored.artifact.sizeBytes;
      if (total > maximumBytes)
        throw new Error("TEST_PROVIDER_ARTIFACT_BYTE_LIMIT");
      evidence.push(
        Object.freeze({
          evidenceId: declaration.evidenceId,
          type: declaration.type,
          artifact: stored.artifact,
        }),
      );
    }
    return evidence;
  }

  #fixtureOwner(): FixtureOwner {
    return { workspaceRoot: this.#workspaceRoot, cleanupErrors: this.#cleanupErrors,
      cleanupTimeoutMs: () => this.#options.executionPolicy.provider.cleanupTimeoutMs,
      context: (signal, log, grants, inputs) => this.#context(signal, log, grants, inputs) };
  }

  #cleanupProvider(node: ResolvedPlanNodeV1, instance: LoadedTestProvider,
    invocation: ProviderInvocationV1, log: TestProviderExecutionContext['log']): Promise<boolean> {
    return cleanupRetainedProvider(this.#fixtureOwner(), node, instance, invocation, log);
  }

  #cleanupFixtures(): Promise<void> {
    return cleanupRetainedFixtures(this.#fixtureOwner(), this.#retainedFixtures);
  }
}
