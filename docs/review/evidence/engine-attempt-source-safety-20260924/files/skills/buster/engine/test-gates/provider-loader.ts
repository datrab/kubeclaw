import { ProviderProcessSession, assertCleanupDisposition } from './provider-process-session.ts';
import { validateBusterProviderRuntimeSettings, type BusterProviderRuntimeSettings } from '../../../common/plugin-runtime/foundation/config/buster-execution.ts';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { ProviderInvocationV1, ProviderResultV1 } from '@kubeclaw/pipeline-test-gate-contract';
import type { TestProviderExecutionContext, TestProviderCleanupDisposition } from '@kubeclaw/plugin-sdk';
import { computePackageDigest } from '@kubeclaw/plugin-foundation/registry/digest';
import type { TestProviderRegistryEntry } from '@kubeclaw/plugin-foundation/registry/types';


export interface ProviderProcessResources {
  readonly cpuTimeMs: number;
  readonly maximumMemoryBytes: number;
  readonly maximumProcesses: number;
}

export interface LoadedTestProvider {
  /** Positive process-close and capability-drain authority; absence is not confirmation. */
  readonly disposalConfirmed?: boolean;
  supportsCleanup(context: TestProviderExecutionContext): Promise<boolean>;
  execute(invocation: ProviderInvocationV1, context: TestProviderExecutionContext): Promise<ProviderResultV1>;
  cleanup(invocation: ProviderInvocationV1, context: TestProviderExecutionContext, disposition: TestProviderCleanupDisposition): Promise<void>;
  terminate(): Promise<void>;
  discard?(): Promise<void>;
  resources(): ProviderProcessResources;
}

export interface TestProviderLoader {
  load(entry: TestProviderRegistryEntry, invocation: ProviderInvocationV1, workspaceRoot: string,
    signal: AbortSignal): Promise<LoadedTestProvider>;
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

class IsolatedLoadedProvider implements LoadedTestProvider {
  readonly #policy: BusterProviderRuntimeSettings;
  readonly #entry: TestProviderRegistryEntry;
  readonly #invocation: ProviderInvocationV1;
  #session: ProviderProcessSession;
  #terminated = false;
  readonly #accountedSessions = new WeakSet<ProviderProcessSession>();
  #resources: ProviderProcessResources = { cpuTimeMs: 0, maximumMemoryBytes: 0, maximumProcesses: 1 };

  readonly #workspaceRoot: string;

  constructor(entry: TestProviderRegistryEntry, invocation: ProviderInvocationV1, workspaceRoot: string, policy: BusterProviderRuntimeSettings) {
    this.#policy = policy;
    this.#entry = entry; this.#invocation = invocation; this.#workspaceRoot = workspaceRoot;
    this.#session = new ProviderProcessSession(entry, invocation, workspaceRoot, policy);
  }

  get disposalConfirmed(): boolean { return this.#session.disposalConfirmed; }

  supportsCleanup(context: TestProviderExecutionContext): Promise<boolean> { return this.#session.initialize(context); }

  execute(_invocation: ProviderInvocationV1, context: TestProviderExecutionContext): Promise<ProviderResultV1> {
    return this.#session.execute(context);
  }

  async cleanup(_invocation: ProviderInvocationV1, context: TestProviderExecutionContext, disposition: TestProviderCleanupDisposition): Promise<void> {
    assertCleanupDisposition(disposition);
    if (this.#terminated) {
      // Adopt recovery ownership before initialization, never the old session flag.
      this.#session = new ProviderProcessSession(this.#entry, this.#invocation, this.#workspaceRoot, this.#policy);
      this.#terminated = false;
    }
    await this.#cleanupSession(this.#session, context, disposition);
  }

  async #cleanupSession(session: ProviderProcessSession, context: TestProviderExecutionContext,
    disposition: TestProviderCleanupDisposition): Promise<void> {
    let cleanupFailure: { error: unknown } | undefined;
    try { if (await session.initialize(context)) await session.cleanup(context, disposition); }
    catch (error) { cleanupFailure = { error }; }
    try { await this.#terminateSession(session); }
    catch (terminationError) {
      if (cleanupFailure) throw new AggregateError([cleanupFailure.error, terminationError],
        `TEST_PROVIDER_CLEANUP_AND_TERMINATION_FAILED:${cleanupFailure.error instanceof Error ? cleanupFailure.error.message : String(cleanupFailure.error)}:${terminationError instanceof Error ? terminationError.message : String(terminationError)}`, { cause: cleanupFailure.error });
      throw terminationError;
    }
    // Preserve the existing boundary: a failed stop never authorizes deletion.
    this.#removeSnapshot();
    if (cleanupFailure) throw cleanupFailure.error;
  }

  async terminate(): Promise<void> {
    if (this.#terminated) return;
    await this.#terminateSession(this.#session);
  }

  async #terminateSession(session: ProviderProcessSession): Promise<void> {
    session.resources();
    try { await session.terminate(); }
    finally {
      if (session.disposalConfirmed) {
        if (!this.#accountedSessions.has(session)) {
          this.#resources = this.#combinedResources(session);
          this.#accountedSessions.add(session);
        }
        if (this.#session === session) this.#terminated = true;
      }
    }
  }

  async discard(): Promise<void> {
    await this.terminate();
    this.#removeSnapshot();
  }

  #removeSnapshot(): void {
    const snapshots = path.join(fs.realpathSync(this.#workspaceRoot), 'test-provider-snapshots');
    const relative = path.relative(snapshots, this.#entry.package.root);
    if (relative === '' || relative === '..' || relative.startsWith(`..${path.sep}`)) throw new Error('TEST_PROVIDER_SNAPSHOT_PATH_INVALID');
    fs.rmSync(this.#entry.package.root, { recursive: true, force: true });
  }

  #combinedResources(session: ProviderProcessSession): ProviderProcessResources {
    const current = session.resources();
    return {
      cpuTimeMs: this.#resources.cpuTimeMs + current.cpuTimeMs,
      maximumMemoryBytes: Math.max(this.#resources.maximumMemoryBytes, current.maximumMemoryBytes),
      maximumProcesses: Math.max(this.#resources.maximumProcesses, current.maximumProcesses),
    };
  }

  resources(): ProviderProcessResources {
    return this.#terminated ? { ...this.#resources } : this.#combinedResources(this.#session);
  }
}

export class RegisteredTestProviderLoader implements TestProviderLoader {
  readonly #policy: BusterProviderRuntimeSettings;
  constructor(policy: BusterProviderRuntimeSettings) {
    this.#policy = validateBusterProviderRuntimeSettings(policy);
  }

  async load(entry: TestProviderRegistryEntry, invocation: ProviderInvocationV1, workspaceRoot: string,
    signal: AbortSignal): Promise<LoadedTestProvider> {
    if (signal.aborted) throw signal.reason ?? new Error('TEST_PROVIDER_CANCELLED');
    const provider = new IsolatedLoadedProvider(verifiedSnapshot(entry, workspaceRoot, invocation.attemptId), invocation, workspaceRoot, this.#policy);
    if (signal.aborted) { await provider.discard(); throw signal.reason ?? new Error('TEST_PROVIDER_CANCELLED'); }
    return provider;
  }
}
