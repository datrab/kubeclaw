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
  #resources: ProviderProcessResources = { cpuTimeMs: 0, maximumMemoryBytes: 0, maximumProcesses: 1 };

  readonly #workspaceRoot: string;

  constructor(entry: TestProviderRegistryEntry, invocation: ProviderInvocationV1, workspaceRoot: string, policy: BusterProviderRuntimeSettings) {
    this.#policy = policy;
    this.#entry = entry; this.#invocation = invocation; this.#workspaceRoot = workspaceRoot;
    this.#session = new ProviderProcessSession(entry, invocation, workspaceRoot, policy);
  }

  supportsCleanup(context: TestProviderExecutionContext): Promise<boolean> { return this.#session.initialize(context); }

  execute(_invocation: ProviderInvocationV1, context: TestProviderExecutionContext): Promise<ProviderResultV1> {
    return this.#session.execute(context);
  }

  async cleanup(_invocation: ProviderInvocationV1, context: TestProviderExecutionContext, disposition: TestProviderCleanupDisposition): Promise<void> {
    assertCleanupDisposition(disposition);
    if (!this.#terminated) {
      await this.#cleanupSession(this.#session, context, disposition, () => this.terminate());
      return;
    }
    const recovery = new ProviderProcessSession(this.#entry, this.#invocation, this.#workspaceRoot, this.#policy);
    try {
      await this.#cleanupSession(recovery, context, disposition, () => recovery.terminate());
    } finally {
      const recovered = recovery.resources();
      // Original and recovery observations are disjoint, not concurrent peaks.
      this.#resources = {
        cpuTimeMs: this.#resources.cpuTimeMs + recovered.cpuTimeMs,
        maximumMemoryBytes: Math.max(this.#resources.maximumMemoryBytes, recovered.maximumMemoryBytes),
        maximumProcesses: Math.max(this.#resources.maximumProcesses, recovered.maximumProcesses),
      };
    }
  }

  async #cleanupSession(session: ProviderProcessSession, context: TestProviderExecutionContext,
    disposition: TestProviderCleanupDisposition, terminate: () => Promise<void>): Promise<void> {
    let cleanupFailure: { error: unknown } | undefined;
    try { if (await session.initialize(context)) await session.cleanup(context, disposition); }
    catch (error) { cleanupFailure = { error }; }
    try { await terminate(); }
    catch (terminationError) {
      if (cleanupFailure) throw new AggregateError([cleanupFailure.error, terminationError],
        'TEST_PROVIDER_CLEANUP_AND_TERMINATION_FAILED', { cause: cleanupFailure.error });
      throw terminationError;
    }
    // Preserve the existing boundary: a failed stop never authorizes deletion.
    this.#removeSnapshot();
    if (cleanupFailure) throw cleanupFailure.error;
  }

  async terminate(): Promise<void> {
    if (this.#terminated) return;
    this.#session.resources();
    try { await this.#session.terminate(); }
    finally {
      this.#terminated = this.#session.disposalConfirmed;
      this.#resources = this.#session.resources();
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

  resources(): ProviderProcessResources {
    const current = this.#terminated ? this.#resources : this.#session.resources();
    return { ...current };
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
