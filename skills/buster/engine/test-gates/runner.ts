import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  E2E_RESULT_SCHEMA_ID,
  validateE2eProviderDetails,
  validatePipelineTestGateContract,
  type AttemptResultV1,
  type DeclaredEvidenceV1,
  type EvidenceRefV1,
  type ExecutionState,
  type JsonValue,
  type NodeResultV1,
  type ProducedOutputV1,
  type ProviderInvocationV1,
  type ProviderResultV1,
  type ReceiptRefV1,
  type ReportAdapterRefV1,
  type ReportAdapterResultV1,
  type ResolvedInputV1,
  type ResolvedPlanNodeV1,
  type ResolvedTestPlanV1,
  type ResourceUseV1,
  type TerminalNodeState,
  type TestOutcome,
} from "@kubeclaw/pipeline-test-gate-contract";
import type {
  TestProviderCapabilityRequest,
  TestProviderExecutionContext,
} from "@kubeclaw/plugin-sdk";
import type {
  RegistrySnapshot,
  ReportAdapterRegistryEntry,
  TestProviderRegistryEntry,
} from "@kubeclaw/plugin-foundation/registry/types";
import type {
  WorkerAttemptEnvelopeV1,
  WorkerAttemptResultV1,
  WorkerProfileV1,
} from "@kubeclaw/pipeline-worker-core-contract";
import {
  WorkerAttemptExecutor,
  type WorkerAttemptOperation,
  type WorkerAttemptOperationResult,
} from "@kubeclaw/worker-core";
import { LocalWorkerRuntime } from "@kubeclaw/worker-core";
import {
  sha256Digest,
  workerAttemptResultDigest,
  workerAttemptSpecDigest,
  workerProfileDigest,
} from "@kubeclaw/worker-core";
import { producerRecordDigest } from "@kubeclaw/pipeline-observability-contract";
import { FileObservabilityAdmissionStore } from "@kubeclaw/plugin-foundation/observability/durable-delivery";
import {
  createProducerClosure,
  FileDurableAttemptStore,
  scopedEvidenceId,
} from "@kubeclaw/plugin-foundation/observability/durable-attempts";
import {
  FileEvidenceStore,
  stageEvidenceFiles,
  type EvidenceStore,
} from "./artifacts.ts";
import {
  RegisteredTestProviderLoader,
  type LoadedTestProvider,
  type TestProviderLoader,
} from "./provider-loader.ts";
import {
  FileReportArtifactReader,
  RegisteredReportAdapterRuntime,
  type ReportAdapterRuntimeLimits,
} from "./report-adapter-runtime.ts";

const EMPTY_COUNTS = Object.freeze({
  total: 0,
  passed: 0,
  failed: 0,
  skipped: 0,
});
const MAX_PROVIDER_RESULT_BYTES = 16 * 1024 * 1024;
const WORKER_RESULT_WRAPPER_BYTES = 4096;
const MAX_REPORT_RESULTS_BYTES = 16 * 1024 * 1024;
const MAX_TIMER_MS = 2_147_483_647;

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
  readonly artifactRoot: string;
  readonly observabilityRoot: string;
  readonly maximumConcurrency: number;
  readonly grants?: ReadonlyMap<string, readonly string[]>;
  readonly loader?: TestProviderLoader;
  readonly evidenceStore?: EvidenceStore;
  readonly capabilityInvoker?: TestProviderCapabilityInvoker;
  readonly signal?: AbortSignal;
  readonly cleanupTimeoutMs?: number;
  readonly maximumProviderResultBytes?: number;
  readonly now?: () => Date;
  readonly id?: () => string;
  readonly workerRuntime?: WorkerAttemptRuntime;
  readonly durableAttemptStore?: FileDurableAttemptStore;
  readonly observabilityAdmissionStore?: FileObservabilityAdmissionStore;
  readonly reportAdapterRuntime?: ReportAdapterExecutor;
}

export interface ReportAdapterExecutor {
  adapt(entry: ReportAdapterRegistryEntry, artifact: EvidenceRefV1['artifact'], limits: ReportAdapterRuntimeLimits,
    signal?: AbortSignal): Promise<ReportAdapterResultV1>;
}

export interface WorkerAttemptRuntime {
  runAttempt<T>(
    envelope: WorkerAttemptEnvelopeV1,
    execute: (signal: AbortSignal) => Promise<T>,
  ): Promise<T>;
}

interface AttemptExecution {
  readonly result: AttemptResultV1;
  readonly instance: LoadedTestProvider | null;
  readonly invocation: ProviderInvocationV1;
  readonly cleanupFailed: boolean;
}

interface NodeExecution {
  readonly result: NodeResultV1;
  readonly attempts: readonly AttemptResultV1[];
  readonly outputs: readonly ProducedOutputV1[];
  readonly retainedFixture: AttemptExecution | null;
}

interface LogCapture {
  readonly contextLog: TestProviderExecutionContext["log"];
  readonly bytes: () => number;
  readonly exceeded: () => boolean;
  readonly write: (directory: string) => DeclaredEvidenceV1 | null;
}

class RunnerFault extends Error {
  readonly state: Exclude<ExecutionState, "completed">;
  constructor(state: Exclude<ExecutionState, "completed">, message: string) {
    super(message);
    this.name = "RunnerFault";
    this.state = state;
  }
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => compareText(a, b))
    .map(([key, child]) => `${JSON.stringify(key)}:${canonical(child)}`)
    .join(",")}}`;
}

function digest(value: unknown): string {
  return `sha256:${crypto.createHash("sha256").update(canonical(value)).digest("hex")}`;
}

function freeze<T>(value: T): T {
  if (!value || typeof value !== "object") return value;
  for (const child of Object.values(value as Record<string, unknown>))
    freeze(child);
  return Object.isFrozen(value) ? value : Object.freeze(value);
}

function detail(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function containedRelative(
  rootValue: string,
  childValue: string,
  label: string,
): string {
  const root = fs.realpathSync(rootValue);
  const child = fs.realpathSync(childValue);
  const relative = path.relative(root, child).split(path.sep).join("/");
  if (relative === "" || relative === ".." || relative.startsWith("../"))
    throw new Error(`${label}_OUTSIDE_WORKSPACE`);
  return relative;
}

function secureDirectory(rootValue: string, label: string): string {
  const resolved = path.resolve(rootValue);
  const filesystemRoot = path.parse(resolved).root;
  let current = filesystemRoot;
  for (const part of path
    .relative(filesystemRoot, resolved)
    .split(path.sep)
    .filter(Boolean)) {
    current = path.join(current, part);
    try {
      const stat = fs.lstatSync(current);
      if (stat.isSymbolicLink()) throw new Error(`${label}_SYMLINK`);
      if (!stat.isDirectory()) throw new Error(`${label}_NOT_DIRECTORY`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      fs.mkdirSync(current);
      const created = fs.lstatSync(current);
      if (created.isSymbolicLink()) throw new Error(`${label}_SYMLINK`);
    }
  }
  return fs.realpathSync(resolved);
}

function assertPlanIdentity(
  plan: ResolvedTestPlanV1,
  registry: RegistrySnapshot,
): void {
  validatePipelineTestGateContract("resolvedTestPlan", plan);
  const { planDigest, ...unsigned } = plan;
  if (digest(unsigned) !== planDigest)
    throw new Error("TEST_PLAN_DIGEST_MISMATCH");
  if (plan.registrySnapshotDigest !== registry.snapshotDigest)
    throw new Error("TEST_PLAN_REGISTRY_SNAPSHOT_MISMATCH");
  for (const node of plan.nodes) {
    const entry = registry.testProviderContracts.get(node.provider.contractId);
    if (
      !entry ||
      canonical(entry.registration.package) !==
        canonical({
          packageId: node.provider.packageId,
          packageVersion: node.provider.packageVersion,
          contentDigest: node.provider.contentDigest,
        }) ||
      entry.registration.registrationId !== node.provider.registrationId
    ) {
      throw new Error(`TEST_PLAN_PROVIDER_IDENTITY_MISMATCH:${node.id}`);
    }
    for (const adapter of node.reportAdapters) {
      const adapterEntry = [...registry.reportAdapters.values()].find((candidate) =>
        candidate.registration.adapterId === adapter.adapterId
        && candidate.registration.format === adapter.format
        && candidate.registration.contractVersion === adapter.contractVersion
        && canonical(candidate.registration.package) === canonical(adapter.package));
      if (!adapterEntry) throw new Error(`TEST_PLAN_REPORT_ADAPTER_IDENTITY_MISMATCH:${node.id}:${adapter.format}`);
    }
  }
}

function createLogCapture(
  limit: number,
  onExceeded: () => void = () => undefined,
): LogCapture {
  let total = 0;
  let overLimit = false;
  const chunks: string[] = [];
  const contextLog: TestProviderExecutionContext["log"] = (stream, value) => {
    if (overLimit) return;
    const content =
      typeof value === "string" ? value : Buffer.from(value).toString("utf8");
    const line = `[${stream}] ${content}`;
    const size = Buffer.byteLength(line);
    total += size;
    if (total > limit) {
      if (!overLimit) {
        overLimit = true;
        onExceeded();
      }
      return;
    }
    chunks.push(line);
  };
  return {
    contextLog,
    bytes: () => total,
    exceeded: () => overLimit,
    write: (directory) => {
      if (chunks.length === 0) return null;
      fs.writeFileSync(path.join(directory, "provider.log"), chunks.join(""));
      return {
        evidenceId: "runner-log",
        type: "log",
        file: "provider.log",
        mediaType: "text/plain; charset=utf-8",
      };
    },
  };
}

function terminalResult(result: NodeResultV1): string {
  if (result.state === "completed") return result.outcome ?? "errored";
  if (result.state === "skipped") return "skipped";
  return result.state;
}

function providerEntry(
  registry: RegistrySnapshot,
  node: ResolvedPlanNodeV1,
): TestProviderRegistryEntry {
  const entry = registry.testProviderContracts.get(node.provider.contractId);
  if (!entry)
    throw new Error(`TEST_PROVIDER_MISSING:${node.provider.contractId}`);
  return entry;
}

function validateCounts(result: ProviderResultV1): void {
  const { total, passed, failed, skipped } = result.counts;
  if (total !== passed + failed + skipped)
    throw new Error("TEST_PROVIDER_COUNTS_INVALID");
  if (result.outcome === "passed" && failed !== 0)
    throw new Error("TEST_PROVIDER_OUTCOME_INVALID");
}

function validateProviderDetails(entry: TestProviderRegistryEntry, result: ProviderResultV1): void {
  if (entry.registration.contractId === 'kubeclaw.playwright@1') validateE2eProviderDetails(result.providerDetails);
  else if (result.providerDetails?.schemaId === E2E_RESULT_SCHEMA_ID) validateE2eProviderDetails(result.providerDetails);
}

function validateEvidenceDeclarations(
  entry: TestProviderRegistryEntry,
  files: readonly DeclaredEvidenceV1[],
): void {
  const ids = new Set<string>();
  const paths = new Set<string>();
  for (const file of files) {
    if (file.evidenceId === "runner-log")
      throw new Error("TEST_PROVIDER_EVIDENCE_ID_RESERVED:runner-log");
    if (!entry.registration.evidenceTypes.includes(file.type))
      throw new Error(`TEST_PROVIDER_EVIDENCE_TYPE_INVALID:${file.type}`);
    // One physical file has one evidence identity. This keeps file limits, selection, and storage ownership unambiguous.
    if (ids.has(file.evidenceId) || paths.has(file.file))
      throw new Error(`TEST_PROVIDER_EVIDENCE_DUPLICATE:${file.evidenceId}`);
    ids.add(file.evidenceId);
    paths.add(file.file);
  }
}

function validateProviderReports(entry: TestProviderRegistryEntry, result: ProviderResultV1): void {
  const ids = new Set<string>();
  for (const report of result.reports) {
    if (ids.has(report.evidenceId)) throw new Error(`TEST_PROVIDER_REPORT_DUPLICATE:${report.evidenceId}`);
    ids.add(report.evidenceId);
    if (!entry.registration.reportFormats.includes(report.format)) {
      throw new Error(`TEST_PROVIDER_REPORT_FORMAT_INVALID:${report.format}`);
    }
    const evidence = result.evidenceFiles.find((item) => item.evidenceId === report.evidenceId);
    if (!evidence) throw new Error(`TEST_PROVIDER_REPORT_EVIDENCE_MISSING:${report.evidenceId}`);
    if (evidence.type !== 'test-report') throw new Error(`TEST_PROVIDER_REPORT_EVIDENCE_TYPE_INVALID:${report.evidenceId}`);
  }
}

function reportAdapterEntry(registry: RegistrySnapshot, reference: ReportAdapterRefV1): ReportAdapterRegistryEntry {
  const entry = [...registry.reportAdapters.values()].find((candidate) =>
    candidate.registration.adapterId === reference.adapterId
    && candidate.registration.format === reference.format
    && candidate.registration.contractVersion === reference.contractVersion
    && canonical(candidate.registration.package) === canonical(reference.package));
  if (!entry) throw new Error(`TEST_REPORT_ADAPTER_MISSING:${reference.format}`);
  return entry;
}

function selectedEvidenceTypes(
  node: ResolvedPlanNodeV1,
  state: ExecutionState,
  outcome: TestOutcome,
): Set<string> {
  if (state !== "completed") return new Set(node.evidence.onError);
  return new Set(
    outcome === "failed" ? node.evidence.onFail : node.evidence.onPass,
  );
}

function receipt(
  authorityId: string,
  nonce: string,
  resultDigest: string,
): ReceiptRefV1 {
  const receiptId = `receipt:${crypto.createHash("sha256").update(`${authorityId}:${nonce}:${resultDigest}`).digest("hex")}`;
  return Object.freeze({
    receiptId,
    receiptDigest: digest({ authorityId, receiptId, resultDigest }),
  });
}

function resultIdentity(plan: ResolvedTestPlanV1, node: ResolvedPlanNodeV1) {
  return {
    planId: plan.planId,
    runId: plan.runId,
    moduleId: plan.scope.moduleId,
    gateId: plan.scope.gateId,
    suiteInstanceId: node.suiteInstanceId,
    nodeId: node.id,
    executionId: node.executionId,
    testIdentity: node.testIdentity,
    nodeKind: node.kind,
  } as const;
}

function finalNodeResult(
  plan: ResolvedTestPlanV1,
  node: ResolvedPlanNodeV1,
  attempts: readonly AttemptResultV1[],
  state: TerminalNodeState,
  outcome: TestOutcome,
  skipReason: string | null,
  authorityId: string,
  nonce: string,
): NodeResultV1 {
  const finalAttempt = attempts.at(-1) ?? null;
  const unstable =
    outcome === "passed" &&
    attempts
      .slice(0, -1)
      .some(
        (attempt) =>
          attempt.executionState !== "completed" ||
          attempt.outcome === "failed",
      );
  const unsigned = {
    schemaVersion: "node-result.v1" as const,
    ...resultIdentity(plan, node),
    mode: node.mode,
    state,
    outcome,
    attemptIds: attempts.map((attempt) => attempt.attemptId),
    finalAttemptId: finalAttempt?.attemptId ?? null,
    unstable,
    skipReason,
  };
  const resultDigest = digest(unsigned);
  const result: NodeResultV1 = {
    ...unsigned,
    resultDigest,
    receipt: receipt(authorityId, nonce, resultDigest),
  };
  validatePipelineTestGateContract("nodeResult", result);
  return freeze(result);
}

function invocationInputs(
  plan: ResolvedTestPlanV1,
  node: ResolvedPlanNodeV1,
  outputs: ReadonlyMap<string, readonly ProducedOutputV1[]>,
): ResolvedInputV1[] {
  return plan.links
    .filter((link) => link.to.nodeId === node.id)
    .sort((a, b) => compareText(a.to.input, b.to.input))
    .map((link) => {
      const output = outputs
        .get(link.from.nodeId)
        ?.find((item) => item.name === link.from.output);
      if (!output)
        throw new Error(
          `TEST_PLAN_LINK_OUTPUT_MISSING:${link.from.nodeId}:${link.from.output}`,
        );
      if (link.kind === "value" && output.kind === "value")
        return {
          name: link.to.input,
          kind: "value",
          schemaId: link.schemaId,
          value: structuredClone(output.value),
        };
      if (link.kind === "artifact" && output.kind === "artifact")
        return {
          name: link.to.input,
          kind: "artifact",
          artifact: output.artifact,
        };
      throw new Error(
        `TEST_PLAN_LINK_OUTPUT_MISMATCH:${link.from.nodeId}:${link.from.output}`,
      );
    });
}

function validateAndMapOutputs(
  entry: TestProviderRegistryEntry,
  result: ProviderResultV1,
  artifacts: ReadonlyMap<string, EvidenceRefV1>,
): ProducedOutputV1[] {
  const outputs: ProducedOutputV1[] = [];
  const seen = new Set<string>();
  for (const output of result.outputs) {
    if (seen.has(output.name))
      throw new Error(`TEST_PROVIDER_OUTPUT_DUPLICATE:${output.name}`);
    seen.add(output.name);
    const declaration = entry.registration.outputs.find(
      (item) => item.name === output.name,
    );
    if (!declaration || declaration.kind !== output.kind)
      throw new Error(`TEST_PROVIDER_OUTPUT_INVALID:${output.name}`);
    if (output.kind === "value" && declaration.kind === "value") {
      if (output.schemaId !== declaration.schemaId)
        throw new Error(`TEST_PROVIDER_OUTPUT_SCHEMA_INVALID:${output.name}`);
      outputs.push({
        name: output.name,
        kind: "value",
        schemaId: output.schemaId,
        value: structuredClone(output.value),
      });
    } else if (output.kind === "artifact" && declaration.kind === "artifact") {
      const evidence = artifacts.get(output.evidenceId);
      if (
        !evidence ||
        !declaration.mediaTypes.includes(evidence.artifact.mediaType)
      )
        throw new Error(`TEST_PROVIDER_OUTPUT_ARTIFACT_INVALID:${output.name}`);
      outputs.push({
        name: output.name,
        kind: "artifact",
        artifact: evidence.artifact,
      });
    }
  }
  for (const declaration of entry.registration.outputs) {
    if (declaration.required && !seen.has(declaration.name))
      throw new Error(`TEST_PROVIDER_OUTPUT_REQUIRED:${declaration.name}`);
  }
  return outputs;
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

function grantedCapabilities(
  options: {
    readonly registry: RegistrySnapshot;
    readonly grants: ReadonlyMap<string, readonly string[]> | undefined;
  },
  node: ResolvedPlanNodeV1,
): string[] {
  const entry = providerEntry(options.registry, node);
  const registrationId = `${entry.registration.package.packageId}:${entry.registration.registrationId}`;
  const configured = new Set(options.grants?.get(node.id) ?? options.grants?.get(registrationId) ?? []);
  return entry.registration.capabilities
    .filter((capability) => configured.has(capability))
    .sort();
}

function createBusterWorkerProfile(
  registry: RegistrySnapshot,
  granted: readonly string[],
): WorkerProfileV1 {
  const capabilities = [...new Set(["provider.execute", ...granted])].sort();
  const capabilityKey = crypto.createHash('sha256').update(capabilities.join('\0')).digest('hex').slice(0, 16);
  const base = {
    schemaVersion: "worker-profile.v1" as const,
    profileId: `buster.local.${capabilityKey}`,
    workerType: "buster",
    coreContractId: "kubeclaw.worker-core@1",
    engine: {
      engineId: "buster-test-engine",
      contractId: "kubeclaw.buster-engine@1",
      engineVersion: "1.0.0",
      contentDigest: registry.snapshotDigest,
    },
    capabilities,
  };
  return { ...base, profileDigest: workerProfileDigest(base) };
}

export function createBusterWorkerProfiles(
  plan: ResolvedTestPlanV1,
  registry: RegistrySnapshot,
  grants?: ReadonlyMap<string, readonly string[]>,
): WorkerProfileV1[] {
  const profiles = new Map<string, WorkerProfileV1>();
  for (const node of plan.nodes) {
    const granted = grantedCapabilities({ registry, grants }, node);
    const profile = createBusterWorkerProfile(registry, granted);
    profiles.set(profile.profileDigest, profile);
  }
  return [...profiles.values()].sort((left, right) =>
    compareText(left.profileDigest, right.profileDigest),
  );
}

export class TestPlanRunner {
  readonly #options: TestPlanRunnerOptions;
  readonly #loader: TestProviderLoader;
  readonly #store: EvidenceStore;
  readonly #now: () => Date;
  readonly #id: () => string;
  readonly #workspaceRoot: string;
  readonly #repositoryRelative: string;
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
    assertPlanIdentity(options.plan, options.registry);
    if (
      !Number.isSafeInteger(options.maximumConcurrency) ||
      options.maximumConcurrency < 1
    )
      throw new Error("TEST_RUNNER_CONCURRENCY_INVALID");
    if (
      options.cleanupTimeoutMs !== undefined &&
      (!Number.isSafeInteger(options.cleanupTimeoutMs) ||
        options.cleanupTimeoutMs < 1 ||
        options.cleanupTimeoutMs > MAX_TIMER_MS)
    ) {
      throw new Error("TEST_RUNNER_CLEANUP_TIMEOUT_INVALID");
    }
    if (
      options.maximumProviderResultBytes !== undefined &&
      (!Number.isSafeInteger(options.maximumProviderResultBytes) ||
        options.maximumProviderResultBytes < 1 ||
        options.maximumProviderResultBytes >
          Number.MAX_SAFE_INTEGER - WORKER_RESULT_WRAPPER_BYTES)
    ) {
      throw new Error("TEST_RUNNER_RESULT_LIMIT_INVALID");
    }
    if (
      !path.isAbsolute(options.workspaceRoot) ||
      !path.isAbsolute(options.repositoryRoot) ||
      !path.isAbsolute(options.artifactRoot) ||
      !path.isAbsolute(options.observabilityRoot)
    ) {
      throw new Error("TEST_RUNNER_PATH_NOT_ABSOLUTE");
    }
    fs.mkdirSync(options.workspaceRoot, { recursive: true });
    this.#workspaceRoot = fs.realpathSync(options.workspaceRoot);
    fs.mkdirSync(options.artifactRoot, { recursive: true });
    const artifactRoot = fs.realpathSync(options.artifactRoot);
    if (
      artifactRoot === this.#workspaceRoot ||
      artifactRoot.startsWith(`${this.#workspaceRoot}${path.sep}`) ||
      this.#workspaceRoot.startsWith(`${artifactRoot}${path.sep}`)
    ) {
      throw new Error("TEST_RUNNER_ARTIFACT_ROOT_OVERLAPS_WORKSPACE");
    }
    const observabilityRoot = secureDirectory(
      options.observabilityRoot,
      "TEST_RUNNER_OBSERVABILITY_ROOT",
    );
    if (
      observabilityRoot === this.#workspaceRoot ||
      observabilityRoot.startsWith(`${this.#workspaceRoot}${path.sep}`) ||
      this.#workspaceRoot.startsWith(`${observabilityRoot}${path.sep}`)
    )
      throw new Error("TEST_RUNNER_OBSERVABILITY_ROOT_OVERLAPS_WORKSPACE");
    if (options.durableAttemptStore)
      secureDirectory(
        options.durableAttemptStore.storageDirectory(),
        "TEST_RUNNER_ATTEMPT_STORE_ROOT",
      );
    if (options.observabilityAdmissionStore)
      secureDirectory(
        options.observabilityAdmissionStore.storageDirectory(),
        "TEST_RUNNER_ADMISSION_STORE_ROOT",
      );
    if (
      options.durableAttemptStore &&
      fs.realpathSync(options.durableAttemptStore.storageDirectory()) !==
        path.join(observabilityRoot, "attempts")
    )
      throw new Error("TEST_RUNNER_ATTEMPT_STORE_ROOT_MISMATCH");
    if (
      options.observabilityAdmissionStore &&
      fs.realpathSync(
        options.observabilityAdmissionStore.storageDirectory(),
      ) !== path.join(observabilityRoot, "admission")
    )
      throw new Error("TEST_RUNNER_ADMISSION_STORE_ROOT_MISMATCH");
    this.#repositoryRelative = containedRelative(
      this.#workspaceRoot,
      options.repositoryRoot,
      "TEST_RUNNER_REPOSITORY",
    );
    this.#options = { ...options, artifactRoot, observabilityRoot };
    this.#loader = options.loader ?? new RegisteredTestProviderLoader();
    this.#store = options.evidenceStore ?? new FileEvidenceStore(artifactRoot);
    this.#reportAdapterRuntime = options.reportAdapterRuntime ?? new RegisteredReportAdapterRuntime(
      new FileReportArtifactReader([artifactRoot]), path.join(observabilityRoot, 'report-adapters'));
    this.#customDurableAttemptStore = options.durableAttemptStore !== undefined;
    this.#durableAttemptStore =
      options.durableAttemptStore ??
      new FileDurableAttemptStore(path.join(observabilityRoot, "attempts"), {
        maximumEvidenceObjects: 10000,
        maximumEvidenceBytes: 10 * 1024 * 1024 * 1024,
        maximumEvidenceObjectBytes: 1024 * 1024 * 1024,
        maximumResults: 10000,
        maximumClosures: 10000,
        maximumMetadataBytes: 256 * 1024 * 1024,
        maximumPendingEvidenceAgeMs: 60 * 60 * 1000,
      });
    this.#observabilityAdmissionStore =
      options.observabilityAdmissionStore ??
      new FileObservabilityAdmissionStore(
        path.join(observabilityRoot, "admission"),
        {
          maximumIngressBytes: 16 * 1024 * 1024,
          maximumRecords: 10000,
          maximumBytes: 256 * 1024 * 1024,
          maximumQuarantineRecords: 1000,
          maximumQuarantineBytes: 64 * 1024 * 1024,
        },
      );
    this.#now = options.now ?? (() => new Date());
    this.#id = options.id ?? (() => crypto.randomUUID());
    this.#authorityId = `test-runner:${options.plan.planDigest}`;
    if (options.workerRuntime) {
      this.#workerRuntime = options.workerRuntime;
    } else {
      const runtime = new LocalWorkerRuntime({
        workerId: "worker:buster:local",
        workerType: "buster",
        coreVersion: "1.0.0",
        protocolVersions: ["worker-protocol.v1"],
        profiles: createBusterWorkerProfiles(
          options.plan,
          options.registry,
          options.grants,
        ),
        capacity: options.maximumConcurrency,
        now: this.#now,
      });
      runtime.markReady();
      this.#workerRuntime = runtime;
    }
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
      recoveredCompletions = await this.#resumePendingCompletions();
    if (recoveredCompletions > 0)
      throw new Error(
        `TEST_RUNNER_RECOVERY_OWNED_BY_NOVA:${recoveredCompletions}`,
      );
    const attempts: AttemptResultV1[] = [];
    const results = new Map<string, NodeResultV1>();
    const outputs = new Map<string, readonly ProducedOutputV1[]>();
    const running = new Map<string, Promise<NodeExecution>>();
    const groupUse = new Map<string, number>();
    const pending = new Map(
      this.#options.plan.nodes.map((node) => [node.id, node]),
    );
    try {
      while (pending.size > 0 || running.size > 0) {
        let progressed = false;
        for (const node of [...pending.values()].sort((a, b) =>
          compareText(a.id, b.id),
        )) {
          if (node.skipReason !== null) {
            const result = finalNodeResult(
              this.#options.plan,
              node,
              [],
              "skipped",
              "skipped",
              node.skipReason,
              this.#authorityId,
              this.#id(),
            );
            results.set(node.id, result);
            pending.delete(node.id);
            progressed = true;
            continue;
          }
          if (this.#options.signal?.aborted) {
            const result = finalNodeResult(
              this.#options.plan,
              node,
              [],
              "cancelled",
              null,
              null,
              this.#authorityId,
              this.#id(),
            );
            results.set(node.id, result);
            pending.delete(node.id);
            progressed = true;
            continue;
          }
          if (
            !node.dependencies.every((dependency) =>
              results.has(dependency.nodeId),
            )
          )
            continue;
          const rejected = node.dependencies.find(
            (dependency) =>
              !dependency.acceptedResults.includes(
                terminalResult(results.get(dependency.nodeId)!) as never,
              ),
          );
          if (rejected) {
            const reason = `dependency ${rejected.nodeId} returned ${terminalResult(results.get(rejected.nodeId)!)}`;
            const result = finalNodeResult(
              this.#options.plan,
              node,
              [],
              "skipped",
              "skipped",
              reason,
              this.#authorityId,
              this.#id(),
            );
            results.set(node.id, result);
            pending.delete(node.id);
            progressed = true;
            continue;
          }
          if (running.size >= this.#options.maximumConcurrency) continue;
          if (node.concurrencyGroup !== null) {
            const limit =
              this.#options.plan.concurrencyLimits[node.concurrencyGroup];
            if (limit === undefined)
              throw new Error(
                `TEST_RUNNER_CONCURRENCY_GROUP_MISSING:${node.concurrencyGroup}`,
              );
            if ((groupUse.get(node.concurrencyGroup) ?? 0) >= limit) continue;
            groupUse.set(
              node.concurrencyGroup,
              (groupUse.get(node.concurrencyGroup) ?? 0) + 1,
            );
          }
          pending.delete(node.id);
          const task = this.#executeNode(node, outputs).finally(() => {
            if (node.concurrencyGroup !== null)
              groupUse.set(
                node.concurrencyGroup,
                (groupUse.get(node.concurrencyGroup) ?? 1) - 1,
              );
          });
          running.set(node.id, task);
          progressed = true;
        }
        if (running.size > 0) {
          const completed = await Promise.race(
            [...running.entries()].map(async ([id, task]) => ({
              id,
              execution: await task,
            })),
          );
          running.delete(completed.id);
          results.set(completed.id, completed.execution.result);
          attempts.push(...completed.execution.attempts);
          outputs.set(completed.id, completed.execution.outputs);
          if (completed.execution.retainedFixture)
            this.#retainedFixtures.push({
              node: this.#options.plan.nodes.find(
                (item) => item.id === completed.id,
              )!,
              execution: completed.execution.retainedFixture,
            });
          progressed = true;
        }
        if (!progressed) throw new Error("TEST_RUNNER_DEADLOCK");
      }
    } finally {
      await this.#cleanupFixtures();
    }
    for (const failure of this.#cleanupErrors) {
      const node = this.#options.plan.nodes.find(
        (item) => item.id === failure.nodeId,
      );
      if (!node) continue;
      const current = results.get(node.id);
      if (
        !current ||
        current.state === "skipped" ||
        current.state === "cancelled"
      )
        continue;
      results.set(
        node.id,
        finalNodeResult(
          this.#options.plan,
          node,
          attempts.filter((attempt) => attempt.nodeId === node.id),
          "errored",
          null,
          null,
          this.#authorityId,
          this.#id(),
        ),
      );
    }
    return freeze({
      planId: this.#options.plan.planId,
      runId: this.#options.plan.runId,
      attempts: attempts.sort((a, b) => compareText(a.attemptId, b.attemptId)),
      nodes: [...results.values()].sort((a, b) =>
        compareText(a.nodeId, b.nodeId),
      ),
      cleanupErrors: [...this.#cleanupErrors],
    });
  }

  async #resumePendingCompletions(): Promise<number> {
    const snapshot = await this.#durableAttemptStore.snapshot();
    const closed = new Set(
      snapshot.closures.map(
        (item) => `${item.pipelineRunId}\0${item.closureId}`,
      ),
    );
    const current = snapshot.results.filter(
      (stored) =>
        stored.pipelineRunId === this.#options.plan.runId &&
        stored.planId === this.#options.plan.planId,
    );
    const newestGeneration = new Map<string, number>();
    for (const stored of current)
      newestGeneration.set(
        stored.attemptId,
        Math.max(
          newestGeneration.get(stored.attemptId) ?? 0,
          stored.claimGeneration,
        ),
      );
    let recovered = 0;
    for (const stored of current) {
      if (
        stored.claimGeneration <
        (newestGeneration.get(stored.attemptId) ?? 0)
      )
        continue;
      recovered += 1;
      if (
        !stored.completionIntent ||
        closed.has(
          `${stored.pipelineRunId}\0${stored.completionIntent.closure.closureId}`,
        )
      )
        continue;
      if (typeof stored.storedAt !== "string") continue;
      await this.#durableAttemptStore.resumeCompletion(
        stored.pipelineRunId,
        stored.attemptId,
        stored.claimGeneration,
        this.#observabilityAdmissionStore,
      );
    }
    return recovered;
  }

  async #readManagedEvidence(
    storageUrl: string,
    maximumBytes: number,
  ): Promise<Buffer> {
    const source = new URL(storageUrl);
    if (source.protocol !== "file:")
      throw new Error(
        `OBSERVABILITY_EVIDENCE_STORAGE_UNSUPPORTED:${source.protocol}`,
      );
    const candidate = fs.realpathSync(source);
    const root = this.#options.artifactRoot;
    if (candidate !== root && !candidate.startsWith(`${root}${path.sep}`))
      throw new Error("OBSERVABILITY_EVIDENCE_PATH_FORBIDDEN");
    const handle = await fs.promises.open(
      candidate,
      fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK,
    );
    try {
      const opened = await handle.stat();
      const currentPath = fs.realpathSync(candidate);
      if (currentPath !== root && !currentPath.startsWith(`${root}${path.sep}`))
        throw new Error("OBSERVABILITY_EVIDENCE_PATH_FORBIDDEN");
      const current = fs.statSync(currentPath);
      if (
        !opened.isFile() ||
        opened.dev !== current.dev ||
        opened.ino !== current.ino
      )
        throw new Error("OBSERVABILITY_EVIDENCE_PATH_FORBIDDEN");
      if (opened.size > maximumBytes)
        throw new Error("OBSERVABILITY_EVIDENCE_OBJECT_TOO_LARGE");
      const content = await handle.readFile();
      if (content.byteLength > maximumBytes)
        throw new Error("OBSERVABILITY_EVIDENCE_OBJECT_TOO_LARGE");
      return content;
    } finally {
      await handle.close();
    }
  }

  async #executeNode(
    node: ResolvedPlanNodeV1,
    outputs: ReadonlyMap<string, readonly ProducedOutputV1[]>,
  ): Promise<NodeExecution> {
    const attempts: AttemptResultV1[] = [];
    let finalExecution: AttemptExecution | null = null;
    let cleanupFailed = false;
    const maximumAttempts = node.retryCount + 1;
    for (
      let attemptNumber = 1;
      attemptNumber <= maximumAttempts;
      attemptNumber += 1
    ) {
      const execution = await this.#executeAttempt(
        node,
        attemptNumber,
        outputs,
      );
      attempts.push(execution.result);
      finalExecution = execution;
      const retry =
        execution.result.executionState !== "cancelled" &&
        !this.#options.signal?.aborted &&
        (execution.result.executionState !== "completed" ||
          execution.result.outcome === "failed") &&
        attemptNumber < maximumAttempts;
      cleanupFailed = execution.cleanupFailed;
      if (cleanupFailed || !retry) break;
    }
    if (!finalExecution)
      throw new Error(`TEST_RUNNER_ATTEMPT_MISSING:${node.id}`);
    const final = finalExecution.result;
    const state = cleanupFailed ? "errored" : final.executionState;
    const result = finalNodeResult(
      this.#options.plan,
      node,
      attempts,
      state,
      cleanupFailed ? null : final.outcome,
      null,
      this.#authorityId,
      this.#id(),
    );
    return {
      result,
      attempts,
      outputs: final.outputs,
      retainedFixture:
        !cleanupFailed &&
        node.kind === "fixture" &&
        state === "completed" &&
        final.outcome === "passed"
          ? finalExecution
          : null,
    };
  }

  async #executeAttempt(
    node: ResolvedPlanNodeV1,
    attemptNumber: number,
    outputs: ReadonlyMap<string, readonly ProducedOutputV1[]>,
  ): Promise<AttemptExecution> {
    const attemptId = `attempt:${crypto.createHash("sha256").update(`${node.executionId}:${attemptNumber}:${this.#id()}`).digest("hex")}`;
    const attemptDirectory = path.join(
      this.#workspaceRoot,
      "test-attempts",
      attemptId.slice("attempt:".length),
    );
    const scratchDirectory = path.join(attemptDirectory, "scratch");
    const attemptRepository = path.join(attemptDirectory, "repository");
    const evidenceDirectory = path.join(attemptDirectory, "evidence");
    const stagingRoot = path.join(this.#options.artifactRoot, ".staging");
    fs.mkdirSync(stagingRoot, { recursive: true });
    const stagingBase = fs.mkdtempSync(
      path.join(stagingRoot, `${attemptId.slice("attempt:".length)}-`),
    );
    const stagedEvidenceDirectory = path.join(stagingBase, "selected");
    const stagedErrorEvidenceDirectory = path.join(stagingBase, "error");
    const runnerEvidenceDirectory = path.join(
      attemptDirectory,
      "runner-evidence",
    );
    fs.mkdirSync(scratchDirectory, { recursive: true });
    fs.mkdirSync(evidenceDirectory, { recursive: true });
    fs.mkdirSync(runnerEvidenceDirectory, { recursive: true });
    fs.cpSync(this.#options.repositoryRoot, attemptRepository, {
      recursive: true,
      errorOnExist: true,
      force: false,
      verbatimSymlinks: true,
    });
    const attemptRepositoryRelative = containedRelative(
      this.#workspaceRoot,
      attemptRepository,
      "TEST_RUNNER_ATTEMPT_REPOSITORY",
    );
    const entry = providerEntry(this.#options.registry, node);
    const granted = grantedCapabilities(
      { registry: this.#options.registry, grants: this.#options.grants },
      node,
    );
    const missingCapability = entry.registration.capabilities.find(
      (capability) => !granted.includes(capability),
    );
    let resolvedInputs: ResolvedInputV1[] = [];
    let preparationFault: RunnerFault | null = null;
    try {
      resolvedInputs = invocationInputs(this.#options.plan, node, outputs);
    } catch (error) {
      preparationFault = new RunnerFault("errored", detail(error));
    }
    const invocation: ProviderInvocationV1 = {
      schemaVersion: "provider-invocation.v1",
      ...resultIdentity(this.#options.plan, node),
      attemptId,
      attemptNumber,
      provider: node.provider,
      configuration: node.configuration,
      inputs: resolvedInputs,
      evidence: node.evidence,
      grantedCapabilities: granted,
      timeoutMs: node.timeoutMs,
      limits: node.limits,
      workspace: {
        repository: attemptRepositoryRelative,
        scratch: path
          .relative(this.#workspaceRoot, scratchDirectory)
          .split(path.sep)
          .join("/"),
        evidence: path
          .relative(this.#workspaceRoot, evidenceDirectory)
          .split(path.sep)
          .join("/"),
      },
    };
    validatePipelineTestGateContract("providerInvocation", invocation);
    let instance: LoadedTestProvider | null = null;
    let providerResult: ProviderResultV1 | null = null;
    let producedOutputs: ProducedOutputV1[] = [];
    let retainFixture = false;
    let stagedFiles: DeclaredEvidenceV1[] = [];
    let stagedErrorFiles: DeclaredEvidenceV1[] = [];
    let stagingWork: Promise<void> | null = null;
    let loadWork: Promise<LoadedTestProvider> | null = null;
    let executionStarted = false;
    let fixtureInitializationStarted = false;
    let evidenceFault: string | null = null;
    const providerResultLimit =
      this.#options.maximumProviderResultBytes ?? MAX_PROVIDER_RESULT_BYTES;
    const busterLog = createLogCapture(node.limits.logBytes);
    const retainAnyLog =
      entry.registration.evidenceTypes.includes("log") &&
      [
        ...node.evidence.onPass,
        ...node.evidence.onFail,
        ...node.evidence.onError,
      ].includes("log");
    const cleanupTimeoutMs = this.#options.cleanupTimeoutMs ?? 30_000;
    const operation: WorkerAttemptOperation = {
      prepare: () => {
        if (preparationFault) throw preparationFault;
        if (missingCapability)
          throw new Error(
            `TEST_PROVIDER_CAPABILITY_DENIED:${missingCapability}`,
          );
        return undefined;
      },
      execute: async (workerContext): Promise<WorkerAttemptOperationResult> => {
        const context = this.#context(
          workerContext.signal,
          (stream, value) => {
            busterLog.contextLog(stream, value);
            workerContext.log(stream, value);
          },
          new Set(granted),
          invocation.inputs,
        );
        loadWork = this.#loader.load(
          entry,
          invocation,
          this.#workspaceRoot,
          workerContext.signal,
        );
        instance = await loadWork;
        if (workerContext.signal.aborted)
          throw (
            workerContext.signal.reason ?? new Error("TEST_PROVIDER_CANCELLED")
          );
        if (node.kind === "fixture") {
          fixtureInitializationStarted = true;
          const supportsCleanup = await instance.supportsCleanup(context);
          if (workerContext.signal.aborted)
            throw (
              workerContext.signal.reason ??
              new Error("TEST_PROVIDER_CANCELLED")
            );
          if (!supportsCleanup)
            throw new Error("TEST_PROVIDER_FIXTURE_CLEANUP_REQUIRED");
        }
        if (workerContext.signal.aborted)
          throw (
            workerContext.signal.reason ?? new Error("TEST_PROVIDER_CANCELLED")
          );
        executionStarted = true;
        providerResult = await instance.execute(invocation, context);
        const encoded = JSON.stringify(providerResult);
        if (Buffer.byteLength(encoded) > providerResultLimit)
          throw new Error("TEST_PROVIDER_RESULT_LIMIT");
        validatePipelineTestGateContract("providerResult", providerResult);
        validateCounts(providerResult);
        validateProviderDetails(entry, providerResult);
        validateEvidenceDeclarations(entry, providerResult.evidenceFiles);
        validateProviderReports(entry, providerResult);
        providerResult = freeze(structuredClone(providerResult));
        const stagedTypes = selectedEvidenceTypes(
          node,
          "completed",
          providerResult.outcome,
        );
        for (const output of providerResult.outputs)
          if (output.kind === "artifact") {
            const declaration = providerResult.evidenceFiles.find(
              (item) => item.evidenceId === output.evidenceId,
            );
            if (!declaration)
              throw new Error(
                `TEST_PROVIDER_OUTPUT_EVIDENCE_MISSING:${output.evidenceId}`,
              );
            stagedTypes.add(declaration.type);
          }
        for (const report of providerResult.reports) stagedTypes.add(
          providerResult.evidenceFiles.find((item) => item.evidenceId === report.evidenceId)!.type,
        );
        stagingWork = (async () => {
          const errorCandidates = providerResult!.evidenceFiles.filter((item) =>
            node.evidence.onError.includes(item.type),
          );
          try {
            await stageEvidenceFiles(
              evidenceDirectory,
              stagedErrorEvidenceDirectory,
              errorCandidates,
              node.limits.artifactFiles,
              node.limits.artifactBytes,
              workerContext.signal,
            );
            stagedErrorFiles = errorCandidates;
          } catch (error) {
            await fs.promises.rm(stagedErrorEvidenceDirectory, {
              recursive: true,
              force: true,
            });
            stagedErrorFiles = [];
            if (workerContext.signal.aborted) throw error;
          }
          stagedFiles = providerResult!.evidenceFiles.filter((item) =>
            stagedTypes.has(item.type),
          );
          await stageEvidenceFiles(
            evidenceDirectory,
            stagedEvidenceDirectory,
            stagedFiles,
            node.limits.artifactFiles,
            node.limits.artifactBytes,
            workerContext.signal,
          );
        })();
        await stagingWork;
        retainFixture =
          node.kind === "fixture" && providerResult.outcome === "passed";
        return {
          summary: providerResult.summary,
          specialistResult: {
            schemaId: "kubeclaw.buster-provider-result.v1",
            schemaDigest: sha256Digest({
              schemaId: "kubeclaw.buster-provider-result.v1",
            }),
            values: {
              providerResult: structuredClone(providerResult),
            } as never,
          },
          evidence: [],
          exitCode: providerResult.exitCode,
          signal: providerResult.signal,
        };
      },
      terminate: async () => {
        const loaded = instance ?? (await loadWork?.catch(() => null));
        await loaded?.terminate();
        await stagingWork?.catch(() => undefined);
      },
      measure: async () => {
        const measured = instance?.resources() ?? {
          cpuTimeMs: 0,
          maximumMemoryBytes: 0,
          maximumProcesses: 0,
        };
        return {
          cpuTimeMs: Math.ceil(measured.cpuTimeMs ?? 0),
          maximumMemoryBytes: Math.ceil(measured.maximumMemoryBytes ?? 0),
          maximumProcesses: Math.ceil(measured.maximumProcesses ?? 0),
        };
      },
      cleanup: async (workerContext) => {
        if (!executionStarted && !fixtureInitializationStarted) {
          await instance?.discard?.();
          return;
        }
        if (!instance?.cleanup || retainFixture)
          return;
        await instance.cleanup(
          invocation,
          this.#context(
            workerContext.signal,
            (stream, value) => {
              busterLog.contextLog(stream, value);
              workerContext.log(stream, value);
            },
            new Set(granted),
            invocation.inputs,
          ),
        );
      },
      collectEvidence: async ({ state }) => {
        const workerExecutionState: ExecutionState =
          state === "interrupted" ? "errored" : state;
        const workerOutcome: TestOutcome =
          workerExecutionState === "completed" && providerResult
            ? providerResult.outcome
            : null;
        const selected = selectedEvidenceTypes(
          node,
          workerExecutionState,
          workerOutcome,
        );
        let evidence: EvidenceRefV1[] = [];
        try {
          if (workerExecutionState === "completed" && providerResult) {
            for (const output of providerResult.outputs)
              if (output.kind === "artifact") {
                const declaration = providerResult.evidenceFiles.find(
                  (item) => item.evidenceId === output.evidenceId,
                );
                if (!declaration)
                  throw new Error(
                    `TEST_PROVIDER_OUTPUT_EVIDENCE_MISSING:${output.evidenceId}`,
                  );
                selected.add(declaration.type);
              }
            for (const report of providerResult.reports) selected.add(
              providerResult.evidenceFiles.find((item) => item.evidenceId === report.evidenceId)!.type,
            );
          }
          const useErrorStaging = workerExecutionState !== "completed";
          const selectedFiles = (
            useErrorStaging ? stagedErrorFiles : stagedFiles
          ).filter((item) => selected.has(item.type));
          evidence = await this.#collectEvidence(
            entry,
            attemptId,
            useErrorStaging
              ? stagedErrorEvidenceDirectory
              : stagedEvidenceDirectory,
            selectedFiles,
            node.limits.artifactFiles,
            node.limits.artifactBytes,
          );
          if (workerExecutionState === "completed" && providerResult) {
            producedOutputs = validateAndMapOutputs(
              entry,
              providerResult,
              new Map(evidence.map((item) => [item.evidenceId, item])),
            );
          }
          const logEvidence =
            retainAnyLog && selected.has("log")
              ? busterLog.write(runnerEvidenceDirectory)
              : null;
          if (logEvidence) {
            const logRefs = await this.#collectEvidence(
              entry,
              attemptId,
              runnerEvidenceDirectory,
              [logEvidence],
              node.limits.artifactFiles - evidence.length,
              node.limits.artifactBytes -
                evidence.reduce(
                  (sum, item) => sum + item.artifact.sizeBytes,
                  0,
                ),
            );
            evidence.push(...logRefs);
          }
        } catch (error) {
          evidenceFault = detail(error);
          producedOutputs = [];
          evidence = [];
          if (stagedErrorFiles.length > 0) {
            try {
              evidence = await this.#collectEvidence(
                entry,
                attemptId,
                stagedErrorEvidenceDirectory,
                stagedErrorFiles,
                node.limits.artifactFiles,
                node.limits.artifactBytes,
              );
            } catch {
              evidence = [];
            }
          }
          if (retainAnyLog && node.evidence.onError.includes("log")) {
            try {
              const logEvidence = busterLog.write(runnerEvidenceDirectory);
              if (logEvidence) {
                const logRefs = await this.#collectEvidence(
                  entry,
                  attemptId,
                  runnerEvidenceDirectory,
                  [logEvidence],
                  node.limits.artifactFiles - evidence.length,
                  node.limits.artifactBytes -
                    evidence.reduce(
                      (sum, item) => sum + item.artifact.sizeBytes,
                      0,
                    ),
                );
                evidence.push(...logRefs);
              }
            } catch {
              evidence = [];
            }
          }
        }
        return { evidence, ...(evidenceFault ? { error: evidenceFault } : {}) };
      },
      finalizeResult: async ({ evidence, specialistResult, signal }) => {
        if (node.provider.contractId === 'kubeclaw.direct-command@1'
          && node.configuration.values.resultMode === 'exit-code') return specialistResult;
        if (!providerResult || providerResult.reports.length === 0) return specialistResult;
        const evidenceById = new Map(evidence.map((item) => [item.evidenceId, item]));
        const reports: ReportAdapterResultV1[] = [];
        for (const declared of providerResult.reports) {
          const usedReportBytes = Buffer.byteLength(JSON.stringify(reports));
          const remainingReportBytes = MAX_REPORT_RESULTS_BYTES - usedReportBytes;
          if (remainingReportBytes < 1) throw new Error('TEST_REPORT_RESULT_LIMIT');
          const source = evidenceById.get(declared.evidenceId);
          if (!source) throw new Error(`TEST_PROVIDER_REPORT_NOT_RETAINED:${declared.evidenceId}`);
          const reference = node.reportAdapters.find((item) => item.format === declared.format);
          if (!reference) throw new Error(`TEST_REPORT_ADAPTER_NOT_RESOLVED:${declared.format}`);
          const adapter = reportAdapterEntry(this.#options.registry, reference);
          const maximumSourceBytes = Math.max(1, Math.min(64 * 1024 * 1024, source.artifact.sizeBytes));
          const adapterTimeoutMs = Math.min(5 * 60 * 1_000, cleanupTimeoutMs);
          reports.push(await this.#reportAdapterRuntime.adapt(adapter, source.artifact, {
            maximumCases: 5_000,
            maximumFindings: 5_000,
            maximumCaseFindings: 100,
            maximumSourceBytes,
            maximumResultBytes: remainingReportBytes,
            timeoutMs: adapterTimeoutMs,
            memoryBytes: 512 * 1024 * 1024,
            cpuMillis: Math.max(1_000, Math.floor(adapterTimeoutMs / 1_000) * 1_000),
            openFiles: 64,
          }, signal));
          if (Buffer.byteLength(JSON.stringify(reports)) > MAX_REPORT_RESULTS_BYTES) {
            throw new Error('TEST_REPORT_RESULT_LIMIT');
          }
        }
        const providerValue = specialistResult.values.providerResult as unknown as ProviderResultV1;
        if (node.provider.contractId !== 'kubeclaw.direct-command@1') {
          return {
            ...specialistResult,
            values: { ...specialistResult.values, reports: structuredClone(reports) } as never,
          };
        }
        const reportCounts = reports.reduce((counts, report) => ({
          total: counts.total + report.counts.total,
          passed: counts.passed + report.counts.passed,
          failed: counts.failed + report.counts.failed,
          skipped: counts.skipped + report.counts.skipped,
          errored: counts.errored + report.counts.errored,
        }), { total: 0, passed: 0, failed: 0, skipped: 0, errored: 0 });
        if (reportCounts.total === 0) throw new Error('TEST_REPORT_ZERO_CASES');
        const reportFailed = reportCounts.failed + reportCounts.errored;
        const commandFailed = providerValue.outcome === 'failed';
        const commandFailureChecks = commandFailed && reportFailed === 0 ? 1 : 0;
        const finalizedProvider: ProviderResultV1 = {
          ...providerValue,
          outcome: commandFailed || reportFailed > 0 ? 'failed' : 'passed',
          counts: {
            total: reportCounts.total + commandFailureChecks,
            passed: reportCounts.passed,
            failed: reportFailed + commandFailureChecks,
            skipped: reportCounts.skipped,
          },
          findings: [...providerValue.findings, ...reports.flatMap((report) => report.findings)],
          summary: providerValue.outcome === 'failed'
            ? providerValue.summary
            : reportFailed > 0
              ? `${reportFailed} JUnit case(s) failed or errored.`
              : `${reportCounts.total} JUnit case(s) passed.`,
        };
        validateCounts(finalizedProvider);
        return {
          ...specialistResult,
          values: { ...specialistResult.values, providerResult: finalizedProvider,
            reports: structuredClone(reports) } as never,
        };
      },
    };
    const issuedAt = this.#now();
    const profile = createBusterWorkerProfile(this.#options.registry, granted);
    const claimWindowMs = node.timeoutMs + 4 * cleanupTimeoutMs + 60_000;
    const envelopeBase = {
      schemaVersion: "worker-attempt-envelope.v1" as const,
      protocolVersion: "worker-protocol.v1" as const,
      pipelineRunId: this.#options.plan.runId,
      moduleId: this.#options.plan.scope.moduleId,
      gateId: this.#options.plan.scope.gateId,
      planId: this.#options.plan.planId,
      nodeId: node.id,
      executionId: node.executionId,
      attemptId,
      attemptNumber,
      claim: {
        schemaVersion: "attempt-claim.v1" as const,
        claimId: `claim:${attemptId}`,
        attemptId,
        generation: 1,
        workerId: "worker:buster:local",
        claimedAt: issuedAt.toISOString(),
        expiresAt: new Date(issuedAt.getTime() + claimWindowMs).toISOString(),
      },
      profile,
      packages: [
        {
          packageId: node.provider.packageId,
          packageVersion: node.provider.packageVersion,
          contentDigest: node.provider.contentDigest,
        },
      ],
      grantedCapabilities: granted,
      limits: {
        timeoutMs: node.timeoutMs,
        cleanupTimeoutMs,
        cpuMillis: node.limits.cpuMillis,
        memoryBytes: node.limits.memoryBytes,
        processes: node.limits.processes,
        logBytes: node.limits.logBytes,
        resultBytes: providerResultLimit + MAX_REPORT_RESULTS_BYTES + WORKER_RESULT_WRAPPER_BYTES,
        evidenceBytes: node.limits.artifactBytes,
        evidenceFiles: node.limits.artifactFiles,
      },
      inputs: [],
      operation: {
        contractId: "kubeclaw.buster-provider-attempt@1",
        inputSchemaId: "kubeclaw.buster-provider-attempt.v1",
        inputSchemaDigest: sha256Digest({
          schemaId: "kubeclaw.buster-provider-attempt.v1",
        }),
        values: { invocation: structuredClone(invocation) } as never,
      },
      cancellationId: `cancel:${attemptId}`,
      issuedAt: issuedAt.toISOString(),
      queueDeadline: new Date(issuedAt.getTime() + 60_000).toISOString(),
    };
    const workerEnvelope: WorkerAttemptEnvelopeV1 = {
      ...envelopeBase,
      attemptSpecDigest: workerAttemptSpecDigest({
        ...envelopeBase,
        attemptSpecDigest: "",
      }),
    };
    let workerResult: WorkerAttemptResultV1 | null = null;
    let completedWorkerResult: WorkerAttemptResultV1 | null = null;
    let workerRuntimeFault: string | null = null;
    try {
      workerResult = await this.#workerRuntime.runAttempt(
        workerEnvelope,
        async (workerSignal) => {
          const signals = [
            workerSignal,
            ...(this.#options.signal ? [this.#options.signal] : []),
          ];
          const signal =
            signals.length === 1 ? workerSignal : AbortSignal.any(signals);
          completedWorkerResult = await new WorkerAttemptExecutor({
            envelope: workerEnvelope,
            operation,
            signal,
            retainLogs: false,
            now: this.#now,
            id: this.#id,
            receiptNamespace: this.#authorityId,
          }).execute();
          return completedWorkerResult;
        },
      );
      if (
        !workerResult ||
        !completedWorkerResult ||
        canonical(workerResult) !== canonical(completedWorkerResult)
      )
        throw new Error("WORKER_RUNTIME_RESULT_MISMATCH");
      workerResult = await this.#persistWorkerCompletion(
        workerEnvelope,
        workerResult,
      );
      completedWorkerResult = workerResult;
    } catch (error) {
      workerRuntimeFault = detail(error);
      workerResult = completedWorkerResult;
    } finally {
      await fs.promises.rm(stagingBase, { recursive: true, force: true });
    }
    const completedProviderResult = (workerResult?.specialistResult?.values?.providerResult
      ?? providerResult) as ProviderResultV1 | null;
    let retainedFaultCleanupFailed = false;
    if (
      retainFixture &&
      (workerRuntimeFault || workerResult?.state !== "completed") &&
      instance
    ) {
      retainedFaultCleanupFailed = !(await this.#cleanupProvider(
        node,
        instance,
        invocation,
        busterLog.contextLog,
      ));
      retainFixture = false;
    }
    const workerExecutionState: ExecutionState = workerRuntimeFault
      ? this.#options.signal?.aborted
        ? "cancelled"
        : "errored"
      : workerResult?.state === "interrupted"
        ? "errored"
        : (workerResult?.state ?? "errored");
    const workerOutcome: TestOutcome =
      workerExecutionState === "completed"
        ? completedProviderResult!.outcome
        : null;
    const evidence = (workerResult?.evidence ?? []) as EvidenceRefV1[];
    if (workerExecutionState === "completed" && completedProviderResult) {
      try {
        producedOutputs = validateAndMapOutputs(
          entry,
          completedProviderResult,
          new Map(evidence.map((item) => [item.evidenceId, item])),
        );
      } catch (error) {
        evidenceFault = detail(error);
        producedOutputs = [];
      }
    }
    const executionState: ExecutionState = evidenceFault
      ? "errored"
      : workerExecutionState;
    const outcome: TestOutcome =
      executionState === "completed" ? workerOutcome : null;
    const fallbackCompletedAt = this.#now();
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
    const faulted = executionState !== "completed";
    const normalizedReports = !faulted && workerResult?.specialistResult?.values
      && Array.isArray(workerResult.specialistResult.values.reports)
      ? workerResult.specialistResult.values.reports as unknown as ReportAdapterResultV1[]
      : [];
    const unsigned = {
      schemaVersion: "attempt-result.v1" as const,
      ...resultIdentity(this.#options.plan, node),
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
      summary:
        evidenceFault ??
        workerRuntimeFault ??
        busterWorkerSummary(workerResult?.summary ?? "WORKER_RUNTIME_FAILED"),
      counts: faulted ? EMPTY_COUNTS : completedProviderResult!.counts,
      findings: faulted ? [] : completedProviderResult!.findings,
      metrics: faulted ? [] : completedProviderResult!.metrics,
      reports: normalizedReports,
      evidence,
      outputs: faulted ? [] : producedOutputs,
      resources,
      exitCode: workerResult?.exitCode ?? null,
      signal: workerResult?.signal ?? null,
      providerDetails: faulted
        ? null
        : completedProviderResult!.providerDetails,
    };
    const resultDigest = digest(unsigned);
    const result: AttemptResultV1 = {
      ...unsigned,
      resultDigest,
      receipt: receipt(this.#authorityId, this.#id(), resultDigest),
    };
    validatePipelineTestGateContract("attemptResult", result);
    const cleanupFailed =
      workerResult?.cleanup.state === "failed" ||
      retainedFaultCleanupFailed ||
      workerResult?.error?.code === "WORKER_TERMINATION_FAILED";
    if (cleanupFailed)
      this.#cleanupErrors.push({
        nodeId: node.id,
        message: workerResult?.cleanup.summary ?? "Cleanup failed.",
      });
    if (!retainFixture) {
      await fs.promises.rm(attemptRepository, { recursive: true, force: true });
    }
    return { result: freeze(result), instance, invocation, cleanupFailed };
  }

  async #persistWorkerCompletion(
    envelope: WorkerAttemptEnvelopeV1,
    result: WorkerAttemptResultV1,
  ): Promise<WorkerAttemptResultV1> {
    if (
      result.attemptId !== envelope.attemptId ||
      result.claimId !== envelope.claim.claimId ||
      result.claimGeneration !== envelope.claim.generation ||
      result.workerId !== envelope.claim.workerId
    )
      throw new Error("OBSERVABILITY_WORKER_RESULT_IDENTITY_MISMATCH");
    const bootHash = crypto
      .createHash("sha256")
      .update(
        `${envelope.pipelineRunId}\0${envelope.attemptId}\0${envelope.claim.claimId}\0${envelope.claim.generation}`,
      )
      .digest("hex");
    const producer = {
      producerId: `attempt:${bootHash}`,
      bootId: `claim:${bootHash}`,
      producerType: "buster-attempt",
    };
    const durableEvidence: WorkerAttemptResultV1["evidence"][number][] = [];
    let remainingEvidenceBytes = envelope.limits.evidenceBytes;
    for (const evidence of result.evidence) {
      const content = await this.#readManagedEvidence(
        evidence.artifact.storageUrl,
        remainingEvidenceBytes,
      );
      remainingEvidenceBytes -= content.byteLength;
      durableEvidence.push(
        await this.#durableAttemptStore.storeEvidence(
          {
            pipelineRunId: envelope.pipelineRunId,
            attemptId: envelope.attemptId,
            claimGeneration: envelope.claim.generation,
            producer,
            evidenceId: evidence.evidenceId,
            type: evidence.type,
            mediaType: evidence.artifact.mediaType,
          },
          content,
        ),
      );
    }
    const durableResult: WorkerAttemptResultV1 = {
      ...structuredClone(result),
      evidence: durableEvidence,
      resultDigest: "",
    };
    durableResult.resultDigest = workerAttemptResultDigest(durableResult);
    durableResult.receipt = receipt(
      this.#authorityId,
      bootHash,
      durableResult.resultDigest,
    );
    const occurredAt = this.#now().toISOString();
    const unsignedRecord = {
      schemaVersion: "producer-record.v1" as const,
      recordId: `record:${bootHash}`,
      producer,
      sequence: 1,
      recordType: "attempt.completed",
      occurredAt,
      correlation: {
        pipelineRunId: envelope.pipelineRunId,
        moduleId: envelope.moduleId,
        gateId: envelope.gateId,
        attemptId: envelope.attemptId,
        claimId: envelope.claim.claimId,
        claimGeneration: envelope.claim.generation,
        traceId: null,
        parentEventId: null,
      },
      payload: {
        state: durableResult.state,
        workerId: durableResult.workerId,
        resultDigest: durableResult.resultDigest,
        evidence: durableEvidence.map((item) => ({
          evidenceId: item.evidenceId,
          contentDigest: item.artifact.contentDigest,
        })),
      },
    };
    const record = {
      ...unsignedRecord,
      recordDigest: producerRecordDigest(unsignedRecord),
    };
    const closure = createProducerClosure({
      schemaVersion: "producer-closure.v1",
      closureId: `closure:${bootHash}`,
      producer,
      pipelineRunId: envelope.pipelineRunId,
      firstSequence: 1,
      finalSequence: 1,
      recordCount: 1,
      requiredEvidenceIds: durableEvidence.map((item) =>
        scopedEvidenceId(
          envelope.attemptId,
          envelope.claim.generation,
          item.evidenceId,
        ),
      ),
      closedAt: this.#now().toISOString(),
    });
    await this.#durableAttemptStore.storeResult(
      envelope.pipelineRunId,
      durableResult,
      { record, closure },
      { planId: envelope.planId, nodeId: envelope.nodeId },
    );
    try {
      await this.#durableAttemptStore.resumeCompletion(
        envelope.pipelineRunId,
        envelope.attemptId,
        envelope.claim.generation,
        this.#observabilityAdmissionStore,
      );
    } catch {
      // The result and completion intent are durable. Admission is retried by
      // Buster startup or Nova reconciliation without executing the provider again.
    }
    return Object.freeze(durableResult);
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
      ) => {
        if (!granted.has(capability))
          throw new Error(`TEST_PROVIDER_CAPABILITY_DENIED:${capability}`);
        if (!this.#options.capabilityInvoker)
          throw new Error(`TEST_PROVIDER_CAPABILITY_UNAVAILABLE:${capability}`);
        return this.#options.capabilityInvoker.invoke(
          capability,
          request,
          signal,
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
  ): Promise<EvidenceRefV1[]> {
    if (declarations.length > maximumFiles)
      throw new Error("TEST_PROVIDER_ARTIFACT_FILE_LIMIT");
    const ids = new Set<string>();
    const files = new Set<string>();
    const evidence: EvidenceRefV1[] = [];
    let total = 0;
    for (const declaration of declarations) {
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
      );
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

  async #cleanupInstance(
    node: ResolvedPlanNodeV1,
    execution: AttemptExecution,
  ): Promise<boolean> {
    if (!execution.instance?.cleanup) return true;
    return this.#cleanupProvider(
      node,
      execution.instance,
      execution.invocation,
      createLogCapture(execution.invocation.limits.logBytes).contextLog,
    );
  }

  async #cleanupProvider(
    node: ResolvedPlanNodeV1,
    instance: LoadedTestProvider,
    invocation: ProviderInvocationV1,
    log: TestProviderExecutionContext["log"],
  ): Promise<boolean> {
    if (!instance.cleanup) return true;
    const controller = new AbortController();
    const timeoutMs = this.#options.cleanupTimeoutMs ?? 30_000;
    let timer: NodeJS.Timeout | undefined;
    const context = this.#context(
      controller.signal,
      log,
      new Set(invocation.grantedCapabilities),
      invocation.inputs,
    );
    try {
      await Promise.race([
        instance.cleanup(invocation, context),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => {
            controller.abort(new Error("TEST_PROVIDER_CLEANUP_TIMEOUT"));
            reject(new Error("TEST_PROVIDER_CLEANUP_TIMEOUT"));
          }, timeoutMs);
        }),
      ]);
      return true;
    } catch (error) {
      this.#cleanupErrors.push({ nodeId: node.id, message: detail(error) });
      await instance.terminate();
      return false;
    } finally {
      if (timer) clearTimeout(timer);
      controller.abort(new Error("TEST_PROVIDER_CLEANUP_COMPLETE"));
    }
  }

  async #cleanupFixtures(): Promise<void> {
    for (const retained of [...this.#retainedFixtures].reverse()) {
      try { await this.#cleanupInstance(retained.node, retained.execution); }
      finally {
        const repository = path.resolve(this.#workspaceRoot, retained.execution.invocation.workspace.repository);
        const attemptsRoot = path.join(path.resolve(this.#workspaceRoot), 'test-attempts');
        const attemptRoot = path.dirname(repository);
        const relative = path.relative(attemptsRoot, attemptRoot);
        if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`)) {
          throw new Error('TEST_PROVIDER_ATTEMPT_PATH_INVALID');
        }
        fs.rmSync(attemptRoot, { recursive: true, force: true });
      }
    }
  }
}
