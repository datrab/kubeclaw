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

  constructor(options: AdapterRuntimeOptions) {
    this.#options = options;
  }

  async start(): Promise<void> {
    const instances = new Map<string, AdapterInstance>();
    const starting = new Set<string>();
    const start = async (adapterId: string): Promise<AdapterInstance> => {
      const existing = instances.get(adapterId);
      if (existing) return existing;
      if (starting.has(adapterId)) throw new Error(`ADAPTER_CYCLE:${adapterId}`);
      starting.add(adapterId);
      const entry = this.#options.granted.snapshot.adapters.get(adapterId);
      const activated = this.#options.activated.adapters.get(adapterId);
      if (!entry || !activated) throw new Error(`ADAPTER_NOT_ACTIVATED:${adapterId}`);
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
          const namespace = `plugin.${entry.package.manifest.id}.`;
          if (!type.startsWith(namespace)) throw new Error(`PLUGIN_EVENT_NAMESPACE_DENIED:${type}`);
          await this.#options.emitDomainEvent(entry.provenance, type, identity, payload);
        },
        invoke: async (capability: string, request: CapabilityInvocation) => {
          const signal = this.#invocationSignals.getStore() ?? new AbortController().signal;
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
            return this.#options.effects.invokeConfidential(adapter, invocation, signal);
          }
          const receipt = await this.#options.effects.invoke(
            adapter,
            owner(this.#options, dependencyId),
            invocation,
            signal,
          );
          if (receipt.status !== 'completed') throw new Error(receipt.error?.message ?? 'adapter dependency failed');
          return receipt.result ?? {};
        },
      });
      const factory = activated.execute as AdapterFactory;
      const raw = await factory(context);
      const instance: AdapterInstance = {
        ready: () => raw.ready(),
        invoke: (invocation) => this.#invocationSignals.run(
          invocation.signal,
          () => raw.invoke(invocation),
        ),
        shutdown: (signal) => raw.shutdown(signal),
      };
      instances.set(adapterId, instance);
      await instance.ready();
      starting.delete(adapterId);
      return instance;
    };
    try {
      for (const [adapterId] of this.#options.granted.snapshot.adapters) {
        if (this.#options.granted.enabledRegistrations.has(adapterId)) await start(adapterId);
      }
      this.#instances = new FrozenMap(instances);
    } catch (error) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.#options.shutdownTimeoutMs);
      try {
        for (const instance of [...instances.values()].reverse()) {
          try {
            await instance.shutdown(controller.signal);
          } catch {
            // Preserve the activation failure while attempting every rollback.
          }
        }
      } finally {
        clearTimeout(timer);
        starting.clear();
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
      return this.#options.effects.invokeConfidential(adapter, invocation, signal);
    }
    const receipt = await this.#options.effects.invoke(adapter, owner(this.#options, adapterId), invocation, signal);
    if (receipt.status !== 'completed') throw new Error(receipt.error?.message ?? 'adapter effect failed');
    return receipt.result ?? {};
  }

  async shutdown(): Promise<void> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.#options.shutdownTimeoutMs);
    try {
      await Promise.all([...this.#instances.values()].map((instance) => instance.shutdown(controller.signal)));
    } finally {
      clearTimeout(timer);
      this.#instances = new FrozenMap([]);
    }
  }
}
