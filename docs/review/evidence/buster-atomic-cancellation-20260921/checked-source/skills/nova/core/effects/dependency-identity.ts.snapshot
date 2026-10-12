import {portableJson, sha256Text, type CapabilityInvocation, type EffectRequest} from '@kubeclaw/plugin-sdk';
import {validateContractValue} from '@kubeclaw/plugin-foundation/registry/schema';
import type {EffectInvocation} from './contracts.ts';
import type {DependencyJournal, DependencyQuery} from './dependency-journal.ts';
import {validEffectIdentity} from './identity.ts';

export interface DependencyIdentity {
  readonly prefix: string;
  readonly suffix: string;
  readonly currentKey: string;
  readonly scope: string;
  readonly parent?: {readonly request: EffectRequest; readonly confidential: boolean};
}
export function portableDependencyKey(adapterId: string, capability: string, request: CapabilityInvocation,
  parent: DependencyIdentity['parent'], deliveryId: string | undefined): {key: string; scope: string} {
  const scope = sha256Text(portableJson({adapterId, capability,
    ...(parent ? {parent: {executionKey: parent.request.idempotencyKey, attempt: parent.request.attempt}} : {activation: adapterId})})).slice(7);
  const subject = {schemaVersion: 'adapter-dependency-identity.utf16.v1', adapterId, capability, request,
    ...(parent ? {parent: {executionKey: parent.request.idempotencyKey, attempt: parent.request.attempt}} : {activation: adapterId}),
    ...(deliveryId === undefined ? {} : {deliveryId})};
  return {key: `adapter-dep:utf16-v1:${scope}:${sha256Text(portableJson(subject)).slice(7)}`, scope};
}
function validateParent(identity: DependencyIdentity): void {
  if (!identity.parent) return;
  portableJson(identity.parent.request); validateContractValue('effectRequest', identity.parent.request);
  if (!identity.parent.confidential && !validEffectIdentity(identity.parent.request)) throw new Error('ADAPTER_DEPENDENCY_PARENT_UNBOUND');
}
function validateCandidate(request: EffectRequest, identity: DependencyIdentity): void {
  portableJson(request); validateContractValue('effectRequest', request);
  const inner = request.idempotencyKey.slice(identity.prefix.length, identity.suffix ? -identity.suffix.length : undefined);
  const legacy = request.idempotencyKey.startsWith(identity.prefix) && request.idempotencyKey.endsWith(identity.suffix) && /^[a-f0-9]{64}$/u.test(inner);
  if (!legacy && request.idempotencyKey !== identity.currentKey) throw new Error('ADAPTER_DEPENDENCY_IDENTITY_UNSUPPORTED');
  if (!validEffectIdentity(request)) throw new Error('ADAPTER_DEPENDENCY_HISTORY_INVALID');
}

/** Select only original, causally bound requests; never try historical collators. */
export async function resolveDependencyInvocation(journal: Partial<DependencyJournal>, invocation: EffectInvocation): Promise<EffectInvocation> {
  const identity = invocation.dependencyIdentity;
  if (!identity) return invocation;
  validateParent(identity);
  if (typeof journal.dependencyRequests !== 'function') throw new Error('ADAPTER_DEPENDENCY_JOURNAL_LOOKUP_REQUIRED');
  const query: DependencyQuery = {subject: invocation, prefix: identity.prefix, suffix: identity.suffix, scope: identity.scope,
    ...(identity.parent && !identity.parent.confidential ? {parent: identity.parent.request} : {})};
  const matches = await journal.dependencyRequests(query);
  matches.forEach(request => validateCandidate(request, identity));
  if (matches.length > 1) throw new Error('ADAPTER_DEPENDENCY_HISTORY_AMBIGUOUS');
  return {...invocation, idempotencyKey: matches[0]?.idempotencyKey ?? identity.currentKey};
}
