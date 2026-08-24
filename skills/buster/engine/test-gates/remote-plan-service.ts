import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
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
import { ensureDirectoryDurable } from '@kubeclaw/plugin-foundation/observability/durable-delivery';
import type { RegistrySnapshot } from '@kubeclaw/plugin-foundation/registry/types';
import { TestPlanRunner, type TestPlanRunResult } from './runner.ts';
import { DirectCommandCapabilityInvoker, type DirectCommandCapabilityInvokerOptions } from './direct-command-runtime.ts';
import { ContainerBuildCapabilityInvoker, type ContainerBuildCapabilityInvokerOptions } from './container-build-runtime.ts';
import { KubernetesFixtureCapabilityInvoker, type KubernetesFixtureCapabilityInvokerOptions } from './kubernetes-fixture-runtime.ts';
import { TailscaleExposureCapabilityInvoker, type TailscaleExposureCapabilityInvokerOptions } from './tailscale-exposure-runtime.ts';
import { NetworkHttpCapabilityInvoker, type NetworkHttpCapabilityInvokerOptions } from './network-http-runtime.ts';
import { CompositeTestProviderCapabilityInvoker } from './composite-capability-runtime.ts';

interface StoredPlanJob {
  readonly schemaVersion: 'buster-plan-job-record.v1';
  readonly job: RemotePlanJobV1;
  readonly status: RemotePlanStatusV1;
}

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
  readonly #trustedSourceAuthority: string;
  readonly #sourceAttestationPublicKey: string | Buffer;

  constructor(root: string, options: BusterPlanJobStoreOptions) {
    if (!Number.isSafeInteger(options.maximumArchiveBytes) || options.maximumArchiveBytes < 1) {
      throw new Error('BUSTER_REMOTE_ARCHIVE_LIMIT_INVALID');
    }
    if (!Number.isSafeInteger(options.maximumResultBytes) || options.maximumResultBytes < 1) {
      throw new Error('BUSTER_REMOTE_RESULT_LIMIT_INVALID');
    }
    this.#records = new FileDurableRecordStore(root, options.recordLimits);
    this.#results = new FileDurableBlobStore(path.join(root, 'results'), options.maximumResultStoreBytes);
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
    const existingRecord = (await this.records()).find((item) => item.idempotencyKey === job.idempotencyKey);
    if (existingRecord) {
      if (existingRecord.payload.job.jobId !== job.jobId
        || existingRecord.payload.job.requestDigest !== job.requestDigest) {
        throw new Error('BUSTER_REMOTE_JOB_CONFLICT');
      }
      return structuredClone(existingRecord.payload.status);
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
    return this.#records.read<StoredPlanJob>('buster-plan-jobs');
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
    const bytes = Buffer.from(canonicalJson(result));
    if (bytes.byteLength > this.#maximumResultBytes) throw new Error('BUSTER_REMOTE_RESULT_SIZE_EXCEEDED');
    const storedResult = await this.#results.put(bytes);
    const current = await this.get(jobId);
    if (current.payload.status.state === 'completed') {
      if (current.payload.status.result?.contentDigest !== storedResult.digest
        || current.payload.status.result.resultDigest !== result.resultDigest) {
        throw new Error('BUSTER_REMOTE_RESULT_CONFLICT');
      }
      return current.payload.status;
    }
    if (current.payload.status.state !== 'running') {
      throw new Error(`BUSTER_REMOTE_JOB_STATE_CONFLICT:${current.payload.status.state}`);
    }
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
  readonly runtimeRoot: string;
  readonly tarExecutable: string;
  readonly maximumExtractedBytes: number;
  readonly allowedCapabilities: ReadonlySet<string>;
  readonly directCommand?: Omit<DirectCommandCapabilityInvokerOptions, 'workspaceRoot'>;
  readonly containerBuild?: Omit<ContainerBuildCapabilityInvokerOptions, 'workspaceRoot'>;
  readonly kubernetesFixture?: Omit<KubernetesFixtureCapabilityInvokerOptions, 'workspaceRoot'>;
  readonly tailscaleExposure?: TailscaleExposureCapabilityInvokerOptions;
  readonly networkHttp?: NetworkHttpCapabilityInvokerOptions;
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

export class BusterRemotePlanService {
  readonly #options: BusterRemotePlanServiceOptions;
  readonly #now: () => Date;
  readonly #active = new Map<string, AbortController>();
  readonly #executions = new Map<string, Promise<void>>();

  constructor(options: BusterRemotePlanServiceOptions) {
    if (!Number.isSafeInteger(options.maximumExtractedBytes) || options.maximumExtractedBytes < 1) {
      throw new Error('BUSTER_REMOTE_EXTRACTED_LIMIT_INVALID');
    }
    const tar = fs.realpathSync(options.tarExecutable);
    if (!path.isAbsolute(tar) || !fs.statSync(tar).isFile()) throw new Error('BUSTER_REMOTE_TAR_INVALID');
    this.#options = { ...options, tarExecutable: tar };
    this.#now = options.now ?? (() => new Date());
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

  async submit(job: RemotePlanJobV1): Promise<RemotePlanStatusV1> {
    this.#options.store.validate(job);
    this.#validateAuthority(job);
    const status = await this.#options.store.accept(job, this.#now().toISOString());
    if (status.state === 'accepted' && !this.#active.has(job.jobId)) this.#start(job);
    return status;
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
    const artifacts = result.attempts.flatMap((attempt) => [
      ...attempt.evidence.map((item) => item.artifact),
      ...attempt.outputs.filter((item) => item.kind === 'artifact').map((item) => item.artifact),
      ...attempt.reports.map((item) => item.sourceArtifact),
    ]);
    const matches = artifacts.filter((artifact) => artifact.contentDigest === contentDigest);
    if (matches.length === 0) throw new Error('BUSTER_REMOTE_EVIDENCE_NOT_FOUND');
    const expected = matches[0]!;
    if (matches.some((item) => item.sizeBytes !== expected.sizeBytes)) {
      throw new Error('BUSTER_REMOTE_EVIDENCE_IDENTITY_CONFLICT');
    }
    if (expected.sizeBytes > maximumBytes) throw new Error('BUSTER_REMOTE_EVIDENCE_SIZE_EXCEEDED');
    const source = new URL(expected.storageUrl);
    if (source.protocol !== 'file:') throw new Error('BUSTER_REMOTE_EVIDENCE_STORAGE_UNSUPPORTED');
    const candidate = fs.realpathSync(fileURLToPath(source));
    const root = fs.realpathSync(jobDirectory(path.resolve(this.#options.runtimeRoot), jobId));
    if (candidate !== root && !candidate.startsWith(`${root}${path.sep}`)) {
      throw new Error('BUSTER_REMOTE_EVIDENCE_PATH_FORBIDDEN');
    }
    const handle = await fs.promises.open(candidate, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    try {
      const stat = await handle.stat();
      if (!stat.isFile() || stat.size !== expected.sizeBytes || stat.size > maximumBytes) {
        throw new Error('BUSTER_REMOTE_EVIDENCE_SIZE_MISMATCH');
      }
      const bounded = Buffer.alloc(expected.sizeBytes + 1);
      let total = 0;
      while (total < bounded.byteLength) {
        const read = await handle.read(bounded, total, bounded.byteLength - total, total);
        if (read.bytesRead === 0) break;
        total += read.bytesRead;
      }
      if (total !== expected.sizeBytes) throw new Error('BUSTER_REMOTE_EVIDENCE_SIZE_MISMATCH');
      const bytes = bounded.subarray(0, total);
      const digest = `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`;
      if (digest !== contentDigest) throw new Error('BUSTER_REMOTE_EVIDENCE_DIGEST_MISMATCH');
      return bytes;
    } finally { await handle.close(); }
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
    this.#active.get(jobId)?.abort(new Error('BUSTER_REMOTE_CANCELLED'));
    if (!this.#active.has(jobId)) {
      return this.#options.store.transition(
        jobId, ['cancelling'], 'cancelled', this.#now().toISOString(), { error: 'cancelled before execution' },
      );
    }
    return status;
  }

  async recover(): Promise<void> {
    for (const record of await this.#options.store.records()) {
      const { job, status } = record.payload;
      if (status.state === 'accepted') {
        try {
          this.#options.store.validate(job);
          this.#validateAuthority(job);
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
    }
  }

  async shutdown(timeoutMs: number): Promise<void> {
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1) {
      throw new Error('BUSTER_REMOTE_SHUTDOWN_TIMEOUT_INVALID');
    }
    for (const controller of this.#active.values()) {
      controller.abort(new Error('BUSTER_REMOTE_SHUTDOWN'));
    }
    if (this.#executions.size === 0) return;
    let timer: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        Promise.allSettled([...this.#executions.values()]),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => reject(new Error('BUSTER_REMOTE_SHUTDOWN_TIMEOUT')), timeoutMs);
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  #start(job: RemotePlanJobV1): void {
    if (this.#active.has(job.jobId)) return;
    const controller = new AbortController();
    this.#active.set(job.jobId, controller);
    const execution = this.#execute(job, controller).finally(() => {
      this.#active.delete(job.jobId);
      this.#executions.delete(job.jobId);
    });
    this.#executions.set(job.jobId, execution);
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
      await safeExtract(
        this.#options.tarExecutable,
        archive,
        repositoryRoot,
        this.#options.maximumExtractedBytes,
        controller.signal,
      );
      fs.rmSync(archive, { force: true });
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
      const routes = new Map();
      if (directCommand) routes.set('command.execute', directCommand);
      if (containerBuild) routes.set('container.build', containerBuild);
      if (kubernetesFixture) routes.set('kubernetes.fixture', kubernetesFixture);
      if (tailscaleExposure) routes.set('kubernetes.exposure', tailscaleExposure);
      if (networkHttp) routes.set('network.http', networkHttp);
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
      if (controller.signal.aborted) {
        await this.#options.store.transition(job.jobId, ['running', 'cancelling'], 'cancelled',
          this.#now().toISOString(), { error: 'cancelled by Nova' });
        return;
      }
      const unsigned = {
        schemaVersion: 'buster-plan-result.v1' as const,
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
      const current = await this.status(job.jobId).catch(() => null);
      if (!current || ['completed', 'failed', 'cancelled'].includes(current.state)) return;
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
