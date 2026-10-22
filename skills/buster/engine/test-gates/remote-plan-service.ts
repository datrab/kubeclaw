import { readBusterOriginalExecution, type BusterOriginalExecution } from './original-execution.ts';
import { readWorkerCorePolicyCapture, type WorkerCorePolicyCapture } from '@kubeclaw/plugin-foundation/config/worker-core-policy';
import { validateBusterExecutionSettings, type BusterExecutionSettings } from '@kubeclaw/plugin-foundation/config/buster-execution';
import { validateLocalWorkerRuntimePolicy, type LocalWorkerRuntimePolicy } from "@kubeclaw/worker-core";
import { validateBusterAdmissionSettings, validateBusterDependencyReadinessSettings, type BusterAdmissionSettings, type BusterDependencyReadinessSettings } from '@kubeclaw/plugin-foundation/config/swarm';
import { executeBusterPreparedJob } from './remote-prepared-execution.ts';
import { preparedPlanRuntimeRoot } from './prepared-plan-paths.ts';
import type { BusterStagedAdmission } from './preparation-input.ts';
import { BuildkitReadiness } from './buildkit-readiness.ts';
import type { PreparedBusterPlanJobStore, StoredPreparedPlanJob } from './prepared-plan-store.ts';
import type { BusterPreparation, PreparedAdmission } from './preparation-client.ts';
import type { PreparedPlanJob } from './preparation-header.ts';
import {
  type RemotePlanResultV1,
  type RemotePlanStatusV1,
} from '@kubeclaw/pipeline-test-gate-contract';
import type { RegistrySnapshot } from '@kubeclaw/plugin-foundation/registry/types';
import type { TestPlanRunResult } from './runner.ts';
import type { BusterCapabilityRuntimeOptions } from './capability-runtime.ts';

import { readJobArtifact, resultArtifacts } from './remote-plan-compaction.ts';

export { PreparedBusterPlanJobStore as FileBusterPlanJobStore } from './prepared-plan-store.ts';
export type { BusterPlanJobStoreOptions } from './prepared-plan-store.ts';

export interface BusterRemotePlanServiceOptions extends BusterCapabilityRuntimeOptions {
  readonly store: PreparedBusterPlanJobStore;
  readonly preparation: BusterPreparation;
  readonly registry: RegistrySnapshot;
  readonly workerRevision: string;
  readonly runtimeRoot: string;
  readonly admission: BusterAdmissionSettings;
  readonly workerLocalRuntime: LocalWorkerRuntimePolicy;
  readonly workerCore?: WorkerCorePolicyCapture;
  readonly executionPolicy: BusterExecutionSettings;
  readonly originalExecution?: BusterOriginalExecution;
  readonly dependencyReadiness: BusterDependencyReadinessSettings;
  readonly now?: () => Date;
  readonly execute?: (
    job: PreparedPlanJob,
    paths: Readonly<{ jobRoot: string; repositoryRoot: string; sourceRepositoryRoot: string; workspaceRoot: string; artifactRoot: string; observabilityRoot: string }>,
    signal: AbortSignal,
  ) => Promise<TestPlanRunResult>;
}


function configuredBuildkitReadiness(options: BusterRemotePlanServiceOptions): BuildkitReadiness | undefined {
  if (!options.allowedCapabilities.has('container.build')) return undefined;
  if (!options.containerBuild) throw new Error('BUSTER_READINESS_BUILDKIT_CONFIG_REQUIRED');
  return new BuildkitReadiness({ buildctlExecutable: options.containerBuild.buildctlExecutable,
    buildkitHost: options.containerBuild.buildkitHost, maximumExecutionMs: options.dependencyReadiness.maximumExecutionMs,
    maximumOutputBytes: options.dependencyReadiness.maximumOutputBytes });
}

export class BusterRemotePlanService {
  readonly #options: BusterRemotePlanServiceOptions;
  readonly #now: () => Date;
  readonly #active = new Map<string, AbortController>();
  readonly #executions = new Map<string, Promise<void>>();
  readonly #queue = new Map<string, BusterStagedAdmission>();
  readonly #weights = new Map<string, number>();
  #submission: Promise<void> = Promise.resolve();
  #stopping = false;
  #executionFailure: Error | null = null;
  #recovered = false;
  readonly #buildkitReadiness: BuildkitReadiness | undefined;
  readonly #maximumActiveJobs: number;
  readonly #maximumQueuedJobs: number;
  readonly #maximumConcurrentAttempts: number;

  constructor(options: BusterRemotePlanServiceOptions) {
    const executionPolicy = validateBusterExecutionSettings(options.executionPolicy);
    const workerLocalRuntime = validateLocalWorkerRuntimePolicy(options.workerLocalRuntime);
    const dependencyReadiness = validateBusterDependencyReadinessSettings(options.dependencyReadiness);
    if (!/^[a-f0-9]{40,64}$/u.test(options.workerRevision)) throw new Error('BUSTER_REMOTE_WORKER_REVISION_INVALID');
    this.#options = { ...options, ...(options.originalExecution ? {originalExecution: readBusterOriginalExecution(options.originalExecution)} : {}), ...(options.workerCore ? {workerCore: readWorkerCorePolicyCapture(options.workerCore)} : {}), workerLocalRuntime, dependencyReadiness, executionPolicy };
    this.#buildkitReadiness = configuredBuildkitReadiness(this.#options);
    this.#now = options.now ?? (() => new Date());
    const admission = validateBusterAdmissionSettings(options.admission);
    this.#maximumActiveJobs = admission.maximumActiveJobs;
    this.#maximumQueuedJobs = admission.maximumQueuedJobs;
    this.#maximumConcurrentAttempts = admission.maximumConcurrentAttempts;
  }

  #validateAuthority(job: PreparedPlanJob): void {
    if (job.plan.registrySnapshotDigest !== this.#options.registry.snapshotDigest) {
      throw new Error('BUSTER_REMOTE_REGISTRY_SNAPSHOT_MISMATCH');
    }
    for (const node of job.plan.nodes) {
      const entry = this.#options.registry.testProviderContracts.get(node.provider.contractId);
      if (!entry) throw new Error(`BUSTER_REMOTE_PROVIDER_MISSING:${node.id}`);
      if (
        entry.registration.registrationId !== node.provider.registrationId
        || entry.registration.package.packageId !== node.provider.packageId
        || entry.registration.package.packageVersion !== node.provider.packageVersion
        || entry.registration.package.contentDigest !== node.provider.contentDigest
      ) throw new Error(`BUSTER_REMOTE_PROVIDER_IDENTITY_MISMATCH:${node.id}`);
      const allowed = new Set(entry.registration.capabilities);
      for (const capability of job.grants[node.id] ?? []) {
        if (!allowed.has(capability) || !this.#options.allowedCapabilities.has(capability)) {
          throw new Error(`BUSTER_REMOTE_CAPABILITY_DENIED:${node.id}:${capability}`);
        }
      }
    }
  }

  bootstrapReady(): boolean { return this.#recovered && !this.#stopping; }

  async readiness() {
    const initialized = this.bootstrapReady();
    const dependency = initialized ? await this.#buildkitReadiness?.check() : undefined;
    const currentInitialized = this.bootstrapReady();
    const ready = currentInitialized && dependency?.ok !== false;
    return { schemaVersion: 'buster-plan-readiness.v1', ready,
      code: ready ? 'BUSTER_READY' : currentInitialized ? 'BUSTER_DEPENDENCY_UNAVAILABLE' : 'BUSTER_NOT_BOOTSTRAPPED' };
  }

  async #assertDependencies(): Promise<void> {
    if ((await this.#buildkitReadiness?.check())?.ok === false) throw new Error('BUSTER_DEPENDENCY_UNAVAILABLE');
  }

  async submit(chunks: AsyncIterable<Uint8Array>): Promise<RemotePlanStatusV1> {
    if (this.#stopping) throw new Error('BUSTER_REMOTE_SHUTTING_DOWN');
    let release!: () => void;
    const prior = this.#submission;
    this.#submission = new Promise<void>((resolve) => { release = resolve; });
    await prior;
    try {
      let replay: RemotePlanStatusV1 | undefined;
      const staged = await this.#options.preparation.stage(chunks, async job => {
        this.#validateAuthority(job);
        if (this.#stopping) throw new Error('BUSTER_REMOTE_SHUTTING_DOWN');
        const known = (await this.#options.store.records()).find(record => record.payload.job.jobId === job.jobId);
        if (known) {
          if (known.payload.job.requestDigest !== job.requestDigest) throw new Error('BUSTER_REMOTE_JOB_CONFLICT');
          replay = known.payload.status;
          if (replay.state === 'accepted' && !this.#active.has(job.jobId)) {
            await this.#assertDependencies();
            if (known.payload.input === null) throw new Error('BUSTER_JOB_RECORD_INVALID');
            this.#start(known.payload);
          }
          return false;
        }
        if (job.maximumConcurrency > this.#maximumConcurrentAttempts) throw new Error('BUSTER_REMOTE_CONCURRENCY_EXCEEDS_SERVICE_LIMIT');
        if (this.#queue.size >= this.#maximumQueuedJobs) throw new Error('BUSTER_REMOTE_ADMISSION_FULL');
        await this.#assertDependencies();
        return true;
      });
      if (!staged) {
        if (!replay) throw new Error('BUSTER_PREPARATION_DECLINE_INVALID');
        return replay;
      }
      if (this.#stopping) throw new Error('BUSTER_REMOTE_SHUTTING_DOWN');
      const status = await this.#options.store.accept(staged, this.#now().toISOString(), this.#options.originalExecution);
      if (status.state === 'accepted' && !this.#active.has(staged.job.jobId)) {
        const retained = (await this.#options.store.get(staged.job.jobId)).payload;
        if (retained.input === null) throw new Error('BUSTER_JOB_RECORD_INVALID');
        this.#start(retained);
      }
      return status;
    } finally { release(); }
  }

  async status(jobId: string): Promise<RemotePlanStatusV1> {
    return (await this.#options.store.get(jobId)).payload.status;
  }

  async evidence(jobId: string, contentDigest: string, maximumBytes: number): Promise<Buffer> {
    if (!/^sha256:[a-f0-9]{64}$/u.test(contentDigest)) throw new Error('BUSTER_REMOTE_EVIDENCE_DIGEST_INVALID');
    if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 0) throw new Error('BUSTER_REMOTE_EVIDENCE_LIMIT_INVALID');
    const stored = await this.#options.store.get(jobId);
    const status = stored.payload.status;
    if (status.state !== 'completed' || !status.result) throw new Error('BUSTER_REMOTE_EVIDENCE_NOT_READY');
    const result = JSON.parse((await this.#options.store.result(jobId, status.result.contentDigest,
      status.result.sizeBytes)).toString('utf8')) as RemotePlanResultV1;
    const matches = resultArtifacts(result).filter(artifact => artifact.contentDigest === contentDigest);
    if (matches.length === 0) throw new Error('BUSTER_REMOTE_EVIDENCE_NOT_FOUND');
    if (matches.some(item => item.sizeBytes !== matches[0]!.sizeBytes)) throw new Error('BUSTER_REMOTE_EVIDENCE_IDENTITY_CONFLICT');
    const runtimeRoot = stored.payload.resultOrigin?.kind === 'historical'
      ? this.#options.runtimeRoot : preparedPlanRuntimeRoot(this.#options.runtimeRoot);
    let bytes!: Buffer;
    for (const artifact of matches) bytes = await readJobArtifact(runtimeRoot, jobId, artifact, maximumBytes);
    return bytes;
  }

  async result(jobId: string, contentDigest: string, maximumBytes: number): Promise<Buffer> {
    return this.#options.store.result(jobId, contentDigest, maximumBytes);
  }

  async cancel(jobId: string): Promise<RemotePlanStatusV1> {
    const status = await this.#options.store.requestCancellation(jobId, this.#now().toISOString());
    if (status.state !== 'cancelling') return status;
    this.#queue.delete(jobId);
    this.#active.get(jobId)?.abort(new Error('BUSTER_REMOTE_CANCELLED'));
    if (!this.#active.has(jobId)) {
      return this.#options.store.transition(
        jobId, ['cancelling'], 'cancelled', this.#now().toISOString(), { error: 'cancelled before execution' },
      );
    }
    return status;
  }

  async recover(): Promise<void> {
    this.#recovered = false;
    for (const record of await this.#options.store.records()) {
      const prepared = record.payload;
      const { job, status } = prepared;
      if (status.state === 'accepted') await this.#recoverAccepted(prepared);
      else if (status.state === 'running') {
        await this.#options.store.transition(job.jobId, ['running'], 'failed', this.#now().toISOString(), {
          error: 'BUSTER_REMOTE_EXECUTION_INTERRUPTED',
        });
      } else if (status.state === 'cancelling') {
        await this.#options.store.transition(job.jobId, ['cancelling'], 'cancelled', this.#now().toISOString(), {
          error: 'cancelled during restart recovery',
        });
      }
      // A previous host's terminal record does not prove orphan quiescence.
      // Retain workspace inputs until an ownership reconciliation can prove it.
    }
    this.#recovered = true;
  }

  async shutdown(timeoutMs: number): Promise<void> {
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 0x7fffffff) {
      throw new Error('BUSTER_REMOTE_SHUTDOWN_TIMEOUT_INVALID');
    }
    this.#stopping = true; this.#queue.clear();
    for (const controller of this.#active.values()) {
      controller.abort(new Error('BUSTER_REMOTE_SHUTDOWN'));
    }
    const dependencyShutdown = this.#buildkitReadiness?.shutdown();
    let timer: NodeJS.Timeout | undefined;
    try {
      const outcomes = await Promise.race([
        Promise.allSettled([this.#submission, ...this.#executions.values(), dependencyShutdown]),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => reject(new Error('BUSTER_REMOTE_SHUTDOWN_TIMEOUT')), timeoutMs);
        }),
      ]);
      if (this.#executionFailure) throw this.#executionFailure;
      for (const outcome of outcomes) {
        if (outcome.status === 'rejected') throw outcome.reason;
      }
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  #start(prepared: BusterStagedAdmission): void {
    const { job } = prepared;
    if (this.#stopping || this.#active.has(job.jobId)) return;
    this.#queue.set(job.jobId, prepared); this.#drain();
  }

  #drain(): void {
    if (this.#stopping) return;
    for (const [id, prepared] of this.#queue) {
      const { job } = prepared;
      const used = [...this.#weights.values()].reduce((a, b) => a + b, 0);
      if (this.#active.size >= this.#maximumActiveJobs || used + job.maximumConcurrency > this.#maximumConcurrentAttempts) return;
      this.#queue.delete(id);
      const controller = new AbortController(); this.#active.set(id, controller); this.#weights.set(id, job.maximumConcurrency);
      const execution = this.#execute(prepared, controller).catch((error: unknown) => {
        // Normal execution failures are persisted by #execute. A rejection here
        // means that durable failure recording failed; retain its ownership even
        // after this execution leaves the active map.
        this.#executionFailure ??= error instanceof Error ? error : new Error('BUSTER_REMOTE_EXECUTION_PERSISTENCE_FAILED', { cause: error });
        this.#stopping = true;
        this.#queue.clear();
      }).finally(() => {
        this.#active.delete(id); this.#executions.delete(id); this.#weights.delete(id); this.#drain();
      });
      this.#executions.set(id, execution);
    }
  }

  async #recoverAccepted(prepared: StoredPreparedPlanJob): Promise<void> {
    const { job } = prepared;
    try {
      if (prepared.input === null) throw new Error('BUSTER_JOB_RECORD_INVALID');
      this.#options.store.validate(prepared);
      this.#validateAuthority(job);
      if (job.maximumConcurrency > this.#maximumConcurrentAttempts) throw new Error('BUSTER_REMOTE_CONCURRENCY_EXCEEDS_SERVICE_LIMIT');
      this.#start(prepared);
    } catch (error) {
      await this.#options.store.transition(job.jobId, ['accepted'], 'failed', this.#now().toISOString(), {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async #execute(prepared: BusterStagedAdmission, controller: AbortController): Promise<void> {
    await executeBusterPreparedJob(this.#options, prepared, controller.signal, this.#now);
  }
}
