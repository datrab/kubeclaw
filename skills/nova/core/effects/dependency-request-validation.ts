import {portableJson, type EffectRequest} from '@kubeclaw/plugin-sdk';
import {validateContractValue} from '@kubeclaw/plugin-foundation/registry/schema';

/** Validate the actual persisted producer contract, including URL resources.
 * The historical generated opaqueId resource schema rejects real network URLs;
 * it is not silently relaxed or represented as satisfied by this validator.
 */
export function validateDependencyRequest(request: EffectRequest): void {
  portableJson(request);
  const keys = ['schemaVersion', 'effectId', 'idempotencyKey', 'attempt', 'capability', 'operation', 'resource', 'payload', 'requestedAt'];
  if (keys.some(key => !Object.hasOwn(request, key)) || Object.keys(request).some(key => !keys.includes(key) && key !== 'deliveryId')) throw new Error('ADAPTER_DEPENDENCY_REQUEST_INVALID');
  if (request.schemaVersion !== 'effect-request.v2' || typeof request.requestedAt !== 'string' || !Number.isFinite(Date.parse(request.requestedAt))) throw new Error('ADAPTER_DEPENDENCY_REQUEST_VERSION_INVALID');
  for (const value of [request.effectId, request.idempotencyKey, request.resource?.canonicalId]) {
    if (typeof value !== 'string' || !value) throw new Error('ADAPTER_DEPENDENCY_REQUEST_INVALID');
  }
  if (request.deliveryId !== undefined && (typeof request.deliveryId !== 'string' || !request.deliveryId)) throw new Error('ADAPTER_DEPENDENCY_REQUEST_INVALID');
  validateContractValue('attemptIdentity', request.attempt);
  validateContractValue('namespacedId', request.capability);
  validateContractValue('localId', request.operation);
  validateContractValue('namespacedId', request.resource.type);
  if (Object.keys(request.resource).some(key => !['type', 'canonicalId'].includes(key)) || !request.payload || typeof request.payload !== 'object' || Array.isArray(request.payload)) throw new Error('ADAPTER_DEPENDENCY_REQUEST_INVALID');
}
