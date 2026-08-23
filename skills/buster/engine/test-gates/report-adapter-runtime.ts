import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
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

export interface ReportArtifactReader {
  read(artifact: ArtifactRefV1, maximumBytes: number, signal?: AbortSignal): Promise<Buffer>;
}

const DIGEST = /^sha256:[a-f0-9]{64}$/u;
const HARD_LIMITS = Object.freeze({
  maximumSourceBytes: 64 * 1024 * 1024,
  maximumResultBytes: 16 * 1024 * 1024,
  timeoutMs: 5 * 60 * 1000,
  memoryBytes: 2 * 1024 * 1024 * 1024,
  cpuMillis: 5 * 60 * 1000,
  openFiles: 256,
});
const MAXIMUM_PACKAGE_FILES = 2_048;
const MAXIMUM_PACKAGE_BYTES = 64 * 1024 * 1024;
const PACKAGE_SNAPSHOT_TIMEOUT_MS = 30_000;
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

interface PackageFile {
  readonly relative: string;
  readonly bytes: Buffer;
}

async function readPackage(root: string, signal?: AbortSignal): Promise<{ digest: string; files: PackageFile[] }> {
  const started = Date.now();
  const files: PackageFile[] = [];
  let totalBytes = 0;
  const check = () => {
    if (signal?.aborted) throw signal.reason ?? new Error('REPORT_ADAPTER_CANCELLED');
    if (Date.now() - started > PACKAGE_SNAPSHOT_TIMEOUT_MS) throw new Error('REPORT_ADAPTER_PACKAGE_SNAPSHOT_TIMEOUT');
  };
  const visit = async (relative = ''): Promise<void> => {
    check();
    const directory = path.join(root, relative);
    const entries = (await fs.promises.readdir(directory, { withFileTypes: true }))
      .sort((left, right) => left.name < right.name ? -1 : left.name > right.name ? 1 : 0);
    for (const entry of entries) {
      check();
      const child = path.join(relative, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`REPORT_ADAPTER_PACKAGE_SYMLINK:${child}`);
      if (entry.isDirectory()) { await visit(child); continue; }
      if (!entry.isFile()) throw new Error(`REPORT_ADAPTER_PACKAGE_ENTRY_INVALID:${child}`);
      if (files.length >= MAXIMUM_PACKAGE_FILES) throw new Error('REPORT_ADAPTER_PACKAGE_FILE_LIMIT');
      const source = path.join(root, child);
      const handle = await fs.promises.open(source, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
      try {
        const stat = await handle.stat();
        if (!stat.isFile() || stat.size > MAXIMUM_PACKAGE_BYTES - totalBytes) {
          throw new Error('REPORT_ADAPTER_PACKAGE_BYTE_LIMIT');
        }
        const content = Buffer.alloc(stat.size + 1);
        let offset = 0;
        while (offset < content.byteLength) {
          check();
          const { bytesRead } = await handle.read(content, offset, content.byteLength - offset, offset);
          if (bytesRead === 0) break;
          offset += bytesRead;
        }
        if (offset !== stat.size) throw new Error('REPORT_ADAPTER_PACKAGE_CHANGED');
        totalBytes += offset;
        files.push({ relative: child, bytes: content.subarray(0, offset) });
      } finally { await handle.close(); }
    }
  };
  await visit();
  files.sort((left, right) => left.relative < right.relative ? -1 : left.relative > right.relative ? 1 : 0);
  const hash = crypto.createHash('sha256');
  for (const file of files) {
    hash.update(Buffer.from(`${Buffer.byteLength(file.relative)}:${file.relative}:${file.bytes.byteLength}:`));
    hash.update(file.bytes);
  }
  return { digest: `sha256:${hash.digest('hex')}`, files };
}

async function writePackageSnapshot(destination: string, files: readonly PackageFile[], signal?: AbortSignal): Promise<void> {
  const started = Date.now();
  await fs.promises.mkdir(destination, { mode: 0o700 });
  for (const file of files) {
    if (signal?.aborted) throw signal.reason ?? new Error('REPORT_ADAPTER_CANCELLED');
    if (Date.now() - started > PACKAGE_SNAPSHOT_TIMEOUT_MS) throw new Error('REPORT_ADAPTER_PACKAGE_SNAPSHOT_TIMEOUT');
    const target = path.join(destination, file.relative);
    await fs.promises.mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
    await fs.promises.writeFile(target, file.bytes, { flag: 'wx', mode: 0o600 });
  }
}

export class FileReportArtifactReader implements ReportArtifactReader {
  readonly #roots: string[];

  constructor(roots: readonly string[]) {
    if (roots.length === 0) throw new Error('REPORT_ARTIFACT_ROOT_REQUIRED');
    this.#roots = roots.map((root) => {
      if (!path.isAbsolute(root)) throw new Error('REPORT_ARTIFACT_ROOT_NOT_ABSOLUTE');
      const canonical = fs.realpathSync(root);
      if (canonical === path.parse(canonical).root) throw new Error('REPORT_ARTIFACT_ROOT_TOO_BROAD');
      return canonical;
    });
  }

  async read(artifact: ArtifactRefV1, maximumBytes: number, signal?: AbortSignal): Promise<Buffer> {
    positiveInteger(maximumBytes, 'REPORT_ADAPTER_SOURCE_LIMIT_INVALID');
    if (!artifact.storageUrl.startsWith('file:')) throw new Error('REPORT_ARTIFACT_STORAGE_UNSUPPORTED');
    if (!DIGEST.test(artifact.contentDigest)) throw new Error('REPORT_ARTIFACT_DIGEST_INVALID');
    if (artifact.sizeBytes > maximumBytes) throw new Error('REPORT_ADAPTER_SOURCE_LIMIT');
    const candidate = fileURLToPath(artifact.storageUrl);
    let handle: Awaited<ReturnType<typeof fs.promises.open>>;
    try {
      handle = await fs.promises.open(candidate, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
    } catch {
      throw new Error('REPORT_ARTIFACT_PATH_FORBIDDEN');
    }
    try {
      const opened = fs.realpathSync(candidate);
      if (!this.#roots.some((root) => opened.startsWith(`${root}${path.sep}`))) {
        throw new Error('REPORT_ARTIFACT_PATH_FORBIDDEN');
      }
      const descriptor = await handle.stat();
      const current = fs.statSync(opened);
      if (!descriptor.isFile() || descriptor.dev !== current.dev || descriptor.ino !== current.ino) {
        throw new Error('REPORT_ARTIFACT_PATH_FORBIDDEN');
      }
      if (descriptor.size !== artifact.sizeBytes || descriptor.size > maximumBytes) {
        throw new Error('REPORT_ARTIFACT_SIZE_MISMATCH');
      }
      const bytes = Buffer.alloc(artifact.sizeBytes + 1);
      let offset = 0;
      while (offset < bytes.byteLength) {
        if (signal?.aborted) throw signal.reason ?? new Error('REPORT_ADAPTER_CANCELLED');
        const { bytesRead } = await handle.read(bytes, offset, bytes.byteLength - offset, offset);
        if (bytesRead === 0) break;
        offset += bytesRead;
      }
      if (offset !== artifact.sizeBytes) {
        throw new Error('REPORT_ARTIFACT_SIZE_MISMATCH');
      }
      const content = bytes.subarray(0, offset);
      const digest = `sha256:${crypto.createHash('sha256').update(content).digest('hex')}`;
      if (digest !== artifact.contentDigest) throw new Error('REPORT_ARTIFACT_DIGEST_MISMATCH');
      return content;
    } finally {
      await handle.close();
    }
  }
}

function runtimePaths(): { launcher: string; child: string } {
  const launcher = fileURLToPath(import.meta.resolve('@kubeclaw/plugin-foundation/isolation/plugin-sandbox'));
  const child = path.join(path.dirname(fileURLToPath(import.meta.url)), 'report-adapter-child.mjs');
  if (!fs.existsSync(launcher)) throw new Error('REPORT_ADAPTER_SANDBOX_NOT_BUILT');
  return { launcher, child };
}

function validateLimits(limits: ReportAdapterRuntimeLimits): void {
  if (!limits || typeof limits !== 'object' || Array.isArray(limits)) {
    throw new Error('REPORT_ADAPTER_LIMITS_INVALID');
  }
  for (const name of REQUIRED_LIMITS) {
    positiveInteger(limits[name], `REPORT_ADAPTER_LIMIT_INVALID:${name}`);
  }
  if (limits.maximumCases > 5_000 || limits.maximumFindings > 5_000 || limits.maximumCaseFindings > 100) {
    throw new Error('REPORT_ADAPTER_DETAIL_LIMIT_EXCEEDS_CONTRACT');
  }
  for (const [name, maximum] of Object.entries(HARD_LIMITS)) {
    if (limits[name as keyof typeof HARD_LIMITS] > maximum) throw new Error(`REPORT_ADAPTER_HARD_LIMIT_EXCEEDED:${name}`);
  }
  if (limits.openFiles < 16) throw new Error('REPORT_ADAPTER_OPEN_FILE_LIMIT_TOO_LOW');
  const requiredMemory = 64 * 1024 * 1024
    + (limits.maximumSourceBytes * 3)
    + (limits.maximumResultBytes * 2);
  if (limits.memoryBytes < requiredMemory) throw new Error('REPORT_ADAPTER_MEMORY_LIMIT_INCOMPATIBLE');
}

export class RegisteredReportAdapterRuntime {
  readonly #reader: ReportArtifactReader;
  readonly #runtimeRoot: string;
  readonly #runtimeRootIdentity: { readonly dev: number; readonly ino: number };

  constructor(reader: ReportArtifactReader, runtimeRoot: string) {
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
    validateLimits(limits);
    const deadline = new AbortController();
    const timer = setTimeout(() => deadline.abort(new Error('REPORT_ADAPTER_TIMEOUT')), limits.timeoutMs);
    const boundedSignal = signal ? AbortSignal.any([signal, deadline.signal]) : deadline.signal;
    try {
      return await this.#adaptWithinDeadline(entry, artifact, limits, boundedSignal);
    } finally {
      clearTimeout(timer);
    }
  }

  async #adaptWithinDeadline(entry: ReportAdapterRegistryEntry, artifact: ArtifactRefV1,
    limits: ReportAdapterRuntimeLimits, signal: AbortSignal): Promise<ReportAdapterResultV1> {
    this.#assertRuntimeRoot();
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
    const expectedDigest = entry.registration.package.contentDigest;
    const sourcePackage = await abortable(readPackage(entry.package.root, signal), signal);
    if (sourcePackage.digest !== expectedDigest) {
      throw new Error(`REPORT_ADAPTER_PACKAGE_DIGEST_MISMATCH:${entry.registration.adapterId}`);
    }

    const snapshot = path.join(this.#runtimeRoot, `adapter-${crypto.randomUUID()}`);
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
    } finally {
      fs.rmSync(snapshot, { recursive: true, force: true });
    }
  }

  #run(entry: ReportAdapterRegistryEntry, artifact: ArtifactRefV1, bytes: Buffer,
    limits: ReportAdapterRuntimeLimits, packageRoot: string, modulePath: string,
    signal?: AbortSignal): Promise<ReportAdapterOutput> {
    if (signal?.aborted) return Promise.reject(signal.reason ?? new Error('REPORT_ADAPTER_CANCELLED'));
    if (limits.cpuMillis % 1000 !== 0) return Promise.reject(new Error('REPORT_ADAPTER_CPU_LIMIT_GRANULARITY'));
    const runtime = runtimePaths();
    return new Promise<ReportAdapterOutput>((resolve, reject) => {
      const child = spawn(runtime.launcher, [
        String(limits.memoryBytes), String(limits.cpuMillis / 1000),
        String(limits.openFiles), process.execPath,
        `--max-old-space-size=${Math.max(16, Math.floor(limits.memoryBytes / (1024 * 1024) * 0.7))}`,
        '--permission', `--allow-fs-read=${runtime.child}`, `--allow-fs-read=${packageRoot}`,
        '--no-addons', '--no-experimental-sqlite', runtime.child,
      ], { cwd: packageRoot, env: { NODE_NO_WARNINGS: '1' }, stdio: ['pipe', 'pipe', 'pipe'] });
      const outputChunks: Buffer[] = [];
      let outputBytes = 0;
      let settled = false;
      let timer: NodeJS.Timeout | undefined;
      const finish = (error?: Error, value?: ReportAdapterOutput) => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        signal?.removeEventListener('abort', abort);
        if (!child.killed) child.kill('SIGKILL');
        if (error) reject(error); else resolve(value!);
      };
      const abort = () => finish(signal?.reason instanceof Error ? signal.reason : new Error('REPORT_ADAPTER_CANCELLED'));
      timer = setTimeout(() => finish(new Error('REPORT_ADAPTER_TIMEOUT')), limits.timeoutMs);
      signal?.addEventListener('abort', abort, { once: true });
      if (signal?.aborted) { abort(); return; }
      child.stdout.on('data', (chunk: Buffer) => {
        if (settled) return;
        if (outputBytes + chunk.byteLength > limits.maximumResultBytes) {
          child.stdout.pause();
          finish(new Error('REPORT_ADAPTER_RESULT_LIMIT'));
          return;
        }
        outputChunks.push(chunk);
        outputBytes += chunk.byteLength;
      });
      child.stderr.on('data', () => {});
      child.once('error', (error) => finish(error));
      child.once('close', (code, closeSignal) => {
        if (settled) return;
        const output = Buffer.concat(outputChunks, outputBytes);
        const lines = output.toString('utf8').trim().split('\n');
        if (lines.length !== 1 || outputBytes > limits.maximumResultBytes) {
          finish(new Error('REPORT_ADAPTER_PROTOCOL_INVALID')); return;
        }
        let message: { kind?: string; value?: ReportAdapterOutput; error?: string };
        try { message = JSON.parse(lines[0]!) as typeof message; }
        catch { finish(new Error(`REPORT_ADAPTER_PROTOCOL_INVALID:${String(code)}:${String(closeSignal)}`)); return; }
        if (message.kind === 'result' && code === 0 && message.value) {
          finish(undefined, message.value);
        }
        else finish(new Error(`REPORT_ADAPTER_FAILED:${message.error ?? `${String(code)}:${String(closeSignal)}`}`));
      });
      child.stdin.end(`${JSON.stringify({
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
      })}\n`);
    });
  }
}
