import { assertBudgetSourceAdmission } from './budget-source-admission.ts';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import type { ProviderInvocationV1, ProviderResultV1 } from '@kubeclaw/pipeline-test-gate-contract';
import type { TestProviderExecutionContext, TestProviderCleanupDisposition } from '@kubeclaw/plugin-sdk';
import type { TestProviderRegistryEntry } from '@kubeclaw/plugin-foundation/registry/types';
import { validateBusterProviderRuntimeSettings, type BusterProviderRuntimeSettings } from '@kubeclaw/plugin-foundation/config/buster-execution';
import type { ProviderProcessResources } from './provider-loader.ts';
import { ProviderCapabilities } from './provider-capabilities.ts';
import { processFacts, signalProvider } from './provider-process-observation.ts';


export function assertCleanupDisposition(value: unknown): asserts value is TestProviderCleanupDisposition {
  if (value !== 'incomplete' && value !== 'completed-fixture') throw new Error('TEST_PROVIDER_CLEANUP_DISPOSITION_INVALID');
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

function providerWorkspace(workspaceRootValue: string, allowed: ProviderInvocationV1['workspace']) {
    const workspaceRoot = fs.realpathSync(workspaceRootValue);
    const repository = path.resolve(workspaceRoot, allowed.repository);
    const scratch = path.resolve(workspaceRoot, allowed.scratch);
    const evidence = path.resolve(workspaceRoot, allowed.evidence);
    for (const item of [repository, scratch, evidence]) {
      if (!item.startsWith(`${workspaceRoot}${path.sep}`)) throw new Error('TEST_PROVIDER_WORKSPACE_FORBIDDEN');
    }
    return { repository, scratch, evidence };
}

export class ProviderProcessSession {
  readonly #policy: BusterProviderRuntimeSettings;
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
  #initializationFailure: Error | null = null;
  #resultResolve: ((value: ProviderResultV1) => void) | null = null;
  #resultReject: ((error: Error) => void) | null = null;
  #cleanupResolve: (() => void) | null = null;
  #cleanupReject: ((error: Error) => void) | null = null;
  #closed = false;
  #disposalConfirmed = false;
  readonly #capabilities: ProviderCapabilities;
  #termination: Promise<void> | null = null;
  #protocolBytes = 0;
  #protocolFailure: Error | null = null;
  #resources: ProviderProcessResources = { cpuTimeMs: 0, maximumMemoryBytes: 0, maximumProcesses: 1 };

  constructor(entry: TestProviderRegistryEntry, invocation: ProviderInvocationV1, workspaceRootValue: string, policy: BusterProviderRuntimeSettings) {
    assertBudgetSourceAdmission(invocation?.configuration);
    this.#policy = validateBusterProviderRuntimeSettings(policy);
    this.#capabilities = new ProviderCapabilities(this.#policy.provider.maximumPendingCapabilities);
    this.#entry = entry;
    this.#invocation = invocation;
    if (!Number.isSafeInteger(invocation.limits.artifactFiles + this.#policy.provider.artifactFileDescriptorReserve)) {
      throw new Error('TEST_PROVIDER_DESCRIPTOR_BUDGET_INVALID');
    }
    const runtime = runtimePaths();
    const modulePath = canonicalModule(entry);
    this.#modulePath = modulePath;
    const { repository, scratch, evidence } = providerWorkspace(workspaceRootValue, invocation.workspace);
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
      String(Math.max(this.#policy.provider.minimumOpenFiles, invocation.limits.artifactFiles + this.#policy.provider.artifactFileDescriptorReserve)), process.execPath,
      `--max-old-space-size=${Math.max(this.#policy.provider.minimumHeapMiB, Math.floor(invocation.limits.memoryBytes / (1024 * 1024) * this.#policy.provider.heapFraction))}`,
      '--permission', `--allow-fs-read=${runtime.child}`, `--allow-fs-read=${entry.package.root}`,
      `--allow-fs-read=${repository}`, `--allow-fs-read=${scratch}`, `--allow-fs-read=${evidence}`,
      ...artifactInputs.map((artifact) => `--allow-fs-read=${artifact}`),
      `--allow-fs-write=${scratch}`, `--allow-fs-write=${evidence}`, '--no-addons', runtime.child,
    ], { cwd: entry.package.root, detached: process.platform !== 'win32',
      env: { NODE_NO_WARNINGS: '1' }, stdio: ['pipe', 'pipe', 'pipe'] });
    // Enforce the byte budget before readline dispatches any message in the chunk.
    this.#child.stdout.on('data', (chunk: Buffer) => {
      this.#protocolBytes += chunk.byteLength;
      if (this.#protocolBytes > this.#policy.provider.maximumProtocolBytes) { this.#protocolFailure ??= new Error('TEST_PROVIDER_PROTOCOL_LIMIT'); this.#fail(this.#protocolFailure); void this.terminate().catch((error) => this.#fail(error instanceof Error ? error : new Error(String(error)))); }
    });
    this.#lines = readline.createInterface({ input: this.#child.stdout, crlfDelay: Infinity });
    this.#lines.on('line', (line) => {
      void this.#message(line).catch(async (error) => {
        this.#fail(error instanceof Error ? error : new Error(String(error)));
        await this.terminate();
      }).catch((error) => this.#fail(error instanceof Error ? error : new Error(String(error))));
    });
    this.#child.stderr.on('data', (chunk: Buffer) => this.#context?.log('stderr', chunk));
    this.#child.stdin.on('error', (error) => {
      if (!this.#closed) { this.#fail(error); void this.terminate().catch((failure) => this.#fail(failure)); }
    });
    this.#child.once('error', (error) => this.#fail(error));
    this.#child.once('close', (code, signal) => {
      this.#closed = true;
      this.#capabilities.abort(new Error('TEST_PROVIDER_PROCESS_CLOSED'));
      if (this.#initializeReject) { this.#initializeReject(new Error(`TEST_PROVIDER_INITIALIZE_EXITED:${String(code)}:${String(signal)}`)); this.#clearInitialize(); }
      if (this.#resultReject) this.#fail(new Error(`TEST_PROVIDER_PROCESS_EXITED:${String(code)}:${String(signal)}`));
      if (this.#cleanupReject) { this.#cleanupReject(new Error(`TEST_PROVIDER_CLEANUP_EXITED:${String(code)}:${String(signal)}`)); this.#clearCleanup(); }
      clearInterval(this.#sampleTimer); this.#lines.close();
      this.#detachContext();
    });
    this.#sampleTimer = setInterval(() => this.#sample(), this.#policy.observation.processSampleIntervalMs);
    this.#sample();
  }

  initialize(context: TestProviderExecutionContext): Promise<boolean> {
    this.#setContext(context);
    if (this.#protocolFailure) return Promise.reject(this.#protocolFailure);
    if (this.#initializationFailure) return Promise.reject(this.#initializationFailure);
    if (this.#initialized !== null) return Promise.resolve(this.#initialized);
    if (this.#initializeResolve) throw new Error('TEST_PROVIDER_INITIALIZE_DUPLICATE');
    const operation = new Promise<boolean>((resolve, reject) => { this.#initializeResolve = resolve; this.#initializeReject = reject; });
    if (!this.#send({ kind: 'initialize', modulePath: this.#modulePath, exportName: this.#entry.registration.entrypoint.export,
      invocation: this.#invocation, workspaceRoot: context.workspaceRoot,
      observation: { resourceSampleIntervalMs: this.#policy.observation.resourceSampleIntervalMs } })) this.#fail(new Error('TEST_PROVIDER_PROCESS_CLOSED'));
    return operation;
  }

  async execute(context: TestProviderExecutionContext): Promise<ProviderResultV1> {
    await this.initialize(context);
    if (this.#resultResolve) throw new Error('TEST_PROVIDER_EXECUTE_DUPLICATE');
    this.#setContext(context);
    const operation = new Promise<ProviderResultV1>((resolve, reject) => { this.#resultResolve = resolve; this.#resultReject = reject; });
    if (!this.#send({ kind: 'execute' })) this.#fail(new Error('TEST_PROVIDER_PROCESS_CLOSED'));
    return operation;
  }

  async cleanup(context: TestProviderExecutionContext, disposition: TestProviderCleanupDisposition): Promise<void> {
    assertCleanupDisposition(disposition);
    this.#setContext(context);
    if (this.#protocolFailure) return Promise.reject(this.#protocolFailure);
    if (this.#closed) return Promise.reject(new Error('TEST_PROVIDER_PROCESS_NOT_AVAILABLE'));
    const supported = await this.initialize(context);
    if (!supported) return;
    const operation = new Promise<void>((resolve, reject) => { this.#cleanupResolve = resolve; this.#cleanupReject = reject; });
    if (!this.#send({ kind: 'cleanup', schemaVersion: 'provider-cleanup.v1', disposition })) this.#fail(new Error('TEST_PROVIDER_PROCESS_CLOSED'));
    return operation;
  }

  terminate(): Promise<void> {
    this.#termination ??= this.#terminate();
    return this.#termination;
  }

  get disposalConfirmed(): boolean { return this.#disposalConfirmed; }

  async #terminate(): Promise<void> {
    this.#capabilities.abort(new Error('TEST_PROVIDER_TERMINATED'));
    if (this.#closed) { await this.#confirmDisposal(); return; }
    let signalFailure: Error | undefined;
    await new Promise<void>((resolve, reject) => {
      const signal = (value: NodeJS.Signals): void => {
        try { signalProvider(this.#child, value); }
        catch (cause) { signalFailure ??= new Error('TEST_PROVIDER_SIGNAL_FAILED', { cause }); }
      };
      const force = setTimeout(() => signal('SIGKILL'), this.#policy.provider.terminationGraceMs);
      const bound = setTimeout(() => { signal('SIGKILL'); reject(new Error('TEST_PROVIDER_TERMINATION_TIMEOUT')); }, this.#policy.provider.terminationTimeoutMs);
      this.#child.once('close', () => {
        clearTimeout(force); clearTimeout(bound);
        resolve();
      });
      try { this.#send({ kind: 'abort', reason: 'TEST_PROVIDER_TERMINATED' }); signal('SIGTERM'); }
      catch (cause) { signalFailure ??= new Error('TEST_PROVIDER_ABORT_SEND_FAILED', { cause }); signal('SIGKILL'); }
    });
    // Only confirmed process closure reaches this bounded drain. A signal
    // failure must not discard ownership of still-settling capability calls.
    await this.#confirmDisposal();
    if (signalFailure) throw signalFailure;
  }

  async #confirmDisposal(): Promise<void> {
    await this.#capabilities.drain(this.#policy.provider.capabilityDrainTimeoutMs);
    // Called only after actual close, never after a timeout or failed drain.
    this.#disposalConfirmed = true;
  }

  resources(): ProviderProcessResources { this.#sample(); return { ...this.#resources }; }

  #sample(): void {
    // After native close the PID can be reused. Retain the observations owned
    // by this session instead of sampling an unrelated future process.
    if (this.#closed) return;
    let facts: ReturnType<typeof processFacts>;
    try { facts = processFacts(this.#child.pid ?? -1); }
    catch (cause) {
      this.#fail(new Error('TEST_PROVIDER_OBSERVATION_FAILED', { cause }));
      void this.terminate().catch(error => this.#fail(error instanceof Error ? error : new Error(String(error))));
      return;
    }
    if (!facts) return;
    this.#resources = {
      cpuTimeMs: Math.max(this.#resources.cpuTimeMs, facts.cpuTimeMs),
      maximumMemoryBytes: Math.max(this.#resources.maximumMemoryBytes, facts.memoryBytes),
      maximumProcesses: Math.max(this.#resources.maximumProcesses, facts.processes),
    };
    const limit = facts.cpuTimeMs > this.#invocation.limits.cpuMillis ? 'TEST_PROVIDER_CPU_LIMIT'
      : facts.memoryBytes > this.#invocation.limits.memoryBytes ? 'TEST_PROVIDER_MEMORY_LIMIT'
        : facts.processes > this.#invocation.limits.processes ? 'TEST_PROVIDER_PROCESS_LIMIT' : null;
    if (limit !== null) { this.#fail(new Error(limit)); void this.terminate().catch((error) => this.#fail(error instanceof Error ? error : new Error(String(error)))); }
  }

  async #message(line: string): Promise<void> {
    if (this.#protocolBytes > this.#policy.provider.maximumProtocolBytes) return;
    let message: Record<string, unknown>;
    try { message = JSON.parse(line) as Record<string, unknown>; }
    catch { this.#fail(new Error('TEST_PROVIDER_PROTOCOL_INVALID')); await this.terminate(); return; }
    this.#reportedResources(message);
    if (this.#logMessage(message)) return;
    if (message.kind === 'capability-abort' && typeof message.id === 'string') {
      this.#capabilities.cancel(message.id, new Error(String(message.reason ?? 'TEST_PROVIDER_CAPABILITY_CANCELLED')));
      return;
    }
    if (message.kind === 'capability' && typeof message.id === 'string' && typeof message.capability === 'string') {
      if (!this.#context) throw new Error('TEST_PROVIDER_CONTEXT_MISSING');
      await this.#capabilities.handle(message.id, message.capability, message.request as never,
        this.#context, (value) => this.#send(value));
      return;
    }
    this.#terminalMessage(message);
  }

  #reportedResources(message: Record<string, unknown>): void {
    const reported = message.resources as Partial<ProviderProcessResources> | undefined;
    if (reported) this.#resources = {
      cpuTimeMs: Math.max(this.#resources.cpuTimeMs, Number(reported.cpuTimeMs ?? 0)),
      maximumMemoryBytes: Math.max(this.#resources.maximumMemoryBytes, Number(reported.maximumMemoryBytes ?? 0)),
      maximumProcesses: Math.max(this.#resources.maximumProcesses, Number(reported.maximumProcesses ?? 1)),
    };
  }

  #logMessage(message: Record<string, unknown>): boolean {
    if (message.kind === 'log' && (message.stream === 'stdout' || message.stream === 'stderr') && typeof message.content === 'string') {
      this.#context?.log(message.stream, message.encoding === 'base64' ? Buffer.from(message.content, 'base64') : message.content); return true;
    }
    return false;
  }

  #terminalMessage(message: Record<string, unknown>): void {
    if ((message.kind === 'result' || message.kind === 'cleanup-result') && this.#capabilities.pending > 0) {
      throw new Error('TEST_PROVIDER_UNAWAITED_CAPABILITIES');
    }
    if (message.kind === 'initialized' && typeof message.supportsCleanup === 'boolean') {
      this.#initialized = message.supportsCleanup;
      const resolve = this.#initializeResolve; this.#clearInitialize(); resolve?.(message.supportsCleanup); return;
    }
    if (message.kind === 'result') { const resolve = this.#resultResolve; this.#clearResult(); resolve?.(message.value as ProviderResultV1); return; }
    if (message.kind === 'cleanup-result') { const resolve = this.#cleanupResolve; this.#clearCleanup(); resolve?.(); return; }
    if (message.kind === 'error') this.#fail(new Error(`TEST_PROVIDER_FAILED:${String(message.error)}`));
  }

  #send(value: unknown): boolean {
    if (this.#closed || this.#termination || this.#child.stdin.destroyed || this.#child.stdin.writableEnded) return false;
    this.#child.stdin.write(`${JSON.stringify(value)}\n`);
    return true;
  }

  #setContext(context: TestProviderExecutionContext): void {
    this.#detachContext(); this.#context = context;
    this.#contextAbort = () => {
      if (this.#closed) return;
      const reason = context.signal.reason instanceof Error ? context.signal.reason
        : new Error('TEST_PROVIDER_CANCELLED', { cause: context.signal.reason });
      this.#capabilities.abort(reason);
      this.#fail(reason);
      void this.terminate().catch((error) => this.#fail(error instanceof Error ? error : new Error(String(error))));
    };
    if (context.signal.aborted) this.#contextAbort();
    else context.signal.addEventListener('abort', this.#contextAbort, { once: true });
  }

  #detachContext(): void {
    if (this.#context && this.#contextAbort) this.#context.signal.removeEventListener('abort', this.#contextAbort);
    this.#contextAbort = null;
  }

  #fail(error: Error): void {
    // The constructor samples before initialize has installed its callbacks.
    // Preserve that failure without preventing cleanup after an execution error.
    if (this.#initialized === null) this.#initializationFailure ??= error;
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

