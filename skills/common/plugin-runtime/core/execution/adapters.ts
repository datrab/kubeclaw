import { AsyncLocalStorage } from 'node:async_hooks';
import type { AdapterInstance, AttemptIdentity, CapabilityInvocation, EventIdentity, RegistrationProvenance } from '../../sdk/src/index.ts';
import type { ActivatedRegistry } from '../registry/activation.ts';
import type { GrantedRegistry } from '../registry/capabilities.ts';
import { isConfidentialCapability } from '../registry/capabilities.ts';
import { FrozenMap } from '../registry/frozen-map.ts';
import type { EffectCoordinator } from '../effects/coordinator.ts';
import { AdapterStarter } from './adapter-startup.ts';
import { adapterOwner } from './adapter-support.ts';

export interface AdapterRuntimeOptions {
  readonly granted: GrantedRegistry; readonly activated: ActivatedRegistry; readonly configs: ReadonlyMap<string, Readonly<Record<string, unknown>>>;
  readonly effects: EffectCoordinator; readonly shutdownTimeoutMs: number;
  readonly emitDomainEvent: (registration: RegistrationProvenance, type: string, identity: EventIdentity, payload: Readonly<Record<string, unknown>>) => Promise<void>;
}

export class AdapterRuntime {
  readonly #options: AdapterRuntimeOptions; readonly #invocations = new AsyncLocalStorage<Readonly<{ signal: AbortSignal; attempt: AttemptIdentity }>>();
  #instances: ReadonlyMap<string, AdapterInstance> = new FrozenMap([]); #controllers: ReadonlyMap<string, AbortController> = new FrozenMap([]);
  readonly #pendingControllers = new Map<string, AbortController>(); readonly #pendingInstances = new Map<string, AdapterInstance>();
  readonly #teardowns = new WeakMap<AdapterInstance, Promise<void>>(); #startPromise: Promise<void> | undefined; #shutdownPromise: Promise<void> | undefined;
  #started = false; #stopping = false;
  constructor(options: AdapterRuntimeOptions) { this.#options = options; }

  #shutdownInstance(instance: AdapterInstance, signal: AbortSignal): Promise<void> {
    const existing = this.#teardowns.get(instance); if (existing) return existing;
    const operation = Promise.resolve().then(() => instance.shutdown(signal)); this.#teardowns.set(instance, operation); return operation;
  }

  start(): Promise<void> {
    if (this.#startPromise) return this.#startPromise;
    if (this.#stopping) return Promise.reject(new Error('ADAPTER_RUNTIME_STOPPING'));
    if (this.#started) return Promise.resolve();
    const operation = this.#start(); this.#startPromise = operation;
    void operation.finally(() => { if (this.#startPromise === operation) this.#startPromise = undefined; }).catch(() => undefined);
    return operation;
  }

  async #start(): Promise<void> {
    const starter = new AdapterStarter({ runtime: this.#options, invocationContext: this.#invocations, stopping: () => this.#stopping,
      pendingControllers: this.#pendingControllers, pendingInstances: this.#pendingInstances, shutdown: (instance, signal) => this.#shutdownInstance(instance, signal) });
    try {
      const started = await starter.startAll(); this.#instances = new FrozenMap(started.instances); this.#controllers = new FrozenMap(started.controllers);
      this.#pendingControllers.clear(); this.#pendingInstances.clear(); this.#started = true;
    } catch (error) { this.#started = false; throw error; }
  }

  async invoke(capability: string, attempt: AttemptIdentity, idempotencyKey: string, request: CapabilityInvocation, signal: AbortSignal): Promise<Readonly<Record<string, unknown>>> {
    if (this.#stopping) throw new Error('ADAPTER_RUNTIME_STOPPING');
    const provider = this.#options.granted.selectedProviders.get(capability); if (!provider) throw new Error(`CAPABILITY_PROVIDER_MISSING:${capability}`);
    const adapterId = `${provider.package.manifest.id}:${provider.registration.id}`; const adapter = this.#instances.get(adapterId);
    if (!adapter) throw new Error(`ADAPTER_NOT_READY:${adapterId}`);
    const invocation = { idempotencyKey, attempt, capability, operation: request.operation, resource: request.resource, payload: request.payload };
    if (isConfidentialCapability(capability)) return this.#options.effects.invokeConfidential(adapter, adapterOwner(this.#options, adapterId), invocation, signal);
    const receipt = await this.#options.effects.invoke(adapter, adapterOwner(this.#options, adapterId), invocation, signal);
    if (receipt.status !== 'completed') throw new Error(receipt.error?.message ?? 'adapter effect failed'); return receipt.result ?? {};
  }

  shutdown(): Promise<void> {
    if (this.#shutdownPromise) return this.#shutdownPromise;
    const operation = this.#shutdown(); this.#shutdownPromise = operation; return operation;
  }

  async #shutdown(): Promise<void> {
    this.#stopping = true; const reason = new Error('ADAPTER_RUNTIME_SHUTDOWN');
    this.#pendingControllers.forEach((controller) => controller.abort(reason)); this.#controllers.forEach((controller) => controller.abort(reason));
    const controller = new AbortController(); const timeout = new Error('ADAPTER_SHUTDOWN_TIMEOUT'); let rejectTimeout: (error: Error) => void = () => undefined;
    const deadline = new Promise<never>((_resolve, reject) => { rejectTimeout = reject; });
    const timer = setTimeout(() => { controller.abort(timeout); rejectTimeout(timeout); }, this.#options.shutdownTimeoutMs);
    try {
      const starting = this.#startPromise?.catch(() => undefined); const instances = new Set([...this.#pendingInstances.values(), ...this.#instances.values()]);
      await Promise.race([Promise.all([...(starting ? [starting] : []), ...[...instances].map((instance) => this.#shutdownInstance(instance, controller.signal))]), deadline]);
    } finally {
      clearTimeout(timer); controller.abort(reason); this.#instances = new FrozenMap([]); this.#controllers = new FrozenMap([]);
      this.#pendingControllers.clear(); this.#pendingInstances.clear(); this.#started = false;
    }
  }
}
