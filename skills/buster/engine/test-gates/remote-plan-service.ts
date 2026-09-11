import { BuildkitReadiness } from './buildkit-readiness.ts';
import { cleanupTerminalWorkspace } from './terminal-workspace.ts';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {
  remotePlanDigest,
  remotePlanJobDigest,
  remotePlanJobId,
  remotePlanResultDigest,
  remotePlanResultReceipt,
  repositoryArchiveBytes,
  resolvedTestPlanDigest,
  verifySourceSnapshotAttestation,
  validatePipelineTestGateContract,
  type RemotePlanJobV1,
  type RemotePlanResultV1,
  type RemotePlanStatusV1,
} from '@kubeclaw/pipeline-test-gate-contract';
import {
  canonicalJson,
} from '@kubeclaw/pipeline-observability-contract';
import {
  FileDurableBlobStore,
  FileDurableRecordStore,
  type DurableRecord,
  type DurableRecordLimits,
} from '@kubeclaw/plugin-foundation/observability/durable-records';
import { ensureDirectoryDurable, withDurableStoreLock } from '@kubeclaw/plugin-foundation/observability/durable-delivery';
import type { RegistrySnapshot } from '@kubeclaw/plugin-foundation/registry/types';
import { TestPlanRunner, type TestPlanRunResult } from './runner.ts';
import { DirectCommandCapabilityInvoker, type DirectCommandCapabilityInvokerOptions } from './direct-command-runtime.ts';
import { ContainerBuildCapabilityInvoker, type ContainerBuildCapabilityInvokerOptions } from './container-build-runtime.ts';
import { KubernetesFixtureCapabilityInvoker, type KubernetesFixtureCapabilityInvokerOptions } from './kubernetes-fixture-runtime.ts';
import { TailscaleExposureCapabilityInvoker, type TailscaleExposureCapabilityInvokerOptions } from './tailscale-exposure-runtime.ts';
import { NetworkHttpCapabilityInvoker, type NetworkHttpCapabilityInvokerOptions } from './network-http-runtime.ts';
import { BrowserAxeCapabilityInvoker, type BrowserAxeCapabilityInvokerOptions } from './browser-axe-runtime.ts';
import { BrowserLighthouseCapabilityInvoker, type BrowserLighthouseCapabilityInvokerOptions } from './browser-lighthouse-runtime.ts';
import { BrowserVisualCapabilityInvoker, type BrowserVisualCapabilityInvokerOptions } from './browser-visual-runtime.ts';
import { BrowserPlaywrightCapabilityInvoker, type BrowserPlaywrightCapabilityInvokerOptions } from './browser-playwright-runtime.ts';
import { SecurityScanCapabilityInvoker, type SecurityScanCapabilityInvokerOptions } from './security-scan-runtime.ts';
import { KubernetesRuntimeSecurityCapabilityInvoker,
  type KubernetesRuntimeSecurityCapabilityInvokerOptions } from './kubernetes-runtime-security.ts';
import { CompositeTestProviderCapabilityInvoker } from './composite-capability-runtime.ts';

import {
  assertCompactionIntent, assertCompactedPlanJobRecord, compactionDigest, readJobArtifact, resultArtifacts, verifyRetainedSource,
  type StoredPlanJob, type CompactedPlanJobRecord, type CompactionIntent, type CompactionReceipt,
} from './remote-plan-compaction.ts';

export interface BusterPlanJobStoreOptions {
  readonly recordLimits: DurableRecordLimits;
  readonly maximumArchiveBytes: number;
  readonly maximumResultBytes: number;
  readonly maximumResultStoreBytes: number;
  readonly trustedSourceAuthority: string;
  readonly sourceAttestationPublicKey: string | Buffer;
}

export class FileBusterPlanJobStore {
  readonly #records: FileDurableRecordStore;
  readonly #results: FileDurableBlobStore;
  readonly #maximumArchiveBytes: number;
  readonly #maximumResultBytes: number;
  readonly #maximumResultStoreBytes: number;
  readonly #admissionLock: string;
  readonly #trustedSourceAuthority: string;
  readonly #sourceAttestationPublicKey: string | Buffer;

  constructor(root: string, options: BusterPlanJobStoreOptions) {
    if (!Number.isSafeInteger(options.maximumArchiveBytes) || options.maximumArchiveBytes < 1) {
      throw new Error('BUSTER_REMOTE_ARCHIVE_LIMIT_INVALID');
    }
    if (!Number.isSafeInteger(options.maximumResultBytes) || options.maximumResultBytes < 1) {
      throw new Error('BUSTER_REMOTE_RESULT_LIMIT_INVALID');
    }
    this.#admissionLock = path.join(path.resolve(root), 'job-admission');
    this.#maximumResultStoreBytes = options.maximumResultStoreBytes;
    this.#records = new FileDurableRecordStore(root, options.recordLimits);
    this.#results = new FileDurableBlobStore(path.join(root, 'results'), options.maximumResultBytes, options.maximumResultStoreBytes);
    this.#maximumArchiveBytes = options.maximumArchiveBytes;
    this.#maximumResultBytes = options.maximumResultBytes;
    let sourcePublicKey: crypto.KeyObject;
    try { sourcePublicKey = crypto.createPublicKey(options.sourceAttestationPublicKey); }
    catch (error) { throw new Error('BUSTER_SOURCE_ATTESTATION_CONFIG_INVALID', { cause: error }); }
    if (options.trustedSourceAuthority.length === 0 || sourcePublicKey.asymmetricKeyType !== 'ed25519') {
      throw new Error('BUSTER_SOURCE_ATTESTATION_CONFIG_INVALID');
    }
    this.#trustedSourceAuthority = options.trustedSourceAuthority;
    this.#sourceAttestationPublicKey = sourcePublicKey.export({ type: 'spki', format: 'pem' });
  }

  #preflight(job: RemotePlanJobV1): void {
    const encodedLimit = Math.ceil(this.#maximumArchiveBytes / 3) * 4;
    if (job.repositoryArchive.sizeBytes > this.#maximumArchiveBytes
      || job.repositoryArchive.data.length > encodedLimit) {
      throw new Error('BUSTER_REMOTE_ARCHIVE_SIZE_EXCEEDED');
    }
    // Keep the network trust boundary explicit. Contract validation repeats
    // these semantic checks for all other callers.
    repositoryArchiveBytes(job.repositoryArchive);
    if (!verifySourceSnapshotAttestation(job.sourceSnapshot,
      this.#trustedSourceAuthority, this.#sourceAttestationPublicKey)) {
      throw new Error('BUSTER_SOURCE_ATTESTATION_INVALID');
    }
    if (remotePlanJobId(job.idempotencyKey) !== job.jobId) {
      throw new Error('BUSTER_REMOTE_JOB_ID_INVALID');
    }
    if (resolvedTestPlanDigest(job.plan) !== job.plan.planDigest) {
      throw new Error('BUSTER_REMOTE_PLAN_DIGEST_MISMATCH');
    }
    if (remotePlanJobDigest(job) !== job.requestDigest) {
      throw new Error('BUSTER_REMOTE_REQUEST_DIGEST_MISMATCH');
    }
    validatePipelineTestGateContract('remotePlanJob', job);
  }

  validate(job: RemotePlanJobV1): void { this.#preflight(job); }

  async accept(job: RemotePlanJobV1, now: string): Promise<RemotePlanStatusV1> {
    this.#preflight(job);
    return withDurableStoreLock(this.#admissionLock, () => this.#accept(job, now));
  }

  async #accept(job: RemotePlanJobV1, now: string): Promise<RemotePlanStatusV1> {
    const records = await this.records();
    const existingRecord = records.find((item) => item.idempotencyKey === job.idempotencyKey);
    if (existingRecord) {
      if (existingRecord.payload.job.jobId !== job.jobId
        || existingRecord.payload.job.requestDigest !== job.requestDigest) {
        throw new Error('BUSTER_REMOTE_JOB_CONFLICT');
      }
      return structuredClone(existingRecord.payload.status);
    }
    const reservedBytes = records.reduce((sum, record) => sum + (record.payload.status.result?.sizeBytes ?? this.#maximumResultBytes), 0);
    if (!Number.isSafeInteger(reservedBytes) || reservedBytes + this.#maximumResultBytes > this.#maximumResultStoreBytes) {
      throw new Error('BUSTER_REMOTE_RESULT_CAPACITY_EXCEEDED');
    }
    const status: RemotePlanStatusV1 = {
      schemaVersion: 'buster-plan-status.v1', jobId: job.jobId,
      requestDigest: job.requestDigest, state: 'accepted', submittedAt: job.submittedAt,
      updatedAt: now, result: null, error: null,
    };
    validatePipelineTestGateContract('remotePlanStatus', status);
    const payload: StoredPlanJob = { schemaVersion: 'buster-plan-job-record.v1', job, status };
    let stored: Awaited<ReturnType<FileDurableRecordStore['append']>>;
    try {
      stored = await this.#records.append('buster-plan-jobs', job.idempotencyKey, payload);
    } catch (error) {
      if (error instanceof Error && error.message === 'DURABLE_RECORD_IDEMPOTENCY_CONFLICT') {
        const winner = (await this.records()).find((record) => record.idempotencyKey === job.idempotencyKey)?.payload;
        if (winner?.job.jobId === job.jobId && winner.job.requestDigest === job.requestDigest) {
          return structuredClone(winner.status);
        }
        throw new Error('BUSTER_REMOTE_JOB_CONFLICT', { cause: error });
      }
      throw error;
    }
    const accepted = stored.record.payload as StoredPlanJob;
    if (accepted.job.jobId !== job.jobId || accepted.job.requestDigest !== job.requestDigest) {
      throw new Error('BUSTER_REMOTE_JOB_CONFLICT');
    }
    return structuredClone(accepted.status);
  }

  async records(): Promise<ReadonlyArray<DurableRecord<StoredPlanJob>>> {
    const records = await this.#records.read<StoredPlanJob>('buster-plan-jobs');
    for (const { payload } of records) {
      if (payload.schemaVersion === 'buster-plan-job-compacted-record.v1') {
        assertCompactedPlanJobRecord(payload);
        if (!verifySourceSnapshotAttestation(payload.job.sourceSnapshot, this.#trustedSourceAuthority, this.#sourceAttestationPublicKey)) {
          throw new Error('BUSTER_SOURCE_ATTESTATION_INVALID');
        }
      } else if (payload.schemaVersion !== 'buster-plan-job-record.v1') throw new Error('BUSTER_JOB_RECORD_INVALID');
    }
    return records;
  }

  async get(jobId: string): Promise<Readonly<{ record: DurableRecord<StoredPlanJob>; payload: StoredPlanJob }>> {
    const record = (await this.records()).find((item) => item.payload.job.jobId === jobId);
    if (!record) throw new Error('BUSTER_REMOTE_JOB_NOT_FOUND');
    return { record, payload: structuredClone(record.payload) };
  }

  async transition(
    jobId: string,
    expected: readonly RemotePlanStatusV1['state'][],
    state: RemotePlanStatusV1['state'],
    now: string,
    terminal?: { readonly error?: string },
  ): Promise<RemotePlanStatusV1> {
    const current = await this.get(jobId);
    if (current.payload.status.state === 'completed') {
      if (state === 'completed') return current.payload.status;
      throw new Error('BUSTER_COMPACTED_JOB_TERMINAL');
    }
    if (!expected.includes(current.payload.status.state)) {
      if (current.payload.status.state === state) return current.payload.status;
      throw new Error(`BUSTER_REMOTE_JOB_STATE_CONFLICT:${current.payload.status.state}`);
    }
    const status: RemotePlanStatusV1 = {
      ...current.payload.status,
      state,
      updatedAt: now,
      result: null,
      error: terminal?.error ?? null,
    };
    validatePipelineTestGateContract('remotePlanStatus', status);
    const next: StoredPlanJob = { ...current.payload, status };
    const stored = await this.#records.transition(
      'buster-plan-jobs', current.record.idempotencyKey, current.record.payloadDigest, next,
    );
    return structuredClone((stored.payload as StoredPlanJob).status);
  }

  async complete(jobId: string, result: RemotePlanResultV1, now: string): Promise<RemotePlanStatusV1> {
    validatePipelineTestGateContract('remotePlanResult', result);
    return withDurableStoreLock(this.#admissionLock, () => this.#complete(jobId, result, now));
  }

  async #complete(jobId: string, result: RemotePlanResultV1, now: string): Promise<RemotePlanStatusV1> {
    const current = await this.get(jobId);
    const job = current.payload.job;
    if (result.jobId !== jobId || result.planId !== job.plan.planId
      || result.planDigest !== job.plan.planDigest || result.runId !== job.plan.runId) throw new Error('BUSTER_REMOTE_RESULT_IDENTITY_MISMATCH');
    const bytes = Buffer.from(canonicalJson(result));
    if (bytes.byteLength > this.#maximumResultBytes) throw new Error('BUSTER_REMOTE_RESULT_SIZE_EXCEEDED');
    const contentDigest = `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`;
    if (current.payload.status.state === 'completed') {
      if (current.payload.status.result?.contentDigest !== contentDigest
        || current.payload.status.result.resultDigest !== result.resultDigest) {
        throw new Error('BUSTER_REMOTE_RESULT_CONFLICT');
      }
      return current.payload.status;
    }
    if (current.payload.status.state !== 'running') {
      throw new Error(`BUSTER_REMOTE_JOB_STATE_CONFLICT:${current.payload.status.state}`);
    }
    const storedResult = await this.#results.put(bytes);
    const status: RemotePlanStatusV1 = {
      ...current.payload.status,
      state: 'completed',
      updatedAt: now,
      result: {
        schemaVersion: 'buster-plan-result-ref.v1',
        resultDigest: result.resultDigest,
        contentDigest: storedResult.digest,
        sizeBytes: storedResult.sizeBytes,
      },
      error: null,
    };
    validatePipelineTestGateContract('remotePlanStatus', status);
    const next: StoredPlanJob = { ...current.payload, status };
    const stored = await this.#records.transition(
      'buster-plan-jobs', current.record.idempotencyKey, current.record.payloadDigest, next,
    );
    return structuredClone((stored.payload as StoredPlanJob).status);
  }

  /** Manual local operation; never schedules execution or removes result/evidence files. */
  async compactCompletedArchive(inputIntent: CompactionIntent, runtimeRoot: string): Promise<{
    readonly receipt: CompactionReceipt; readonly releasedMetadataBytes: number;
  }> {
    // Own the complete intent before validation or asynchronous lock acquisition.
    const intent = structuredClone(inputIntent);
    assertCompactionIntent(intent);
    return withDurableStoreLock(this.#admissionLock, async () => {
      const current = await this.get(intent.jobId);
      if (current.payload.schemaVersion === 'buster-plan-job-compacted-record.v1') {
        if (current.payload.compaction.intentDigest !== compactionDigest(intent)) throw new Error('BUSTER_COMPACTION_INTENT_CONFLICT');
        return { receipt: current.payload.compaction, releasedMetadataBytes: 0 };
      }
      if (current.record.payloadDigest !== intent.expectedPayloadDigest) throw new Error('BUSTER_COMPACTION_RECORD_CHANGED');
      const { job, status } = current.payload;
      if (status.state !== 'completed' || !status.result) throw new Error('BUSTER_COMPACTION_JOB_NOT_COMPLETED');
      this.#preflight(job);
      const result = JSON.parse((await this.result(job.jobId, status.result.contentDigest, status.result.sizeBytes)).toString()) as RemotePlanResultV1;
      if (result.cleanupErrors.length || result.attempts.some(attempt => attempt.executionState !== 'completed')) {
        throw new Error('BUSTER_COMPACTION_EXECUTION_UNCERTAIN');
      }
      let evidenceBytes = 0;
      for (const artifact of resultArtifacts(result)) {
        evidenceBytes += artifact.sizeBytes;
        if (!Number.isSafeInteger(evidenceBytes) || evidenceBytes > intent.maximumEvidenceBytes) throw new Error('BUSTER_COMPACTION_EVIDENCE_BUDGET_EXCEEDED');
        await readJobArtifact(runtimeRoot, job.jobId, artifact, intent.maximumEvidenceBytes);
      }
      await verifyRetainedSource(job, intent);
      const archive = { schemaVersion: 'repository-archive-summary.v1' as const, encoding: job.repositoryArchive.encoding,
        contentDigest: job.repositoryArchive.contentDigest, sizeBytes: job.repositoryArchive.sizeBytes };
      const receipt: CompactionReceipt = {
        schemaVersion: 'buster-job-compaction-receipt.v1', intent: structuredClone(intent),
        intentDigest: compactionDigest(intent), compactedAt: new Date().toISOString(),
        revision: job.sourceSnapshot.revision, tree: job.sourceSnapshot.tree,
        archiveDigest: archive.contentDigest, archiveBytes: archive.sizeBytes, releasedMetadataBytes: 0,
      };
      let next: CompactedPlanJobRecord = {
        schemaVersion: 'buster-plan-job-compacted-record.v1', job: { ...job, schemaVersion: 'buster-plan-job-header.v1', repositoryArchive: archive }, status, compaction: receipt,
      };
      // Canonical record envelopes have fixed-size digests and ISO timestamps.
      // Include the receipt itself in the net metadata byte saving.
      const oldBytes = Buffer.byteLength(canonicalJson(current.payload));
      for (let iteration = 0; iteration < 8; iteration += 1) {
        const releasedMetadataBytes = oldBytes - Buffer.byteLength(canonicalJson(next));
        if (releasedMetadataBytes === next.compaction.releasedMetadataBytes) break;
        next = { ...next, compaction: { ...next.compaction, releasedMetadataBytes } };
      }
      if (next.compaction.releasedMetadataBytes < 1
        || next.compaction.releasedMetadataBytes !== oldBytes - Buffer.byteLength(canonicalJson(next))) {
        throw new Error('BUSTER_COMPACTION_NO_BYTE_SAVING');
      }
      assertCompactedPlanJobRecord(next);
      await this.#records.transition('buster-plan-jobs', current.record.idempotencyKey, current.record.payloadDigest, next);
      return { receipt: next.compaction, releasedMetadataBytes: next.compaction.releasedMetadataBytes };
    });
  }

  async result(jobId: string, contentDigest: string, maximumBytes: number): Promise<Buffer> {
    if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 1) throw new Error('BUSTER_REMOTE_RESULT_LIMIT_INVALID');
    const status = (await this.get(jobId)).payload.status;
    if (status.state !== 'completed' || !status.result) throw new Error('BUSTER_REMOTE_RESULT_NOT_READY');
    if (status.result.contentDigest !== contentDigest) throw new Error('BUSTER_REMOTE_RESULT_NOT_FOUND');
    if (status.result.sizeBytes > maximumBytes || status.result.sizeBytes > this.#maximumResultBytes) {
      throw new Error('BUSTER_REMOTE_RESULT_SIZE_EXCEEDED');
    }
    const bytes = await this.#results.get(contentDigest);
    if (bytes.byteLength !== status.result.sizeBytes) throw new Error('BUSTER_REMOTE_RESULT_SIZE_MISMATCH');
    const parsed = JSON.parse(bytes.toString('utf8')) as RemotePlanResultV1;
    validatePipelineTestGateContract('remotePlanResult', parsed);
    if (parsed.jobId !== jobId || parsed.resultDigest !== status.result.resultDigest) {
      throw new Error('BUSTER_REMOTE_RESULT_IDENTITY_MISMATCH');
    }
    return bytes;
  }
}

export interface BusterRemotePlanServiceOptions {
  readonly store: FileBusterPlanJobStore;
  readonly registry: RegistrySnapshot;
  readonly workerRevision: string;
  readonly runtimeRoot: string;
  readonly tarExecutable: string;
  readonly maximumExtractedBytes: number;
  readonly allowedCapabilities: ReadonlySet<string>;
  readonly maximumActiveJobs?: number;
  readonly maximumQueuedJobs?: number;
  readonly maximumConcurrentAttempts?: number;
  readonly directCommand?: Omit<DirectCommandCapabilityInvokerOptions, 'workspaceRoot'>;
  readonly containerBuild?: Omit<ContainerBuildCapabilityInvokerOptions, 'workspaceRoot'>;
  readonly kubernetesFixture?: Omit<KubernetesFixtureCapabilityInvokerOptions, 'workspaceRoot'>;
  readonly tailscaleExposure?: TailscaleExposureCapabilityInvokerOptions;
  readonly networkHttp?: NetworkHttpCapabilityInvokerOptions;
  readonly browserAxe?: BrowserAxeCapabilityInvokerOptions;
  readonly browserLighthouse?: BrowserLighthouseCapabilityInvokerOptions;
  readonly browserVisual?: BrowserVisualCapabilityInvokerOptions;
  readonly browserPlaywright?: Omit<BrowserPlaywrightCapabilityInvokerOptions, 'workspaceRoot'>;
  readonly securityScan?: Omit<SecurityScanCapabilityInvokerOptions, 'workspaceRoot'>;
  readonly kubernetesRuntimeSecurity?: Omit<KubernetesRuntimeSecurityCapabilityInvokerOptions, 'workspaceRoot'>;
  readonly dependencyReadiness?: { readonly maximumExecutionMs: number; readonly maximumOutputBytes: number };
  readonly now?: () => Date;
  readonly execute?: (
    job: RemotePlanJobV1,
    paths: Readonly<{ jobRoot: string; repositoryRoot: string; workspaceRoot: string; artifactRoot: string; observabilityRoot: string }>,
    signal: AbortSignal,
  ) => Promise<TestPlanRunResult>;
}

function jobDirectory(root: string, jobId: string): string {
  return path.join(root, crypto.createHash('sha256').update(jobId).digest('hex'));
}

async function runTar(
  executable: string,
  args: readonly string[],
  signal: AbortSignal,
  onLine?: (line: string) => void,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(executable, [...args], { stdio: ['ignore', 'pipe', 'pipe'] });
    let fault: Error | null = null;
    let pending = '';
    let stderr = '';
    const stop = (error: Error): void => {
      fault ??= error;
      child.kill('SIGKILL');
    };
    const timer = setTimeout(() => stop(new Error('BUSTER_REMOTE_ARCHIVE_TIMEOUT')), 120_000);
    const abort = () => stop(new Error('BUSTER_REMOTE_ARCHIVE_CANCELLED'));
    signal.addEventListener('abort', abort, { once: true });
    child.stdout.on('data', (chunk: Buffer) => {
      if (!onLine || fault) return;
      pending += chunk.toString('utf8');
      if (Buffer.byteLength(pending) > 1024 * 1024) {
        stop(new Error('BUSTER_REMOTE_ARCHIVE_LISTING_EXCEEDED'));
        return;
      }
      const lines = pending.split('\n');
      pending = lines.pop() ?? '';
      try { for (const line of lines) if (line) onLine(line); }
      catch (error) { stop(error instanceof Error ? error : new Error(String(error))); }
    });
    child.stderr.on('data', (chunk: Buffer) => {
      if (Buffer.byteLength(stderr) < 64 * 1024) stderr += chunk.toString('utf8');
    });
    child.once('error', (error) => { fault ??= error; });
    child.once('close', (code, terminationSignal) => {
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
      if (!fault && onLine && pending) {
        try { onLine(pending); } catch (error) { fault = error instanceof Error ? error : new Error(String(error)); }
      }
      if (fault) reject(fault);
      else if (code !== 0) reject(new Error(`BUSTER_REMOTE_TAR_FAILED:${code}:${terminationSignal ?? ''}:${stderr.slice(-4096)}`));
      else resolve();
    });
  });
}

async function safeExtract(
  tarExecutable: string,
  archive: string,
  target: string,
  maximumBytes: number,
  signal: AbortSignal,
): Promise<void> {
  let entries = 0;
  let total = 0;
  const unsafeName = (name: string): boolean => {
    if (name.startsWith('/') || name.includes('\0')) return true;
    const normalized = name.endsWith('/') ? name.slice(0, -1) : name;
    const parts = normalized.split('/');
    return parts.some((part, index) => part === '..' || part === '' || (part === '.' && index !== 0));
  };
  await runTar(tarExecutable, ['--numeric-owner', '-tvzf', archive], signal, (entry) => {
    entries += 1;
    if (entries > 200_000) throw new Error('BUSTER_REMOTE_ARCHIVE_ENTRY_LIMIT');
    if (!/^[-d]/u.test(entry)) throw new Error('BUSTER_REMOTE_ARCHIVE_TYPE_DENIED');
    const match = entry.match(/^\S+\s+\S+\s+(\d+)\s+\S+\s+\S+\s+(.+)$/u);
    if (!match?.[1] || !match[2] || unsafeName(match[2])) throw new Error('BUSTER_REMOTE_ARCHIVE_PATH_INVALID');
    const size = Number(match[1]);
    if (!Number.isSafeInteger(size) || size < 0) throw new Error('BUSTER_REMOTE_ARCHIVE_ENTRY_INVALID');
    total += size;
    if (!Number.isSafeInteger(total) || total > maximumBytes) {
      throw new Error('BUSTER_REMOTE_ARCHIVE_EXPANDED_SIZE_EXCEEDED');
    }
  });
  await runTar(tarExecutable, ['--no-same-owner', '--no-same-permissions', '-xzf', archive, '-C', target], signal);
}

function configuredBuildkitReadiness(options: BusterRemotePlanServiceOptions): BuildkitReadiness | undefined {
  if (!options.allowedCapabilities.has('container.build')) return undefined;
  if (!options.containerBuild) throw new Error('BUSTER_READINESS_BUILDKIT_CONFIG_REQUIRED');
  return new BuildkitReadiness({ buildctlExecutable: options.containerBuild.buildctlExecutable,
    buildkitHost: options.containerBuild.buildkitHost, maximumExecutionMs: options.dependencyReadiness?.maximumExecutionMs ?? 1000,
    maximumOutputBytes: options.dependencyReadiness?.maximumOutputBytes ?? 65536 });
}

export class BusterRemotePlanService {
  readonly #options: BusterRemotePlanServiceOptions;
  readonly #now: () => Date;
  readonly #active = new Map<string, AbortController>();
  readonly #executions = new Map<string, Promise<void>>();
  readonly #queue = new Map<string, RemotePlanJobV1>();
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
    if (!Number.isSafeInteger(options.maximumExtractedBytes) || options.maximumExtractedBytes < 1) {
      throw new Error('BUSTER_REMOTE_EXTRACTED_LIMIT_INVALID');
    }
    const tar = fs.realpathSync(options.tarExecutable);
    if (!path.isAbsolute(tar) || !fs.statSync(tar).isFile()) throw new Error('BUSTER_REMOTE_TAR_INVALID');
    if (!/^[a-f0-9]{40,64}$/u.test(options.workerRevision)) throw new Error('BUSTER_REMOTE_WORKER_REVISION_INVALID');
    this.#buildkitReadiness = configuredBuildkitReadiness(options);
    this.#options = { ...options, tarExecutable: tar };
    this.#now = options.now ?? (() => new Date());
    this.#maximumActiveJobs = options.maximumActiveJobs ?? 2;
    this.#maximumQueuedJobs = options.maximumQueuedJobs ?? 16;
    this.#maximumConcurrentAttempts = options.maximumConcurrentAttempts ?? 64;
    for (const limit of [this.#maximumActiveJobs, this.#maximumQueuedJobs, this.#maximumConcurrentAttempts]) {
      if (!Number.isSafeInteger(limit) || limit < 1) throw new Error('BUSTER_REMOTE_ADMISSION_LIMIT_INVALID');
    }
  }

  #validateAuthority(job: RemotePlanJobV1): void {
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

  async submit(job: RemotePlanJobV1): Promise<RemotePlanStatusV1> {
    this.#options.store.validate(job); this.#validateAuthority(job);
    let release!: () => void;
    const prior = this.#submission;
    this.#submission = new Promise<void>((resolve) => { release = resolve; });
    await prior;
    try {
      if (this.#stopping) throw new Error('BUSTER_REMOTE_SHUTTING_DOWN');
      const known = (await this.#options.store.records()).find((record) => record.payload.job.jobId === job.jobId);
      if (!known) {
        if (job.maximumConcurrency > this.#maximumConcurrentAttempts) throw new Error('BUSTER_REMOTE_CONCURRENCY_EXCEEDS_SERVICE_LIMIT');
        if (this.#queue.size >= this.#maximumQueuedJobs) throw new Error('BUSTER_REMOTE_ADMISSION_FULL');
      }
      if (!known || (known.payload.status.state === 'accepted' && !this.#active.has(job.jobId))) await this.#assertDependencies();
      if (this.#stopping) throw new Error('BUSTER_REMOTE_SHUTTING_DOWN');
      const status = await this.#options.store.accept(job, this.#now().toISOString());
      if (status.state === 'accepted' && !this.#active.has(job.jobId)) this.#start(job);
      return status;
    } finally { release(); }
  }

  async status(jobId: string): Promise<RemotePlanStatusV1> {
    return (await this.#options.store.get(jobId)).payload.status;
  }

  async evidence(jobId: string, contentDigest: string, maximumBytes: number): Promise<Buffer> {
    if (!/^sha256:[a-f0-9]{64}$/u.test(contentDigest)) throw new Error('BUSTER_REMOTE_EVIDENCE_DIGEST_INVALID');
    if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 0) throw new Error('BUSTER_REMOTE_EVIDENCE_LIMIT_INVALID');
    const status = await this.status(jobId);
    if (status.state !== 'completed' || !status.result) throw new Error('BUSTER_REMOTE_EVIDENCE_NOT_READY');
    const result = JSON.parse((await this.#options.store.result(jobId, status.result.contentDigest,
      status.result.sizeBytes)).toString('utf8')) as RemotePlanResultV1;
    const matches = resultArtifacts(result).filter(artifact => artifact.contentDigest === contentDigest);
    if (matches.length === 0) throw new Error('BUSTER_REMOTE_EVIDENCE_NOT_FOUND');
    if (matches.some(item => item.sizeBytes !== matches[0]!.sizeBytes)) throw new Error('BUSTER_REMOTE_EVIDENCE_IDENTITY_CONFLICT');
    let bytes!: Buffer;
    for (const artifact of matches) bytes = await readJobArtifact(this.#options.runtimeRoot, jobId, artifact, maximumBytes);
    return bytes;
  }

  async result(jobId: string, contentDigest: string, maximumBytes: number): Promise<Buffer> {
    return this.#options.store.result(jobId, contentDigest, maximumBytes);
  }

  async cancel(jobId: string): Promise<RemotePlanStatusV1> {
    const current = await this.status(jobId);
    if (['completed', 'failed', 'cancelled'].includes(current.state)) return current;
    const status = await this.#options.store.transition(
      jobId, ['accepted', 'running', 'cancelling'], 'cancelling', this.#now().toISOString(),
    );
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
      if (record.payload.schemaVersion === 'buster-plan-job-compacted-record.v1') continue;
      const { job, status } = record.payload;
      if (status.state === 'accepted') {
        try {
          this.#options.store.validate(job);
          this.#validateAuthority(job);
          if (job.maximumConcurrency > this.#maximumConcurrentAttempts) throw new Error('BUSTER_REMOTE_CONCURRENCY_EXCEEDS_SERVICE_LIMIT');
          this.#start(job);
        } catch (error) {
          await this.#options.store.transition(job.jobId, ['accepted'], 'failed', this.#now().toISOString(), {
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
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
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1) {
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

  #start(job: RemotePlanJobV1): void {
    if (this.#stopping || this.#active.has(job.jobId)) return;
    this.#queue.set(job.jobId, job); this.#drain();
  }

  #drain(): void {
    if (this.#stopping) return;
    for (const [id, job] of this.#queue) {
      const used = [...this.#weights.values()].reduce((a, b) => a + b, 0);
      if (this.#active.size >= this.#maximumActiveJobs || used + job.maximumConcurrency > this.#maximumConcurrentAttempts) return;
      this.#queue.delete(id);
      const controller = new AbortController(); this.#active.set(id, controller); this.#weights.set(id, job.maximumConcurrency);
      const execution = this.#execute(job, controller).catch((error: unknown) => {
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

  async #execute(job: RemotePlanJobV1, controller: AbortController): Promise<void> {
    try {
      await this.#options.store.transition(job.jobId, ['accepted'], 'running', this.#now().toISOString());
      const jobRoot = jobDirectory(path.resolve(this.#options.runtimeRoot), job.jobId);
      await ensureDirectoryDurable(jobRoot);
      const workspaceRoot = path.join(jobRoot, 'workspace');
      const repositoryRoot = path.join(workspaceRoot, 'repository');
      const artifactRoot = path.join(jobRoot, 'artifacts');
      const observabilityRoot = path.join(jobRoot, 'observability');
      for (const directory of [repositoryRoot, workspaceRoot, artifactRoot, observabilityRoot]) {
        await ensureDirectoryDurable(directory);
      }
      const archive = path.join(jobRoot, 'repository.tar.gz');
      fs.writeFileSync(archive, repositoryArchiveBytes(job.repositoryArchive), { flag: 'wx', mode: 0o600 });
      try {
        await safeExtract(this.#options.tarExecutable, archive, repositoryRoot,
          this.#options.maximumExtractedBytes, controller.signal);
      } catch (error) {
        await cleanupTerminalWorkspace(jobRoot);
        throw error;
      } finally { fs.rmSync(archive, { force: true }); }
      const paths = { jobRoot, repositoryRoot, workspaceRoot, artifactRoot, observabilityRoot };
      const directCommand = this.#options.allowedCapabilities.has('command.execute')
        ? new DirectCommandCapabilityInvoker({
          ...(this.#options.directCommand ?? (() => { throw new Error('BUSTER_DIRECT_COMMAND_CONFIG_REQUIRED'); })()),
          workspaceRoot,
        })
        : null;
      const containerBuild = this.#options.allowedCapabilities.has('container.build')
        ? new ContainerBuildCapabilityInvoker({
          ...(this.#options.containerBuild ?? (() => { throw new Error('BUSTER_CONTAINER_BUILD_CONFIG_REQUIRED'); })()),
          workspaceRoot,
        })
        : null;
      const kubernetesFixture = this.#options.allowedCapabilities.has('kubernetes.fixture')
        ? new KubernetesFixtureCapabilityInvoker({
          ...(this.#options.kubernetesFixture ?? (() => { throw new Error('BUSTER_KUBERNETES_FIXTURE_CONFIG_REQUIRED'); })()),
          workspaceRoot: jobRoot,
        })
        : null;
      const tailscaleExposure = this.#options.allowedCapabilities.has('kubernetes.exposure')
        ? new TailscaleExposureCapabilityInvoker(this.#options.tailscaleExposure
          ?? (() => { throw new Error('BUSTER_TAILSCALE_EXPOSURE_CONFIG_REQUIRED'); })())
        : null;
      const networkHttp = this.#options.allowedCapabilities.has('network.http')
        ? new NetworkHttpCapabilityInvoker(this.#options.networkHttp
          ?? (() => { throw new Error('BUSTER_NETWORK_HTTP_CONFIG_REQUIRED'); })())
        : null;
      const browserAxe = this.#options.allowedCapabilities.has('browser.axe')
        ? new BrowserAxeCapabilityInvoker(this.#options.browserAxe
          ?? (() => { throw new Error('BUSTER_BROWSER_AXE_CONFIG_REQUIRED'); })())
        : null;
      const browserLighthouse = this.#options.allowedCapabilities.has('browser.lighthouse')
        ? new BrowserLighthouseCapabilityInvoker(this.#options.browserLighthouse
          ?? (() => { throw new Error('BUSTER_BROWSER_LIGHTHOUSE_CONFIG_REQUIRED'); })())
        : null;
      const browserVisual = this.#options.allowedCapabilities.has('browser.visual')
        ? new BrowserVisualCapabilityInvoker(this.#options.browserVisual
          ?? (() => { throw new Error('BUSTER_BROWSER_VISUAL_CONFIG_REQUIRED'); })())
        : null;
      const browserPlaywright = this.#options.allowedCapabilities.has('browser.playwright')
        ? new BrowserPlaywrightCapabilityInvoker({
          ...(this.#options.browserPlaywright ?? (() => { throw new Error('BUSTER_BROWSER_PLAYWRIGHT_CONFIG_REQUIRED'); })()),
          workspaceRoot,
        }) : null;
      const securityScan = this.#options.allowedCapabilities.has('security.scan')
        ? new SecurityScanCapabilityInvoker({
          ...(this.#options.securityScan ?? (() => { throw new Error('BUSTER_SECURITY_SCAN_CONFIG_REQUIRED'); })()),
          workspaceRoot: jobRoot,
        }) : null;
      const kubernetesRuntimeSecurity = this.#options.allowedCapabilities.has('kubernetes.runtime-security')
        ? new KubernetesRuntimeSecurityCapabilityInvoker({
          ...(this.#options.kubernetesRuntimeSecurity
            ?? (() => { throw new Error('BUSTER_KUBERNETES_RUNTIME_SECURITY_CONFIG_REQUIRED'); })()),
          workspaceRoot: jobRoot,
        }) : null;
      const routes = new Map();
      if (directCommand) routes.set('command.execute', directCommand);
      if (containerBuild) routes.set('container.build', containerBuild);
      if (kubernetesFixture) routes.set('kubernetes.fixture', kubernetesFixture);
      if (tailscaleExposure) routes.set('kubernetes.exposure', tailscaleExposure);
      if (networkHttp) routes.set('network.http', networkHttp);
      if (browserAxe) routes.set('browser.axe', browserAxe);
      if (browserLighthouse) routes.set('browser.lighthouse', browserLighthouse);
      if (browserVisual) routes.set('browser.visual', browserVisual);
      if (browserPlaywright) routes.set('browser.playwright', browserPlaywright);
      if (securityScan) routes.set('security.scan', securityScan);
      if (kubernetesRuntimeSecurity) routes.set('kubernetes.runtime-security', kubernetesRuntimeSecurity);
      const capabilities = routes.size ? new CompositeTestProviderCapabilityInvoker(routes) : null;
      const run = this.#options.execute
        ? await this.#options.execute(job, paths, controller.signal)
        : await new TestPlanRunner({
          plan: job.plan,
          registry: this.#options.registry,
          workspaceRoot,
          repositoryRoot,
          artifactRoot,
          observabilityRoot,
          maximumConcurrency: job.maximumConcurrency,
          grants: new Map(Object.entries(job.grants)),
          ...(capabilities ? { capabilityInvoker: capabilities } : {}),
          signal: controller.signal,
        }).run().finally(() => directCommand?.shutdown());
      if (run.cleanupErrors.length === 0 && run.attempts.every((attempt) => attempt.executionState === 'completed')) {
        await cleanupTerminalWorkspace(jobRoot);
      }
      if (controller.signal.aborted) {
        await this.#options.store.transition(job.jobId, ['running', 'cancelling'], 'cancelled',
          this.#now().toISOString(), { error: 'cancelled by Nova' });
        return;
      }
      const unsigned = {
        schemaVersion: 'buster-plan-result.v1' as const,
        workerRevision: this.#options.workerRevision,
        jobId: job.jobId,
        planId: job.plan.planId,
        planDigest: job.plan.planDigest,
        runId: job.plan.runId,
        attempts: [...run.attempts],
        nodes: [...run.nodes],
        cleanupErrors: [...run.cleanupErrors],
        completedAt: this.#now().toISOString(),
      };
      const resultDigest = remotePlanResultDigest(unsigned);
      const result: RemotePlanResultV1 = { ...unsigned, resultDigest, receipt: remotePlanResultReceipt(job.jobId, resultDigest) };
      validatePipelineTestGateContract('remotePlanResult', result);
      await this.#options.store.complete(job.jobId, result, this.#now().toISOString());
    } catch (error) {
      const current = await this.status(job.jobId).catch((readError: unknown) => {
        throw new AggregateError([error, readError], 'BUSTER_REMOTE_TERMINAL_STATUS_UNREADABLE');
      });
      if (['completed', 'failed', 'cancelled'].includes(current.state)) return;
      const cancelled = controller.signal.aborted || current.state === 'cancelling';
      await this.#options.store.transition(
        job.jobId,
        [current.state],
        cancelled ? 'cancelled' : 'failed',
        this.#now().toISOString(),
        { error: error instanceof Error ? error.message : String(error) },
      );
    }
  }
}
