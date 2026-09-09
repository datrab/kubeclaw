import {portableJson, sha256Text, type EffectJournal, type EffectReceipt, type EffectRequest} from '@kubeclaw/plugin-sdk';
import {validateContractValue} from '@kubeclaw/plugin-foundation/registry/schema';

export type DependencySubject = Pick<EffectRequest, 'attempt' | 'capability' | 'operation' | 'resource' | 'payload' | 'deliveryId'>;
export interface DependencyQuery { readonly subject: DependencySubject; readonly prefix: string; readonly suffix: string; readonly scope: string; readonly parent?: EffectRequest }
export interface DependencyJournal extends EffectJournal { dependencyRequests(query: DependencyQuery): Promise<readonly EffectRequest[]> }
type Facts = {request?: EffectRequest; position?: number; acceptedPosition?: number; accepted: boolean; completed: boolean; invalid: boolean};

export function dependencySubject(request: DependencySubject) {
  return {attempt: request.attempt, capability: request.capability, operation: request.operation,
    resource: request.resource, payload: request.payload, ...(request.deliveryId === undefined ? {} : {deliveryId: request.deliveryId})};
}
const digest = (request: DependencySubject) => sha256Text(portableJson(dependencySubject(request)));
const same = (left: unknown, right: unknown) => portableJson(left) === portableJson(right);
function ownedKey(key: string, query: DependencyQuery): boolean {
  return (key.startsWith(query.prefix) && (query.suffix ? key.endsWith(query.suffix) : !key.includes(':parent:')))
    || (key.startsWith('adapter-dep:') && key.split(':')[2] === query.scope);
}
function ownerScope(key: string): string | undefined {
  if (key.startsWith('adapter-dep:')) return `portable:${key.split(':')[2]}`;
  const parts = key.split(':');
  if (parts[0] !== 'adapter' || parts.length < 5) return undefined;
  const suffix = parts.at(-2) === 'parent' ? `:parent:${parts.at(-1)}` : '';
  return `legacy:${parts.slice(0, 4).join(':')}:${suffix}`;
}

/** Trusted-Core index; never installed into an adapter/plugin context. */
export class DependencyRequestIndex {
  readonly #facts = new Map<string, Facts>();
  readonly #subjects = new Map<string, Set<string>>();
  readonly #invalidKeys = new Set<string>();
  readonly #ownerAttempts = new Map<string, Set<string>>();
  #position = 0;
  #entry(key: string): Facts {
    let facts = this.#facts.get(key);
    if (!facts) {facts = {accepted: false, completed: false, invalid: false}; this.#facts.set(key, facts);}
    return facts;
  }
  requested(request: EffectRequest): void {
    const position = this.#position++;
    const facts = this.#entry(request.idempotencyKey);
    if (facts.request) facts.invalid = true;
    else {facts.request = structuredClone(request); facts.position = position;}
    if (facts.invalid) this.#invalidKeys.add(request.idempotencyKey);
    try {
      portableJson(request); validateContractValue('effectRequest', request);
      if (request.attempt.stageId === 'adapter-activation' && request.attempt.runId.startsWith('adapter:')
        && (request.attempt.runId !== request.attempt.attemptId || request.attempt.attemptNumber !== 1)) throw new Error('ADAPTER_DEPENDENCY_ACTIVATION_OWNER_INVALID');
      const scope = ownerScope(request.idempotencyKey);
      if (scope) {
        const attempts = this.#ownerAttempts.get(scope) ?? new Set<string>();
        attempts.add(sha256Text(portableJson(request.attempt))); this.#ownerAttempts.set(scope, attempts);
        if (request.idempotencyKey.startsWith('adapter-dep:') && !/^adapter-dep:utf16-v1:[a-f0-9]{64}:[a-f0-9]{64}$/u.test(request.idempotencyKey)) throw new Error('ADAPTER_DEPENDENCY_IDENTITY_UNSUPPORTED');
      }
    }
    catch {facts.invalid = true; this.#invalidKeys.add(request.idempotencyKey); return;}
    const hash = digest(request), keys = this.#subjects.get(hash) ?? new Set<string>();
    keys.add(request.idempotencyKey); this.#subjects.set(hash, keys);
  }
  accepted(request: EffectRequest): void {
    const position = this.#position++;
    const facts = this.#entry(request.idempotencyKey);
    if (!facts.request || facts.accepted || facts.completed || !same(facts.request, request)) facts.invalid = true;
    if (facts.invalid) this.#invalidKeys.add(request.idempotencyKey);
    facts.accepted = true;
    facts.acceptedPosition ??= position;
  }
  completed(receipt: EffectReceipt): void {
    this.#position++;
    const facts = this.#entry(receipt.idempotencyKey);
    try {portableJson(receipt); validateContractValue('effectReceipt', receipt);}
    catch {facts.invalid = true;}
    if (!facts.request || !facts.accepted || facts.completed || facts.request.effectId !== receipt.effectId) facts.invalid = true;
    if (facts.invalid) this.#invalidKeys.add(receipt.idempotencyKey);
    facts.completed = true;
  }
  #parent(request: EffectRequest | undefined): Facts | undefined {
    if (!request) return undefined;
    const parent = this.#facts.get(request.idempotencyKey);
    if (!parent?.request || parent.invalid || !parent.accepted || !same(parent.request, request)) throw new Error('ADAPTER_DEPENDENCY_PARENT_UNBOUND');
    return parent;
  }
  matches(query: DependencyQuery): readonly EffectRequest[] {
    for (const key of this.#invalidKeys) {
      if (ownedKey(key, query)) throw new Error('ADAPTER_DEPENDENCY_HISTORY_INVALID');
    }
    for (const scope of [`legacy:${query.prefix}${query.suffix}`, `portable:${query.scope}`]) {
      const attempts = this.#ownerAttempts.get(scope);
      if (attempts && (attempts.size !== 1 || !attempts.has(sha256Text(portableJson(query.subject.attempt))))) throw new Error('ADAPTER_DEPENDENCY_HISTORY_OWNER_MISMATCH');
    }
    const parent = this.#parent(query.parent);
    const result: EffectRequest[] = [];
    for (const key of this.#subjects.get(digest(query.subject)) ?? []) {
      if (!ownedKey(key, query)) continue;
      const facts = this.#facts.get(key)!;
      if (!facts.request || facts.invalid || (parent && facts.position! <= parent.acceptedPosition!)) throw new Error('ADAPTER_DEPENDENCY_HISTORY_INVALID');
      result.push(structuredClone(facts.request));
    }
    return result;
  }
}
