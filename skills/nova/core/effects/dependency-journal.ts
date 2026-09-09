import {portableJson, sha256Text, type EffectJournal, type EffectReceipt, type EffectRequest} from '@kubeclaw/plugin-sdk';

export type DependencySubject = Pick<EffectRequest, 'attempt' | 'capability' | 'operation' | 'resource' | 'payload' | 'deliveryId'>;
export interface DependencyQuery { readonly subject: DependencySubject; readonly prefix: string; readonly suffix: string; readonly parent?: EffectRequest }
export interface DependencyJournal extends EffectJournal { dependencyRequests(query: DependencyQuery): Promise<readonly EffectRequest[]> }
type Facts = {request?: EffectRequest; position?: number; accepted: boolean; completed: boolean; invalid: boolean};

export function dependencySubject(request: DependencySubject) {
  return {attempt: request.attempt, capability: request.capability, operation: request.operation,
    resource: request.resource, payload: request.payload, ...(request.deliveryId === undefined ? {} : {deliveryId: request.deliveryId})};
}
const digest = (request: DependencySubject) => sha256Text(portableJson(dependencySubject(request)));
const same = (left: unknown, right: unknown) => portableJson(left) === portableJson(right);

/** Trusted-Core index; never installed into an adapter/plugin context. */
export class DependencyRequestIndex {
  readonly #facts = new Map<string, Facts>();
  readonly #subjects = new Map<string, Set<string>>();
  readonly #invalidKeys = new Set<string>();
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
    const hash = digest(request), keys = this.#subjects.get(hash) ?? new Set<string>();
    keys.add(request.idempotencyKey); this.#subjects.set(hash, keys);
  }
  accepted(request: EffectRequest): void {
    this.#position++;
    const facts = this.#entry(request.idempotencyKey);
    if (!facts.request || facts.accepted || facts.completed || !same(facts.request, request)) facts.invalid = true;
    if (facts.invalid) this.#invalidKeys.add(request.idempotencyKey);
    facts.accepted = true;
  }
  completed(receipt: EffectReceipt): void {
    this.#position++;
    const facts = this.#entry(receipt.idempotencyKey);
    if (!facts.request || !facts.accepted || facts.completed || facts.request.effectId !== receipt.effectId) facts.invalid = true;
    if (facts.invalid) this.#invalidKeys.add(receipt.idempotencyKey);
    facts.completed = true;
  }
  matches(query: DependencyQuery): readonly EffectRequest[] {
    for (const key of this.#invalidKeys) {
      if (key.startsWith(query.prefix) && key.endsWith(query.suffix)) throw new Error('ADAPTER_DEPENDENCY_HISTORY_INVALID');
    }
    const parent = query.parent ? this.#facts.get(query.parent.idempotencyKey) : undefined;
    if (query.parent && (!parent?.request || parent.invalid || !parent.accepted || !same(parent.request, query.parent))) {
      throw new Error('ADAPTER_DEPENDENCY_PARENT_UNBOUND');
    }
    const result: EffectRequest[] = [];
    for (const key of this.#subjects.get(digest(query.subject)) ?? []) {
      if (!key.startsWith(query.prefix) || !key.endsWith(query.suffix)) continue;
      const facts = this.#facts.get(key)!;
      if (!facts.request || facts.invalid || (parent && facts.position! <= parent.position!)) throw new Error('ADAPTER_DEPENDENCY_HISTORY_INVALID');
      result.push(structuredClone(facts.request));
    }
    return result;
  }
}
