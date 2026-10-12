import { ProviderProcessSession } from './provider-process-session.ts';
import { validateBusterProviderRuntimeSettings, type BusterProviderRuntimeSettings } from '../../../common/plugin-runtime/foundation/config/buster-execution.ts';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { ProviderInvocationV1, ProviderResultV1 } from '@kubeclaw/pipeline-test-gate-contract';
import type { TestProviderExecutionContext } from '@kubeclaw/plugin-sdk';
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
  cleanup(invocation: ProviderInvocationV1, context: TestProviderExecutionContext): Promise<void>;
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

  async cleanup(_invocation: ProviderInvocationV1, context: TestProviderExecutionContext): Promise<void> {
    if (!this.#terminated) {
      try { if (await this.#session.initialize(context)) await this.#session.cleanup(context); }
      finally { await this.terminate(); this.#removeSnapshot(); }
      return;
    }
    const recovery = new ProviderProcessSession(this.#entry, this.#invocation, this.#workspaceRoot, this.#policy);
    try { if (await recovery.initialize(context)) await recovery.cleanup(context); }
    finally {
      recovery.resources();
      try { await recovery.terminate(); }
      finally {
        const recovered = recovery.resources();
        // Recovery starts only after the original session has terminated.
        // CPU is cumulative across those disjoint sessions; their sampled
        // memory/process peaks are not concurrent and must not be added.
        this.#resources = {
          cpuTimeMs: this.#resources.cpuTimeMs + recovered.cpuTimeMs,
          maximumMemoryBytes: Math.max(this.#resources.maximumMemoryBytes, recovered.maximumMemoryBytes),
          maximumProcesses: Math.max(this.#resources.maximumProcesses, recovered.maximumProcesses),
        };
      }
      this.#removeSnapshot();
    }
  }

  async terminate(): Promise<void> {
    if (this.#terminated) return;
    this.#session.resources();
    try { await this.#session.terminate(); }
    finally { this.#resources = this.#session.resources(); }
    this.#terminated = true;
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
