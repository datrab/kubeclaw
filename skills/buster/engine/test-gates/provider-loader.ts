import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import type { ProviderInvocationV1, ProviderResultV1 } from '@kubeclaw/pipeline-test-gate-contract';
import type { TestProviderExecutionContext } from '@kubeclaw/plugin-sdk';
import { computePackageDigest } from '@kubeclaw/plugin-foundation/registry/digest';
import type { TestProviderRegistryEntry } from '@kubeclaw/plugin-foundation/registry/types';

const MAX_PROTOCOL_BYTES = 16 * 1024 * 1024;

export interface ProviderProcessResources {
  readonly cpuTimeMs: number;
  readonly maximumMemoryBytes: number;
  readonly maximumProcesses: number;
}

export interface LoadedTestProvider {
  supportsCleanup(context: TestProviderExecutionContext): Promise<boolean>;
  execute(invocation: ProviderInvocationV1, context: TestProviderExecutionContext): Promise<ProviderResultV1>;
  cleanup(invocation: ProviderInvocationV1, context: TestProviderExecutionContext): Promise<void>;
  terminate(): Promise<void>;
  discard?(): Promise<void>;
  resources(): ProviderProcessResources;
}

export interface TestProviderLoader {
  load(entry: TestProviderRegistryEntry, invocation: ProviderInvocationV1, workspaceRoot: string,
    signal: AbortSignal): Promise<LoadedTestProvider>;
}

function runtimePaths(): { launcher: string; child: string } {
  const launcher = fileURLToPath(import.meta.resolve('@kubeclaw/plugin-foundation/isolation/plugin-sandbox'));
  const child = path.join(path.dirname(fileURLToPath(import.meta.url)), 'provider-child.mjs');
  if (!fs.existsSync(launcher)) throw new Error('TEST_PROVIDER_SANDBOX_NOT_BUILT');
  return { launcher, child };
}

function canonicalModule(entry: TestProviderRegistryEntry): string {
  const packageRoot = fs.realpathSync(entry.package.root);
  const modulePath = fs.realpathSync(path.resolve(packageRoot, entry.registration.entrypoint.module));
  if (!modulePath.startsWith(`${packageRoot}${path.sep}`) || !fs.statSync(modulePath).isFile()) {
    throw new Error(`TEST_PROVIDER_MODULE_FORBIDDEN:${entry.registration.registrationId}`);
  }
  return modulePath;
}

function verifiedSnapshot(entry: TestProviderRegistryEntry, workspaceRoot: string, attemptId: string): TestProviderRegistryEntry {
  const expected = entry.registration.package.contentDigest;
  if (computePackageDigest(entry.package.root) !== expected) {
    throw new Error(`TEST_PROVIDER_PACKAGE_DIGEST_MISMATCH:${entry.registration.registrationId}`);
  }
  const snapshots = path.join(workspaceRoot, 'test-provider-snapshots');
  fs.mkdirSync(snapshots, { recursive: true });
  const snapshotKey = createHash('sha256').update(attemptId).digest('hex');
  const destination = fs.mkdtempSync(path.join(snapshots, `${snapshotKey}-`));
  try {
    fs.cpSync(entry.package.root, destination, {
      recursive: true,
      force: true,
    });
    if (computePackageDigest(destination) !== expected) {
      throw new Error(`TEST_PROVIDER_PACKAGE_SNAPSHOT_MISMATCH:${entry.registration.registrationId}`);
    }
  } catch (error) {
    fs.rmSync(destination, { recursive: true, force: true });
    throw error;
  }
  const relativeManifest = path.relative(entry.package.root, entry.package.manifestPath);
  const relativeSchema = path.relative(entry.package.root, entry.configSchemaPath);
  return {
    ...entry,
    package: { ...entry.package, root: destination, manifestPath: path.join(destination, relativeManifest) },
    configSchemaPath: path.join(destination, relativeSchema),
  };
}

function processFacts(pid: number): { cpuTimeMs: number; memoryBytes: number; processes: number } | null {
  try {
    const parents = new Map<number, number>();
    for (const name of fs.readdirSync('/proc')) {
      if (!/^\d+$/u.test(name)) continue;
      try {
        const childStatus = fs.readFileSync(`/proc/${name}/status`, 'utf8');
        const parent = Number(/^PPid:\s+(\d+)$/mu.exec(childStatus)?.[1] ?? -1);
        parents.set(Number(name), parent);
      } catch { /* A process can exit during the scan. */ }
    }
    const descendants = new Set([pid]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const [candidate, parent] of parents) if (descendants.has(parent) && !descendants.has(candidate)) {
        descendants.add(candidate); changed = true;
      }
    }
    let cpuTimeMs = 0; let memoryBytes = 0;
    for (const processId of descendants) {
      try {
        const stat = fs.readFileSync(`/proc/${processId}/stat`, 'utf8');
        const fields = stat.slice(stat.lastIndexOf(')') + 2).trim().split(/\s+/u);
        cpuTimeMs += ((Number(fields[11]) + Number(fields[12])) / 100) * 1000;
        const status = fs.readFileSync(`/proc/${processId}/status`, 'utf8');
        memoryBytes += Number(/^VmRSS:\s+(\d+)\s+kB$/mu.exec(status)?.[1] ?? 0) * 1024;
      } catch { /* A process can exit during the sample. */ }
    }
    return { cpuTimeMs, memoryBytes, processes: descendants.size };
  } catch { return null; }
}

class ProviderProcessSession {
  readonly #entry: TestProviderRegistryEntry;
  readonly #invocation: ProviderInvocationV1;
  readonly #child: ChildProcessWithoutNullStreams;
  readonly #lines: readline.Interface;
  readonly #sampleTimer: NodeJS.Timeout;
  readonly #modulePath: string;
  #context: TestProviderExecutionContext | null = null;
  #contextAbort: (() => void) | null = null;
  #initializeResolve: ((supportsCleanup: boolean) => void) | null = null;
  #initializeReject: ((error: Error) => void) | null = null;
  #initialized: boolean | null = null;
  #resultResolve: ((value: ProviderResultV1) => void) | null = null;
  #resultReject: ((error: Error) => void) | null = null;
  #cleanupResolve: (() => void) | null = null;
  #cleanupReject: ((error: Error) => void) | null = null;
  #closed = false;
  #protocolBytes = 0;
  #resources: ProviderProcessResources = { cpuTimeMs: 0, maximumMemoryBytes: 0, maximumProcesses: 1 };

  constructor(entry: TestProviderRegistryEntry, invocation: ProviderInvocationV1, workspaceRootValue: string) {
    this.#entry = entry;
    this.#invocation = invocation;
    const runtime = runtimePaths();
    const modulePath = canonicalModule(entry);
    this.#modulePath = modulePath;
    const workspaceRoot = fs.realpathSync(workspaceRootValue);
    const allowed = invocation.workspace;
    const repository = path.resolve(workspaceRoot, allowed.repository);
    const scratch = path.resolve(workspaceRoot, allowed.scratch);
    const evidence = path.resolve(workspaceRoot, allowed.evidence);
    for (const item of [repository, scratch, evidence]) {
      if (!item.startsWith(`${workspaceRoot}${path.sep}`)) throw new Error('TEST_PROVIDER_WORKSPACE_FORBIDDEN');
    }
    const artifactInputs = invocation.inputs.filter((input) => input.kind === 'artifact').map((input) => {
      if (!input.artifact.storageUrl.startsWith('file:')) throw new Error('TEST_PROVIDER_ARTIFACT_INPUT_UNSUPPORTED');
      const artifact = fs.realpathSync(fileURLToPath(input.artifact.storageUrl));
      if (!fs.statSync(artifact).isFile()) throw new Error('TEST_PROVIDER_ARTIFACT_INPUT_INVALID');
      return artifact;
    });
    this.#child = spawn(runtime.launcher, [
      String(invocation.limits.memoryBytes), String(Math.max(1, Math.ceil(invocation.limits.cpuMillis / 1000))),
      // Artifact files are provider outputs, not the process-wide descriptor budget. Node
      // needs a stable descriptor floor for its loader, IPC, and runtime internals even
      // when a provider is allowed to publish only a few artifacts.
      String(Math.max(64, invocation.limits.artifactFiles + 32)), process.execPath,
      `--max-old-space-size=${Math.max(16, Math.floor(invocation.limits.memoryBytes / (1024 * 1024) * 0.7))}`,
      '--permission', `--allow-fs-read=${runtime.child}`, `--allow-fs-read=${entry.package.root}`,
      `--allow-fs-read=${repository}`, `--allow-fs-read=${scratch}`, `--allow-fs-read=${evidence}`,
      ...artifactInputs.map((artifact) => `--allow-fs-read=${artifact}`),
      `--allow-fs-write=${scratch}`, `--allow-fs-write=${evidence}`, '--no-addons', runtime.child,
    ], { cwd: entry.package.root, detached: process.platform !== 'win32',
      env: { NODE_NO_WARNINGS: '1' }, stdio: ['pipe', 'pipe', 'pipe'] });
    this.#lines = readline.createInterface({ input: this.#child.stdout, crlfDelay: Infinity });
    this.#lines.on('line', (line) => { void this.#message(line); });
    this.#child.stdout.on('data', (chunk: Buffer) => {
      this.#protocolBytes += chunk.byteLength;
      if (this.#protocolBytes > MAX_PROTOCOL_BYTES) { this.#fail(new Error('TEST_PROVIDER_PROTOCOL_LIMIT')); void this.terminate(); }
    });
    this.#child.stderr.on('data', (chunk: Buffer) => this.#context?.log('stderr', chunk));
    this.#child.stdin.on('error', (error) => {
      if (!this.#closed) this.#fail(error);
    });
    this.#child.once('error', (error) => this.#fail(error));
    this.#child.once('close', (code, signal) => {
      this.#closed = true;
      if (this.#initializeReject) { this.#initializeReject(new Error(`TEST_PROVIDER_INITIALIZE_EXITED:${String(code)}:${String(signal)}`)); this.#clearInitialize(); }
      if (this.#resultReject) this.#fail(new Error(`TEST_PROVIDER_PROCESS_EXITED:${String(code)}:${String(signal)}`));
      if (this.#cleanupReject) { this.#cleanupReject(new Error(`TEST_PROVIDER_CLEANUP_EXITED:${String(code)}:${String(signal)}`)); this.#clearCleanup(); }
      clearInterval(this.#sampleTimer); this.#lines.close();
      this.#detachContext();
    });
    this.#sampleTimer = setInterval(() => this.#sample(), 50);
    this.#sample();
  }

  initialize(context: TestProviderExecutionContext): Promise<boolean> {
    this.#setContext(context);
    if (this.#initialized !== null) return Promise.resolve(this.#initialized);
    if (this.#initializeResolve) throw new Error('TEST_PROVIDER_INITIALIZE_DUPLICATE');
    const operation = new Promise<boolean>((resolve, reject) => { this.#initializeResolve = resolve; this.#initializeReject = reject; });
    this.#send({ kind: 'initialize', modulePath: this.#modulePath, exportName: this.#entry.registration.entrypoint.export,
      invocation: this.#invocation, workspaceRoot: context.workspaceRoot });
    return operation;
  }

  async execute(context: TestProviderExecutionContext): Promise<ProviderResultV1> {
    await this.initialize(context);
    if (this.#resultResolve) throw new Error('TEST_PROVIDER_EXECUTE_DUPLICATE');
    this.#setContext(context);
    const operation = new Promise<ProviderResultV1>((resolve, reject) => { this.#resultResolve = resolve; this.#resultReject = reject; });
    this.#send({ kind: 'execute' });
    return operation;
  }

  async cleanup(context: TestProviderExecutionContext): Promise<void> {
    this.#setContext(context);
    if (this.#closed) return Promise.reject(new Error('TEST_PROVIDER_PROCESS_NOT_AVAILABLE'));
    const supported = await this.initialize(context);
    if (!supported) return;
    const operation = new Promise<void>((resolve, reject) => { this.#cleanupResolve = resolve; this.#cleanupReject = reject; });
    this.#send({ kind: 'cleanup' });
    return operation;
  }

  async terminate(): Promise<void> {
    if (this.#closed) return;
    await new Promise<void>((resolve) => {
      const signal = (value: NodeJS.Signals): void => {
        try {
          if (process.platform !== 'win32' && this.#child.pid) process.kill(-this.#child.pid, value);
          else this.#child.kill(value);
        } catch { /* The provider group can stop before the signal is sent. */ }
      };
      const force = setTimeout(() => signal('SIGKILL'), 500);
      const bound = setTimeout(resolve, 1_000);
      this.#child.once('close', () => { clearTimeout(force); clearTimeout(bound); resolve(); });
      try { this.#send({ kind: 'abort', reason: 'TEST_PROVIDER_TERMINATED' }); signal('SIGTERM'); }
      catch { signal('SIGKILL'); }
    });
  }

  resources(): ProviderProcessResources { this.#sample(); return { ...this.#resources }; }

  #sample(): void {
    const facts = processFacts(this.#child.pid ?? -1);
    if (!facts) return;
    this.#resources = {
      cpuTimeMs: Math.max(this.#resources.cpuTimeMs, facts.cpuTimeMs),
      maximumMemoryBytes: Math.max(this.#resources.maximumMemoryBytes, facts.memoryBytes),
      maximumProcesses: Math.max(this.#resources.maximumProcesses, facts.processes),
    };
    const limit = facts.cpuTimeMs > this.#invocation.limits.cpuMillis ? 'TEST_PROVIDER_CPU_LIMIT'
      : facts.memoryBytes > this.#invocation.limits.memoryBytes ? 'TEST_PROVIDER_MEMORY_LIMIT'
        : facts.processes > this.#invocation.limits.processes ? 'TEST_PROVIDER_PROCESS_LIMIT' : null;
    if (limit !== null) { this.#fail(new Error(limit)); void this.terminate(); }
  }

  async #message(line: string): Promise<void> {
    let message: Record<string, unknown>;
    try { message = JSON.parse(line) as Record<string, unknown>; }
    catch { this.#fail(new Error('TEST_PROVIDER_PROTOCOL_INVALID')); await this.terminate(); return; }
    const reported = message.resources as Partial<ProviderProcessResources> | undefined;
    if (reported) this.#resources = {
      cpuTimeMs: Math.max(this.#resources.cpuTimeMs, Number(reported.cpuTimeMs ?? 0)),
      maximumMemoryBytes: Math.max(this.#resources.maximumMemoryBytes, Number(reported.maximumMemoryBytes ?? 0)),
      maximumProcesses: Math.max(this.#resources.maximumProcesses, Number(reported.maximumProcesses ?? 1)),
    };
    if (message.kind === 'log' && (message.stream === 'stdout' || message.stream === 'stderr') && typeof message.content === 'string') {
      this.#context?.log(message.stream, message.encoding === 'base64' ? Buffer.from(message.content, 'base64') : message.content); return;
    }
    if (message.kind === 'capability' && typeof message.id === 'string' && typeof message.capability === 'string') {
      try {
        const value = await this.#context!.invoke(message.capability, message.request as never);
        this.#send({ kind: 'capability-result', id: message.id, ok: true, value });
      } catch (error) { this.#send({ kind: 'capability-result', id: message.id, ok: false, error: error instanceof Error ? error.message : String(error) }); }
      return;
    }
    if (message.kind === 'initialized' && typeof message.supportsCleanup === 'boolean') {
      this.#initialized = message.supportsCleanup;
      const resolve = this.#initializeResolve; this.#clearInitialize(); resolve?.(message.supportsCleanup); return;
    }
    if (message.kind === 'result') { const resolve = this.#resultResolve; this.#clearResult(); resolve?.(message.value as ProviderResultV1); return; }
    if (message.kind === 'cleanup-result') { const resolve = this.#cleanupResolve; this.#clearCleanup(); resolve?.(); return; }
    if (message.kind === 'error') this.#fail(new Error(`TEST_PROVIDER_FAILED:${String(message.error)}`));
  }

  #send(value: unknown): void {
    if (this.#closed) throw new Error('TEST_PROVIDER_PROCESS_CLOSED');
    this.#child.stdin.write(`${JSON.stringify(value)}\n`);
  }

  #setContext(context: TestProviderExecutionContext): void {
    this.#detachContext(); this.#context = context;
    this.#contextAbort = () => {
      if (this.#closed) return;
      try { this.#send({ kind: 'abort', reason: String(context.signal.reason ?? 'TEST_PROVIDER_CANCELLED') }); }
      catch { /* The close handler completes the pending operation. */ }
    };
    if (context.signal.aborted) this.#contextAbort();
    else context.signal.addEventListener('abort', this.#contextAbort, { once: true });
  }

  #detachContext(): void {
    if (this.#context && this.#contextAbort) this.#context.signal.removeEventListener('abort', this.#contextAbort);
    this.#contextAbort = null;
  }

  #fail(error: Error): void {
    const initializeReject = this.#initializeReject; const resultReject = this.#resultReject; const cleanupReject = this.#cleanupReject;
    this.#clearInitialize(); this.#clearResult(); this.#clearCleanup();
    initializeReject?.(error); resultReject?.(error); cleanupReject?.(error);
  }

  #clearInitialize(): void { this.#initializeResolve = null; this.#initializeReject = null; }

  #clearResult(): void { this.#resultResolve = null; this.#resultReject = null; }
  #clearCleanup(): void {
    this.#cleanupResolve = null; this.#cleanupReject = null;
  }
}

class IsolatedLoadedProvider implements LoadedTestProvider {
  readonly #entry: TestProviderRegistryEntry;
  readonly #invocation: ProviderInvocationV1;
  #session: ProviderProcessSession;
  #terminated = false;
  #resources: ProviderProcessResources = { cpuTimeMs: 0, maximumMemoryBytes: 0, maximumProcesses: 1 };

  readonly #workspaceRoot: string;

  constructor(entry: TestProviderRegistryEntry, invocation: ProviderInvocationV1, workspaceRoot: string) {
    this.#entry = entry; this.#invocation = invocation; this.#workspaceRoot = workspaceRoot;
    this.#session = new ProviderProcessSession(entry, invocation, workspaceRoot);
  }

  supportsCleanup(context: TestProviderExecutionContext): Promise<boolean> { return this.#session.initialize(context); }

  execute(_invocation: ProviderInvocationV1, context: TestProviderExecutionContext): Promise<ProviderResultV1> {
    return this.#session.execute(context);
  }

  async cleanup(_invocation: ProviderInvocationV1, context: TestProviderExecutionContext): Promise<void> {
    try {
      if (!this.#terminated) {
        if (await this.#session.initialize(context)) await this.#session.cleanup(context);
        this.#resources = this.#session.resources(); await this.#session.terminate(); this.#terminated = true; return;
      }
      const recovery = new ProviderProcessSession(this.#entry, this.#invocation, this.#workspaceRoot);
      try { if (await recovery.initialize(context)) await recovery.cleanup(context); }
      finally { this.#resources = recovery.resources(); await recovery.terminate(); }
    } finally {
      const snapshots = path.join(fs.realpathSync(this.#workspaceRoot), 'test-provider-snapshots');
      const relative = path.relative(snapshots, this.#entry.package.root);
      if (relative === '' || relative === '..' || relative.startsWith(`..${path.sep}`)) throw new Error('TEST_PROVIDER_SNAPSHOT_PATH_INVALID');
      fs.rmSync(this.#entry.package.root, { recursive: true, force: true });
    }
  }

  async terminate(): Promise<void> {
    this.#resources = this.#session.resources(); this.#terminated = true; await this.#session.terminate();
  }

  async discard(): Promise<void> {
    try { await this.terminate(); }
    finally { this.#removeSnapshot(); }
  }

  #removeSnapshot(): void {
    const snapshots = path.join(fs.realpathSync(this.#workspaceRoot), 'test-provider-snapshots');
    const relative = path.relative(snapshots, this.#entry.package.root);
    if (relative === '' || relative === '..' || relative.startsWith(`..${path.sep}`)) throw new Error('TEST_PROVIDER_SNAPSHOT_PATH_INVALID');
    fs.rmSync(this.#entry.package.root, { recursive: true, force: true });
  }

  resources(): ProviderProcessResources {
    const current = this.#terminated ? this.#resources : this.#session.resources();
    return { ...current };
  }
}

export class RegisteredTestProviderLoader implements TestProviderLoader {
  async load(entry: TestProviderRegistryEntry, invocation: ProviderInvocationV1, workspaceRoot: string,
    signal: AbortSignal): Promise<LoadedTestProvider> {
    if (signal.aborted) throw signal.reason ?? new Error('TEST_PROVIDER_CANCELLED');
    const provider = new IsolatedLoadedProvider(verifiedSnapshot(entry, workspaceRoot, invocation.attemptId), invocation, workspaceRoot);
    if (signal.aborted) { await provider.discard(); throw signal.reason ?? new Error('TEST_PROVIDER_CANCELLED'); }
    return provider;
  }
}
