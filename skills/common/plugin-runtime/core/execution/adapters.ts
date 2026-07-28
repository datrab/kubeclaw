import type {
  AdapterActivationContext,
  AdapterFactory,
  AdapterInstance,
  AttemptIdentity,
  CapabilityInvocation,
  EventIdentity,
  PackageResolution,
  RegistrationProvenance,
} from '../../sdk/src/index.ts';
import type { ActivatedRegistry } from '../registry/activation.ts';
import type { GrantedRegistry } from '../registry/capabilities.ts';
import { FrozenMap } from '../registry/frozen-map.ts';
import { EffectCoordinator } from '../effects/coordinator.ts';
import { authorizeCapabilityInvocation } from './authorization.ts';
import { validateReferencedValue } from '../registry/schema.ts';
import { isConfidentialCapability } from '../registry/capabilities.ts';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function requestDigest(request: CapabilityInvocation): string {
  return crypto.createHash('sha256').update(canonical(request)).digest('hex');
}

export interface AdapterRuntimeOptions {
  readonly granted: GrantedRegistry;
  readonly activated: ActivatedRegistry;
  readonly configs: ReadonlyMap<string, Readonly<Record<string, unknown>>>;
  readonly effects: EffectCoordinator;
  readonly shutdownTimeoutMs: number;
  readonly emitDomainEvent: (
    registration: RegistrationProvenance,
    type: string,
    identity: EventIdentity,
    payload: Readonly<Record<string, unknown>>,
  ) => Promise<void>;
}

function owner(
  runtime: AdapterRuntimeOptions,
  adapterId: string,
): PackageResolution {
  const entry = runtime.granted.snapshot.adapters.get(adapterId);
  if (!entry) throw new Error(`ADAPTER_UNKNOWN:${adapterId}`);
  return {
    ...entry.package.provenance.package,
    registrationId: entry.registration.id,
  };
}

export class AdapterRuntime {
  readonly #options: AdapterRuntimeOptions;
  readonly #invocationSignals = new AsyncLocalStorage<AbortSignal>();
  #instances: ReadonlyMap<string, AdapterInstance> = new FrozenMap([]);
  #lifecycleControllers: ReadonlyMap<string, AbortController> = new FrozenMap([]);
  readonly #pendingLifecycleControllers = new Map<string, AbortController>();
  readonly #pendingInstances = new Map<string, AdapterInstance>();
  readonly #teardownPromises = new WeakMap<AdapterInstance, Promise<void>>();
  #startPromise: Promise<void> | undefined;
  #shutdownPromise: Promise<void> | undefined;
  #started = false;
  #stopping = false;

  constructor(options: AdapterRuntimeOptions) {
    this.#options = options;
  }

  #shutdownInstance(instance: AdapterInstance, signal: AbortSignal): Promise<void> {
    const existing = this.#teardownPromises.get(instance);
    if (existing) return existing;
    const operation = Promise.resolve().then(() => instance.shutdown(signal));
    this.#teardownPromises.set(instance, operation);
    return operation;
  }

  start(): Promise<void> {
    if (this.#startPromise) return this.#startPromise;
    if (this.#stopping) return Promise.reject(new Error('ADAPTER_RUNTIME_STOPPING'));
    if (this.#started) return Promise.resolve();
    const operation = this.#startInternal();
    this.#startPromise = operation;
    void operation.then(
      () => {
        if (this.#startPromise === operation) this.#startPromise = undefined;
      },
      () => {
        if (this.#startPromise === operation) this.#startPromise = undefined;
      },
    );
    return operation;
  }

  async #startInternal(): Promise<void> {
    const instances = new Map<string, AdapterInstance>();
    const lifecycleControllers = new Map<string, AbortController>();
    const starting = new Set<string>();
    const start = async (adapterId: string): Promise<AdapterInstance> => {
      const existing = instances.get(adapterId);
      if (existing) return existing;
      if (starting.has(adapterId)) throw new Error(`ADAPTER_CYCLE:${adapterId}`);
      starting.add(adapterId);
      const entry = this.#options.granted.snapshot.adapters.get(adapterId);
      const activated = this.#options.activated.adapters.get(adapterId);
      if (!entry || !activated) throw new Error(`ADAPTER_NOT_ACTIVATED:${adapterId}`);
      const lifecycle = new AbortController();
      lifecycleControllers.set(adapterId, lifecycle);
      this.#pendingLifecycleControllers.set(adapterId, lifecycle);
      const assertActive = (): void => {
        if (lifecycle.signal.aborted) throw new Error(`ADAPTER_CONTEXT_REVOKED:${adapterId}`);
      };
      const config = this.#options.configs.get(adapterId) ?? Object.freeze({});
      validateReferencedValue(
        fs.realpathSync(path.join(entry.package.root, entry.registration.configSchema)),
        config,
      );
      for (const capability of entry.registration.requiredCapabilities) {
        const dependency = this.#options.granted.selectedProviders.get(capability);
        if (!dependency) throw new Error(`ADAPTER_DEPENDENCY_MISSING:${adapterId}:${capability}`);
        await start(`${dependency.package.manifest.id}:${dependency.registration.id}`);
      }
      const context: AdapterActivationContext = Object.freeze({
        registration: entry.provenance,
        config,
        emit: async (
          type: string,
          identity: EventIdentity,
          payload: Readonly<Record<string, unknown>>,
        ) => {
          assertActive();
          const namespace = `plugin.${entry.package.manifest.id}.`;
          if (!type.startsWith(namespace)) throw new Error(`PLUGIN_EVENT_NAMESPACE_DENIED:${type}`);
          await this.#options.emitDomainEvent(entry.provenance, type, identity, payload);
          assertActive();
        },
        invoke: async (capability: string, request: CapabilityInvocation) => {
          assertActive();
          const invocationSignal = this.#invocationSignals.getStore();
          const signal = invocationSignal
            ? AbortSignal.any([invocationSignal, lifecycle.signal])
            : lifecycle.signal;
          if (signal.aborted) throw new Error('ADAPTER_CANCELLED');
          const grant = this.#options.granted.grants.get(adapterId)?.find(
            (candidate) => candidate.capability === capability,
          );
          if (!grant) throw new Error(`ADAPTER_CAPABILITY_DENIED:${adapterId}:${capability}`);
          authorizeCapabilityInvocation(grant, request);
          const dependency = this.#options.granted.selectedProviders.get(capability);
          if (!dependency) throw new Error(`ADAPTER_CAPABILITY_DENIED:${adapterId}:${capability}`);
          const dependencyId = `${dependency.package.manifest.id}:${dependency.registration.id}`;
          const adapter = await start(dependencyId);
          const attempt: AttemptIdentity = {
            runId: `adapter:${adapterId}`,
            stageId: 'adapter-activation',
            attemptId: `adapter:${adapterId}`,
            attemptNumber: 1,
          };
          const invocation = {
            idempotencyKey: `adapter:${adapterId}:${capability}:${requestDigest(request)}`,
            attempt,
            capability,
            operation: request.operation,
            resource: request.resource,
            payload: request.payload,
          };
          if (isConfidentialCapability(capability)) {
            const result = await this.#options.effects.invokeConfidential(
              adapter,
              owner(this.#options, dependencyId),
              invocation,
              signal,
            );
            assertActive();
            return result;
          }
          const receipt = await this.#options.effects.invoke(
            adapter,
            owner(this.#options, dependencyId),
            invocation,
            signal,
          );
          if (receipt.status !== 'completed') throw new Error(receipt.error?.message ?? 'adapter dependency failed');
          assertActive();
          return receipt.result ?? {};
        },
      });
      const factory = activated.execute as AdapterFactory;
      const raw = await factory(context);
      const invocationSignal = (signal: AbortSignal): AbortSignal =>
        AbortSignal.any([signal, lifecycle.signal]);
      const instance: AdapterInstance = {
        ready: () => raw.ready(),
        invoke: (invocation) => {
          const signal = invocationSignal(invocation.signal);
          return this.#invocationSignals.run(signal, () => raw.invoke({ ...invocation, signal }));
        },
        ...(raw.receipt ? { receipt: (request) => raw.receipt!(request) } : {}),
        shutdown: (signal) => raw.shutdown(signal),
      };
      instances.set(adapterId, instance);
      this.#pendingInstances.set(adapterId, instance);
      if (this.#stopping || lifecycle.signal.aborted) throw new Error('ADAPTER_RUNTIME_STOPPING');
      await instance.ready();
      if (this.#stopping || lifecycle.signal.aborted) throw new Error('ADAPTER_RUNTIME_STOPPING');
      starting.delete(adapterId);
      return instance;
    };
    try {
      for (const [adapterId] of this.#options.granted.snapshot.adapters) {
        if (this.#options.granted.enabledRegistrations.has(adapterId)) await start(adapterId);
      }
      if (this.#stopping) throw new Error('ADAPTER_RUNTIME_STOPPING');
      this.#instances = new FrozenMap(instances);
      this.#lifecycleControllers = new FrozenMap(lifecycleControllers);
      this.#pendingLifecycleControllers.clear();
      this.#pendingInstances.clear();
      this.#started = true;
    } catch (error) {
      this.#started = false;
      for (const controller of lifecycleControllers.values()) {
        controller.abort(new Error('ADAPTER_ACTIVATION_ROLLED_BACK'));
      }
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.#options.shutdownTimeoutMs);
      try {
        for (const instance of [...instances.values()].reverse()) {
          try {
            await this.#shutdownInstance(instance, controller.signal);
          } catch {
            // Preserve the activation failure while attempting every rollback.
          }
        }
      } finally {
        clearTimeout(timer);
        starting.clear();
        for (const adapterId of lifecycleControllers.keys()) {
          this.#pendingLifecycleControllers.delete(adapterId);
          this.#pendingInstances.delete(adapterId);
        }
      }
      throw error;
    }
  }

  async invoke(
    capability: string,
    attempt: AttemptIdentity,
    idempotencyKey: string,
    request: CapabilityInvocation,
    signal: AbortSignal,
  ): Promise<Readonly<Record<string, unknown>>> {
    if (this.#stopping) throw new Error('ADAPTER_RUNTIME_STOPPING');
    const provider = this.#options.granted.selectedProviders.get(capability);
    if (!provider) throw new Error(`CAPABILITY_PROVIDER_MISSING:${capability}`);
    const adapterId = `${provider.package.manifest.id}:${provider.registration.id}`;
    const adapter = this.#instances.get(adapterId);
    if (!adapter) throw new Error(`ADAPTER_NOT_READY:${adapterId}`);
    const invocation = {
      idempotencyKey,
      attempt,
      capability,
      operation: request.operation,
      resource: request.resource,
      payload: request.payload,
    };
    if (isConfidentialCapability(capability)) {
      return this.#options.effects.invokeConfidential(
        adapter,
        owner(this.#options, adapterId),
        invocation,
        signal,
      );
    }
    const receipt = await this.#options.effects.invoke(adapter, owner(this.#options, adapterId), invocation, signal);
    if (receipt.status !== 'completed') throw new Error(receipt.error?.message ?? 'adapter effect failed');
    return receipt.result ?? {};
  }

  shutdown(): Promise<void> {
    if (this.#shutdownPromise) return this.#shutdownPromise;
    const operation = this.#shutdownInternal();
    this.#shutdownPromise = operation;
    return operation;
  }

  async #shutdownInternal(): Promise<void> {
    this.#stopping = true;
    for (const controller of this.#pendingLifecycleControllers.values()) {
      controller.abort(new Error('ADAPTER_RUNTIME_SHUTDOWN'));
    }
    for (const controller of this.#lifecycleControllers.values()) {
      controller.abort(new Error('ADAPTER_RUNTIME_SHUTDOWN'));
    }
    const controller = new AbortController();
    const timeoutError = new Error('ADAPTER_SHUTDOWN_TIMEOUT');
    let rejectTimeout: (error: Error) => void = () => {};
    const timedOut = new Promise<never>((_resolve, reject) => {
      rejectTimeout = reject;
    });
    const timer = setTimeout(() => {
      controller.abort(timeoutError);
      rejectTimeout(timeoutError);
    }, this.#options.shutdownTimeoutMs);
    try {
      const starting = this.#startPromise?.catch(() => {
        // Startup owns rollback for every instance it created.
      });
      const instances = new Set([
        ...this.#pendingInstances.values(),
        ...this.#instances.values(),
      ]);
      const work = Promise.all([
        ...(starting ? [starting] : []),
        ...[...instances].map((instance) => this.#shutdownInstance(instance, controller.signal)),
      ]);
      await Promise.race([work, timedOut]);
    } finally {
      clearTimeout(timer);
      controller.abort(new Error('ADAPTER_RUNTIME_SHUTDOWN'));
      this.#instances = new FrozenMap([]);
      this.#lifecycleControllers = new FrozenMap([]);
      this.#pendingLifecycleControllers.clear();
      this.#pendingInstances.clear();
      this.#started = false;
    }
  }
}
