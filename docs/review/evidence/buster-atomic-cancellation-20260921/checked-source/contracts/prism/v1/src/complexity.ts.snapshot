// 32 MiB matches archive admission and permits a 16M-character asset source.
export const PRISM_JSON_LIMITS = Object.freeze({ depth: 256, nodes: 1_000_000, properties: 1_000_000, bytes: 32 * 1024 * 1024 });
export class PrismContractError extends Error {
  readonly code: string;
  readonly scope: string;
  constructor(code: string, scope: string) {
    super(`${scope}: ${code}`);
    this.name = 'PrismContractError';
    this.code = code;
    this.scope = scope;
  }
}
type Frame = { value: unknown; depth: number; leave?: boolean };
const encoder = new TextEncoder();
class Admission {
  nodes = 0;
  properties = 0;
  bytes = 0;
  readonly scope: string;
  readonly active = new Set<object>();
  readonly pending: Frame[] = [];
  constructor(scope: string) { this.scope = scope; }
  fail(code: string): never { throw new PrismContractError(code, this.scope); }
  addBytes(text: string): void {
    if (text.length > PRISM_JSON_LIMITS.bytes - this.bytes) this.fail('JSON_BYTES_EXCEEDED');
    this.bytes += encoder.encode(text).byteLength;
    if (this.bytes > PRISM_JSON_LIMITS.bytes) this.fail('JSON_BYTES_EXCEEDED');
  }
  primitive(value: unknown): void {
    if (!['string', 'number', 'boolean'].includes(typeof value) && value !== null) this.fail('JSON_VALUE_INVALID');
    if (typeof value === 'number' && !Number.isFinite(value)) this.fail('JSON_VALUE_INVALID');
    if (typeof value === 'string' && value.length > PRISM_JSON_LIMITS.bytes - this.bytes) this.fail('JSON_BYTES_EXCEEDED');
    this.addBytes(JSON.stringify(value));
  }
  object(value: object, depth: number): void {
    if (this.active.has(value)) this.fail('JSON_CYCLE');
    this.active.add(value);
    const keys = Object.keys(value);
    this.properties += keys.length;
    if (this.properties > PRISM_JSON_LIMITS.properties) this.fail('JSON_PROPERTIES_EXCEEDED');
    if (keys.length + this.nodes > PRISM_JSON_LIMITS.nodes) this.fail('JSON_NODES_EXCEEDED');
    const array = Array.isArray(value);
    if (array && keys.length !== value.length) this.fail('JSON_ARRAY_INVALID');
    this.addBytes(array ? '[]' : '{}');
    this.pending.push({ value, depth, leave: true });
    for (const [index, key] of keys.entries()) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !('value' in descriptor)) this.fail('JSON_PROPERTY_INVALID');
      if (array && key !== String(index)) this.fail('JSON_ARRAY_INVALID');
      if (index) this.addBytes(',');
      if (!array) this.addBytes(`${JSON.stringify(key)}:`);
      this.pending.push({ value: descriptor.value, depth: depth + 1 });
    }
  }
  run(value: unknown): void {
    this.pending.push({ value, depth: 0 });
    while (this.pending.length) {
      const frame = this.pending.pop()!;
      if (frame.leave) { this.active.delete(frame.value as object); continue; }
      if (frame.depth > PRISM_JSON_LIMITS.depth) this.fail('JSON_DEPTH_EXCEEDED');
      if (++this.nodes > PRISM_JSON_LIMITS.nodes) this.fail('JSON_NODES_EXCEEDED');
      if (frame.value !== null && typeof frame.value === 'object') this.object(frame.value, frame.depth);
      else this.primitive(frame.value);
    }
  }
}
export function assertPrismComplexity(value: unknown, scope: string): void {
  new Admission(scope).run(value);
}
