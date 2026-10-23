import { runtimeDispatchProfileFields } from '@kubeclaw/plugin-sdk';
import { validateContractValue } from '@kubeclaw/plugin-foundation/registry/schema';
import type {
  ArtifactRef,
  CapabilityInvocation,
  EventIdentity,
  PluginContext,
  PluginInvocationContext,
  RuntimeDispatchProfile,
} from '@kubeclaw/plugin-sdk';
import type { RevocableLease } from './lease.ts';
import { authorizeCapabilityInvocation } from './authorization.ts';

export interface CapabilityInvoker {
  invoke(
    leaseId: string,
    capability: string,
    operation: string,
    resource: { readonly type: string; readonly canonicalId: string },
    payload: Readonly<Record<string, unknown>>,
    runtimeDispatchProfile?: RuntimeDispatchProfile,
  ): Promise<Readonly<Record<string, unknown>>>;
}

export interface DomainEventAppender {
  append(
    leaseId: string,
    type: string,
    identity: EventIdentity,
    payload: Readonly<Record<string, unknown>>,
  ): Promise<void>;
}

export function createPluginInvocationContext(
  contract: PluginContext,
  lease: RevocableLease,
  invoker: CapabilityInvoker,
  events: DomainEventAppender,
): PluginInvocationContext {
  const grants = new Map(contract.lease.grants.map((grant) => [grant.capability, grant]));
  const artifacts = new Map(contract.artifacts.map((artifact) => [artifact.artifactId, artifact]));
  return Object.freeze({
    contract: Object.freeze(contract),
    async invoke(capability: string, request: CapabilityInvocation) {
      lease.assertActive();
      const profile = runtimeDispatchProfileFields(request, capability);
      if (profile.runtimeDispatchProfile) validateContractValue('capabilityInvocation', request);
      const grant = grants.get(capability);
      if (!grant) throw new Error(`PLUGIN_CAPABILITY_DENIED:${capability}`);
      authorizeCapabilityInvocation(grant, request);
      return invoker.invoke(
        lease.contract.leaseId,
        capability,
        request.operation,
        request.resource,
        request.payload,
        profile.runtimeDispatchProfile,
      );
    },
    async emit(
      type: string,
      identity: EventIdentity,
      payload: Readonly<Record<string, unknown>>,
    ) {
      lease.assertActive();
      const pluginId = contract.lease.registration.package.package.pluginId;
      if (!type.startsWith(`plugin.${pluginId}.`)) {
        throw new Error(`PLUGIN_EVENT_NAMESPACE_DENIED:${type}`);
      }
      if (identity.runId !== contract.lease.attempt.runId) {
        throw new Error(`PLUGIN_EVENT_RUN_ID_DENIED:${identity.runId}`);
      }
      await events.append(lease.contract.leaseId, type, identity, payload);
    },
    artifact(id: string): ArtifactRef | undefined {
      lease.assertActive();
      return artifacts.get(id);
    },
  });
}
