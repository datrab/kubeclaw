import type { AsyncLocalStorage } from 'node:async_hooks';
import fs from 'node:fs';
import path from 'node:path';
import type { AdapterActivationContext, AdapterFactory, AdapterInstance, AttemptIdentity, CapabilityInvocation, EventIdentity } from '@kubeclaw/plugin-sdk';
import { validateReferencedValue } from '@kubeclaw/plugin-foundation/registry/schema';
import { isConfidentialCapability } from '@kubeclaw/plugin-foundation/registry/capabilities';
import { authorizeCapabilityInvocation } from './authorization.ts';
import type { AdapterRuntimeOptions } from './adapters.ts';
import { adapterOwner, requestDigest, shutdownLateAdapter, withAdapterStartupTimeout } from './adapter-support.ts';

interface StartupOptions {
  readonly runtime: AdapterRuntimeOptions; readonly invocationContext: AsyncLocalStorage<Readonly<{ signal: AbortSignal; attempt: AttemptIdentity }>>;
  readonly stopping: () => boolean; readonly pendingControllers: Map<string, AbortController>; readonly pendingInstances: Map<string, AdapterInstance>;
  readonly shutdown: (instance: AdapterInstance, signal: AbortSignal) => Promise<void>;
}
export interface StartedAdapters { readonly instances: Map<string, AdapterInstance>; readonly controllers: Map<string, AbortController> }

export class AdapterStarter {
  readonly #options: StartupOptions; readonly #instances = new Map<string, AdapterInstance>(); readonly #controllers = new Map<string, AbortController>(); readonly #starting = new Set<string>();
  constructor(options: StartupOptions) { this.#options = options; }

  async startAll(): Promise<StartedAdapters> {
    try {
      for (const [id] of this.#options.runtime.granted.snapshot.adapters) {
        if (this.#options.runtime.granted.enabledRegistrations.has(id)) await this.#start(id);
      }
      if (this.#options.stopping()) throw new Error('ADAPTER_RUNTIME_STOPPING');
      return { instances: this.#instances, controllers: this.#controllers };
    } catch (error) { await this.#rollback(); throw error; }
  }

  async #start(adapterId: string): Promise<AdapterInstance> {
    const existing = this.#instances.get(adapterId); if (existing) return existing;
    if (this.#starting.has(adapterId)) throw new Error(`ADAPTER_CYCLE:${adapterId}`); this.#starting.add(adapterId);
    try {
      const entry = this.#options.runtime.granted.snapshot.adapters.get(adapterId); const activated = this.#options.runtime.activated.adapters.get(adapterId);
      if (!entry || !activated) throw new Error(`ADAPTER_NOT_ACTIVATED:${adapterId}`);
      const lifecycle = new AbortController(); this.#controllers.set(adapterId, lifecycle); this.#options.pendingControllers.set(adapterId, lifecycle);
      const config = this.#config(adapterId, entry.package.root, entry.registration.configSchema);
      await this.#dependencies(adapterId, entry.registration.requiredCapabilities);
      const context = this.#context(adapterId, lifecycle, entry.provenance, entry.package.manifest.id, config);
      const raw = await this.#activate(adapterId, lifecycle, activated.execute as AdapterFactory, context);
      const instance = this.#wrap(raw, lifecycle); this.#instances.set(adapterId, instance); this.#options.pendingInstances.set(adapterId, instance);
      await this.#ready(adapterId, instance, lifecycle); return instance;
    } finally { this.#starting.delete(adapterId); }
  }

  #config(adapterId: string, root: string, schema: string): Readonly<Record<string, unknown>> {
    const config = this.#options.runtime.configs.get(adapterId) ?? Object.freeze({});
    validateReferencedValue(fs.realpathSync(path.join(root, schema)), config, this.#options.runtime.granted.snapshot.schemas); return config;
  }

  async #dependencies(adapterId: string, capabilities: readonly string[]): Promise<void> {
    for (const capability of capabilities) {
      const dependency = this.#options.runtime.granted.selectedProviders.get(capability);
      if (!dependency) throw new Error(`ADAPTER_DEPENDENCY_MISSING:${adapterId}:${capability}`);
      await this.#start(`${dependency.package.manifest.id}:${dependency.registration.id}`);
    }
  }

  #context(adapterId: string, lifecycle: AbortController, registration: AdapterActivationContext['registration'], pluginId: string, config: Readonly<Record<string, unknown>>): AdapterActivationContext {
    const active = (): void => { if (lifecycle.signal.aborted) throw new Error(`ADAPTER_CONTEXT_REVOKED:${adapterId}`); };
    return Object.freeze({ registration, config,
      emit: async (type: string, identity: EventIdentity, payload: Readonly<Record<string, unknown>>) => { active(); if (!type.startsWith(`plugin.${pluginId}.`)) throw new Error(`PLUGIN_EVENT_NAMESPACE_DENIED:${type}`);
        await this.#options.runtime.emitDomainEvent(registration, type, identity, payload); active(); },
      invoke: (capability: string, request: CapabilityInvocation) => this.#invokeDependency(adapterId, lifecycle, active, capability, request, false),
      invokeConfidential: (capability: string, request: CapabilityInvocation) => this.#invokeDependency(adapterId, lifecycle, active, capability, request, true),
    });
  }

  async #invokeDependency(adapterId: string, lifecycle: AbortController, active: () => void, capability: string, request: CapabilityInvocation, confidential: boolean): Promise<Readonly<Record<string, unknown>>> {
    active(); const parent = this.#options.invocationContext.getStore(); const signal = parent ? AbortSignal.any([parent.signal, lifecycle.signal]) : lifecycle.signal;
    if (signal.aborted) throw new Error('ADAPTER_CANCELLED');
    const grant = this.#options.runtime.granted.grants.get(adapterId)?.find((candidate) => candidate.capability === capability);
    if (!grant) throw new Error(`ADAPTER_CAPABILITY_DENIED:${adapterId}:${capability}`); authorizeCapabilityInvocation(grant, request);
    const dependency = this.#options.runtime.granted.selectedProviders.get(capability); if (!dependency) throw new Error(`ADAPTER_CAPABILITY_DENIED:${adapterId}:${capability}`);
    const dependencyId = `${dependency.package.manifest.id}:${dependency.registration.id}`; const adapter = await this.#start(dependencyId);
    const attempt = parent?.attempt ?? { runId: `adapter:${adapterId}`, stageId: 'adapter-activation', attemptId: `adapter:${adapterId}`, attemptNumber: 1 };
    const invocation = { idempotencyKey: `adapter:${adapterId}:${capability}:${requestDigest(request)}`, attempt, capability, operation: request.operation, resource: request.resource, payload: request.payload };
    const result = confidential || isConfidentialCapability(capability)
      ? await this.#options.runtime.effects.invokeConfidential(adapter, adapterOwner(this.#options.runtime, dependencyId), invocation, signal)
      : await this.#durable(adapter, dependencyId, invocation, signal);
    active(); return result;
  }

  async #durable(adapter: AdapterInstance, dependencyId: string, invocation: Parameters<AdapterRuntimeOptions['effects']['invoke']>[2], signal: AbortSignal): Promise<Readonly<Record<string, unknown>>> {
    const receipt = await this.#options.runtime.effects.invoke(adapter, adapterOwner(this.#options.runtime, dependencyId), invocation, signal);
    if (receipt.status !== 'completed') throw new Error(receipt.error?.message ?? 'adapter dependency failed'); return receipt.result ?? {};
  }

  async #activate(adapterId: string, lifecycle: AbortController, factory: AdapterFactory, context: AdapterActivationContext): Promise<AdapterInstance> {
    const operation = Promise.resolve().then(() => factory(context)); let timedOut = false;
    try { return await withAdapterStartupTimeout(adapterId, 'activate', this.#options.runtime.shutdownTimeoutMs, () => operation, (error) => { timedOut = true; lifecycle.abort(error); }); }
    catch (error) { if (timedOut) void operation.then((late) => shutdownLateAdapter(late, this.#options.runtime.shutdownTimeoutMs), () => undefined); throw error; }
  }

  #wrap(raw: AdapterInstance, lifecycle: AbortController): AdapterInstance {
    return { ready: () => raw.ready(), invoke: (invocation) => { const signal = AbortSignal.any([invocation.signal, lifecycle.signal]);
      return this.#options.invocationContext.run({ signal, attempt: invocation.request.attempt }, () => raw.invoke({ ...invocation, signal })); },
      ...(raw.receipt ? { receipt: (request) => raw.receipt!(request) } : {}), shutdown: (signal) => raw.shutdown(signal) };
  }

  async #ready(adapterId: string, instance: AdapterInstance, lifecycle: AbortController): Promise<void> {
    if (this.#options.stopping() || lifecycle.signal.aborted) throw new Error('ADAPTER_RUNTIME_STOPPING');
    try { await withAdapterStartupTimeout(adapterId, 'ready', this.#options.runtime.shutdownTimeoutMs, () => instance.ready(), (error) => lifecycle.abort(error)); }
    catch (error) { await this.#teardownFailed(adapterId, instance, lifecycle, error); }
    if (this.#options.stopping() || lifecycle.signal.aborted) throw new Error('ADAPTER_RUNTIME_STOPPING');
  }

  async #teardownFailed(adapterId: string, instance: AdapterInstance, lifecycle: AbortController, error: unknown): Promise<never> {
    lifecycle.abort(error); this.#instances.delete(adapterId); this.#controllers.delete(adapterId); this.#options.pendingInstances.delete(adapterId); this.#options.pendingControllers.delete(adapterId);
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), this.#options.runtime.shutdownTimeoutMs);
    try { await this.#options.shutdown(instance, controller.signal); }
    catch { /* INTENTIONAL_NONCRITICAL(readiness_teardown_failed): Preserve the readiness failure after bounded teardown. */ }
    finally { clearTimeout(timer); }
    throw error;
  }

  async #rollback(): Promise<void> {
    this.#controllers.forEach((controller) => controller.abort(new Error('ADAPTER_ACTIVATION_ROLLED_BACK')));
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), this.#options.runtime.shutdownTimeoutMs);
    try { for (const instance of [...this.#instances.values()].reverse()) { try { await this.#options.shutdown(instance, controller.signal); }
      catch { /* INTENTIONAL_NONCRITICAL(adapter_rollback_failed): Preserve activation failure while attempting rollback. */ } } }
    finally { clearTimeout(timer); this.#starting.clear(); for (const id of this.#controllers.keys()) { this.#options.pendingControllers.delete(id); this.#options.pendingInstances.delete(id); } }
  }
}
