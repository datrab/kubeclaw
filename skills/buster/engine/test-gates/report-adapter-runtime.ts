import { validateBusterReportSettings, validateBusterProcessInputSettings, type BusterProcessInputSettings, type BusterReportExecutionSettings } from '@kubeclaw/plugin-foundation/config/buster-execution';
import { readPackage, writePackageSnapshot } from './report-adapter-package.ts';
import type { ReportArtifactReader } from './report-artifact-reader.ts';
export { FileReportArtifactReader, type ReportArtifactReader } from './report-artifact-reader.ts';
import crypto from 'node:crypto';
import { ProcessInputCleanupError, runProcessInput } from './process-input.ts';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import type { ArtifactRefV1, ReportAdapterResultV1 } from '@kubeclaw/pipeline-test-gate-contract';
import { validatePipelineTestGateContract } from '@kubeclaw/pipeline-test-gate-contract';
import type { ReportAdapterLimits, ReportAdapterOutput } from '@kubeclaw/plugin-sdk';
import type { ReportAdapterRegistryEntry } from '@kubeclaw/plugin-foundation/registry/types';

export interface ReportAdapterRuntimeLimits extends ReportAdapterLimits {
  readonly maximumSourceBytes: number;
  readonly maximumResultBytes: number;
  readonly timeoutMs: number;
  readonly memoryBytes: number;
  readonly cpuMillis: number;
  readonly openFiles: number;
}

const REQUIRED_LIMITS = Object.freeze([
  'maximumCases', 'maximumFindings', 'maximumCaseFindings',
  'maximumSourceBytes', 'maximumResultBytes', 'timeoutMs',
  'memoryBytes', 'cpuMillis', 'openFiles',
] as const satisfies readonly (keyof ReportAdapterRuntimeLimits)[]);

function positiveInteger(value: number, code: string): void {
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(code);
}

function abortable<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(signal.reason ?? new Error('REPORT_ADAPTER_CANCELLED'));
  return new Promise<T>((resolve, reject) => {
    const abort = () => finish(signal.reason ?? new Error('REPORT_ADAPTER_CANCELLED'));
    const finish = (error?: unknown, value?: T) => {
      signal.removeEventListener('abort', abort);
      if (error !== undefined) reject(error); else resolve(value as T);
    };
    signal.addEventListener('abort', abort, { once: true });
    operation.then((value) => finish(undefined, value), (error: unknown) => finish(error));
  });
}

function runtimePaths(): { launcher: string; child: string } {
  const launcher = fileURLToPath(import.meta.resolve('@kubeclaw/plugin-foundation/isolation/plugin-sandbox'));
  const child = path.join(path.dirname(fileURLToPath(import.meta.url)), 'report-adapter-child.mjs');
  if (!fs.existsSync(launcher)) throw new Error('REPORT_ADAPTER_SANDBOX_NOT_BUILT');
  return { launcher, child };
}

function validateLimits(limits: ReportAdapterRuntimeLimits, policy: BusterReportExecutionSettings): void {
  if (!limits || typeof limits !== 'object' || Array.isArray(limits)) {
    throw new Error('REPORT_ADAPTER_LIMITS_INVALID');
  }
  for (const name of REQUIRED_LIMITS) {
    positiveInteger(limits[name], `REPORT_ADAPTER_LIMIT_INVALID:${name}`);
  }
  // Structural maxima are reportCase/reportAdapterResult constraints in pipeline-test-gate.v1.schema.json.
  if (limits.maximumCases > 5_000 || limits.maximumFindings > 5_000 || limits.maximumCaseFindings > 100) {
    throw new Error('REPORT_ADAPTER_DETAIL_LIMIT_EXCEEDS_CONTRACT');
  }
  const selectedCeilings = {
    maximumCases: policy.maximumCases, maximumFindings: policy.maximumFindings,
    maximumCaseFindings: policy.maximumCaseFindings,
    maximumSourceBytes: policy.maximumSourceBytes, maximumResultBytes: policy.maximumAggregateResultBytes,
    timeoutMs: policy.maximumTimeoutMs, memoryBytes: policy.memoryBytes,
    cpuMillis: Math.max(policy.minimumCpuTimeMs, Math.floor(policy.maximumTimeoutMs / 1000) * 1000),
    openFiles: policy.maximumOpenFiles,
  };
  for (const [name, maximum] of Object.entries(selectedCeilings)) {
    if (limits[name as keyof typeof selectedCeilings] > maximum) throw new Error(`REPORT_ADAPTER_HARD_LIMIT_EXCEEDED:${name}`);
  }
  if (limits.cpuMillis < policy.minimumCpuTimeMs) throw new Error('REPORT_ADAPTER_CPU_LIMIT_BELOW_POLICY');
  if (limits.openFiles < policy.minimumOpenFiles) throw new Error('REPORT_ADAPTER_OPEN_FILE_LIMIT_TOO_LOW');
  const requiredMemory = policy.runtimeMemoryReserveBytes
    + (limits.maximumSourceBytes * 3)
    + (limits.maximumResultBytes * 2);
  if (limits.memoryBytes < requiredMemory) throw new Error('REPORT_ADAPTER_MEMORY_LIMIT_INCOMPATIBLE');
}

function bindReportResult(value: ReportAdapterOutput, entry: ReportAdapterRegistryEntry,
  artifact: ArtifactRefV1, limits: ReportAdapterRuntimeLimits): ReportAdapterResultV1 {
  const result: ReportAdapterResultV1 = {
    ...value,
    schemaVersion: 'report-adapter-result.v1',
    adapter: {
      adapterId: entry.registration.adapterId,
      format: entry.registration.format,
      contractVersion: entry.registration.contractVersion,
      package: { ...entry.registration.package },
    },
    sourceArtifact: { ...artifact },
  };
  validatePipelineTestGateContract('reportAdapterResult', result);
  if (result.cases.length > limits.maximumCases) throw new Error('REPORT_ADAPTER_CASE_LIMIT');
  if (result.findings.length > limits.maximumFindings) throw new Error('REPORT_ADAPTER_FINDING_LIMIT');
  if (result.cases.some((reportCase) => reportCase.findings.length > limits.maximumCaseFindings)) {
    throw new Error('REPORT_ADAPTER_CASE_FINDING_LIMIT');
  }
  return Object.freeze(structuredClone(result));
}

export class RegisteredReportAdapterRuntime {
  readonly #policy: BusterReportExecutionSettings;
  readonly #processInputPolicy: BusterProcessInputSettings;
  readonly #reader: ReportArtifactReader;
  readonly #runtimeRoot: string;
  readonly #runtimeRootIdentity: { readonly dev: number; readonly ino: number };

  constructor(reader: ReportArtifactReader, runtimeRoot: string, policy: BusterReportExecutionSettings, processInputPolicy: BusterProcessInputSettings) {
    this.#processInputPolicy = validateBusterProcessInputSettings(processInputPolicy);
    this.#policy = validateBusterReportSettings(policy);
    if (!path.isAbsolute(runtimeRoot)) throw new Error('REPORT_ADAPTER_RUNTIME_ROOT_NOT_ABSOLUTE');
    const resolvedRoot = path.resolve(runtimeRoot);
    if (resolvedRoot === path.parse(resolvedRoot).root) throw new Error('REPORT_ADAPTER_RUNTIME_ROOT_TOO_BROAD');
    fs.mkdirSync(runtimeRoot, { recursive: true, mode: 0o700 });
    const rootStat = fs.lstatSync(runtimeRoot);
    if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) throw new Error('REPORT_ADAPTER_RUNTIME_ROOT_FORBIDDEN');
    if (typeof process.getuid === 'function' && rootStat.uid !== process.getuid()) {
      throw new Error('REPORT_ADAPTER_RUNTIME_ROOT_OWNER_MISMATCH');
    }
    const parentStat = fs.statSync(path.dirname(runtimeRoot));
    const sticky = (parentStat.mode & 0o1000) !== 0;
    const writableByOthers = (parentStat.mode & 0o022) !== 0;
    if (writableByOthers) {
      const currentUid = typeof process.getuid === 'function' ? process.getuid() : undefined;
      const trustedOwner = currentUid === undefined || parentStat.uid === currentUid || parentStat.uid === 0;
      if (!sticky || !trustedOwner) throw new Error('REPORT_ADAPTER_RUNTIME_PARENT_FORBIDDEN');
    }
    fs.chmodSync(runtimeRoot, 0o700);
    this.#reader = reader;
    this.#runtimeRoot = fs.realpathSync(runtimeRoot);
    const identity = fs.statSync(this.#runtimeRoot);
    this.#runtimeRootIdentity = { dev: identity.dev, ino: identity.ino };
  }

  #assertRuntimeRoot(): void {
    const current = fs.lstatSync(this.#runtimeRoot);
    const canonical = fs.realpathSync(this.#runtimeRoot);
    if (!current.isDirectory() || current.isSymbolicLink() || canonical !== this.#runtimeRoot
      || current.dev !== this.#runtimeRootIdentity.dev || current.ino !== this.#runtimeRootIdentity.ino) {
      throw new Error('REPORT_ADAPTER_RUNTIME_ROOT_CHANGED');
    }
  }

  async adapt(entry: ReportAdapterRegistryEntry, artifact: ArtifactRefV1,
    limits: ReportAdapterRuntimeLimits, signal?: AbortSignal): Promise<ReportAdapterResultV1> {
    validateLimits(limits, this.#policy);
    const deadline = new AbortController();
    const timer = setTimeout(() => deadline.abort(new Error('REPORT_ADAPTER_TIMEOUT')), limits.timeoutMs);
    const boundedSignal = signal ? AbortSignal.any([signal, deadline.signal]) : deadline.signal;
    try {
      return await this.#adaptWithinDeadline(entry, artifact, limits, boundedSignal);
    } catch (error) {
      // The process helper wraps signal aborts after drain; preserve our own deadline identity.
      if (deadline.signal.aborted && boundedSignal.reason === deadline.signal.reason
        && error instanceof Error && error.message === 'REPORT_ADAPTER_CANCELLED'
        && error.cause === deadline.signal.reason) throw deadline.signal.reason;
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  async #readSource(entry: ReportAdapterRegistryEntry, artifact: ArtifactRefV1,
    limits: ReportAdapterRuntimeLimits, signal: AbortSignal): Promise<Buffer> {
    if (artifact.type !== 'test-report') {
      throw new Error(`REPORT_ADAPTER_ARTIFACT_TYPE_FORBIDDEN:${artifact.type}`);
    }
    if (!entry.registration.mediaTypes.includes(artifact.mediaType)) {
      throw new Error(`REPORT_ADAPTER_MEDIA_TYPE_UNSUPPORTED:${artifact.mediaType}`);
    }
    if (signal.aborted) throw signal.reason ?? new Error('REPORT_ADAPTER_CANCELLED');
    const bytes = await abortable(this.#reader.read(artifact, limits.maximumSourceBytes, signal), signal);
    if (signal.aborted) throw signal.reason ?? new Error('REPORT_ADAPTER_CANCELLED');
    if (bytes.byteLength !== artifact.sizeBytes || bytes.byteLength > limits.maximumSourceBytes) {
      throw new Error('REPORT_ARTIFACT_SIZE_MISMATCH');
    }
    const sourceDigest = `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`;
    if (sourceDigest !== artifact.contentDigest) throw new Error('REPORT_ARTIFACT_DIGEST_MISMATCH');
    return bytes;
  }

  async #adaptWithinDeadline(entry: ReportAdapterRegistryEntry, artifact: ArtifactRefV1,
    limits: ReportAdapterRuntimeLimits, signal: AbortSignal): Promise<ReportAdapterResultV1> {
    this.#assertRuntimeRoot();
    const bytes = await this.#readSource(entry, artifact, limits, signal);
    const expectedDigest = entry.registration.package.contentDigest;
    const sourcePackage = await abortable(readPackage(entry.package.root, signal), signal);
    if (sourcePackage.digest !== expectedDigest) {
      throw new Error(`REPORT_ADAPTER_PACKAGE_DIGEST_MISMATCH:${entry.registration.adapterId}`);
    }

    const snapshot = path.join(this.#runtimeRoot, `adapter-${crypto.randomUUID()}`);
    let disposalConfirmed = true;
    try {
      await abortable(writePackageSnapshot(snapshot, sourcePackage.files, signal), signal);
      this.#assertRuntimeRoot();
      const copiedPackage = await abortable(readPackage(snapshot, signal), signal);
      if (copiedPackage.digest !== expectedDigest) throw new Error('REPORT_ADAPTER_PACKAGE_SNAPSHOT_MISMATCH');
      if (signal.aborted) throw signal.reason ?? new Error('REPORT_ADAPTER_CANCELLED');
      const packageRoot = fs.realpathSync(snapshot);
      const modulePath = fs.realpathSync(path.resolve(packageRoot, entry.registration.entrypoint.module));
      if (!modulePath.startsWith(`${packageRoot}${path.sep}`) || !fs.statSync(modulePath).isFile()) {
        throw new Error('REPORT_ADAPTER_MODULE_FORBIDDEN');
      }
      const value = await this.#run(entry, artifact, bytes, limits, packageRoot, modulePath, signal);
      return bindReportResult(value, entry, artifact, limits);
    } catch (error) {
      if (error instanceof ProcessInputCleanupError) disposalConfirmed = false;
      throw error;
    } finally {
      if (disposalConfirmed) fs.rmSync(snapshot, { recursive: true, force: true });
    }
  }

  async #run(entry: ReportAdapterRegistryEntry, artifact: ArtifactRefV1, bytes: Buffer,
    limits: ReportAdapterRuntimeLimits, packageRoot: string, modulePath: string,
    signal?: AbortSignal): Promise<ReportAdapterOutput> {
    if (signal?.aborted) return Promise.reject(signal.reason ?? new Error('REPORT_ADAPTER_CANCELLED'));
    if (limits.cpuMillis % 1000 !== 0) return Promise.reject(new Error('REPORT_ADAPTER_CPU_LIMIT_GRANULARITY'));
    const runtime = runtimePaths();
    const result = await runProcessInput(runtime.launcher, [
        String(limits.memoryBytes), String(limits.cpuMillis / 1000),
        String(limits.openFiles), process.execPath,
        `--max-old-space-size=${Math.max(this.#policy.minimumHeapMiB, Math.floor(limits.memoryBytes / (1024 * 1024) * this.#policy.heapFraction))}`,
        '--permission', `--allow-fs-read=${runtime.child}`, `--allow-fs-read=${packageRoot}`,
        '--no-addons', '--no-experimental-sqlite', runtime.child,
      ], {
      processInputPolicy: this.#processInputPolicy, cwd: packageRoot, env: { NODE_NO_WARNINGS: '1' }, ...(signal ? { signal } : {}),
      timeoutMs: limits.timeoutMs, maximumOutputBytes: limits.maximumResultBytes,
      prefix: 'REPORT_ADAPTER', outputLimitError: 'REPORT_ADAPTER_RESULT_LIMIT', input: `${JSON.stringify({
        kind: 'adapt',
        modulePath,
        exportName: entry.registration.entrypoint.export,
        mediaType: artifact.mediaType,
        contentBase64: bytes.toString('base64'),
        limits: {
          maximumCases: limits.maximumCases,
          maximumFindings: limits.maximumFindings,
          maximumCaseFindings: limits.maximumCaseFindings,
        },
      })}\n`,
    });
    const lines = result.stdout.toString('utf8').trim().split('\n');
    if (lines.length !== 1) throw new Error('REPORT_ADAPTER_PROTOCOL_INVALID');
    let message: { kind?: string; value?: ReportAdapterOutput; error?: string };
    try { message = JSON.parse(lines[0]!) as typeof message; }
    catch (error) { throw new Error(`REPORT_ADAPTER_PROTOCOL_INVALID:${String(result.code)}:${String(result.signal)}`, { cause: error }); }
    if (message.kind === 'result' && result.code === 0 && message.value) return message.value;
    throw new Error(`REPORT_ADAPTER_FAILED:${message.error ?? `${String(result.code)}:${String(result.signal)}`}`);
  }
}
