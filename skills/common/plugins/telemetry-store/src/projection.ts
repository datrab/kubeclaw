import { types } from 'node:util';

export const TELEMETRY_JSON_MAX_DEPTH = 64;
export const TELEMETRY_JSON_MAX_NODES = 100_000;
const protectedField = /(?:authorization|cookie|password|secret|token|apikey|credential|privatekey|accesskey|connectionstring)/iu;
const personalField = /^(?:user|customer)?(?:email|emailaddress|phone|phonenumber|postaladdress|homeaddress|ssn|socialsecuritynumber|personaldata|userdata)$/iu;

function sensitive(key: string): boolean {
  const normalized = key.replace(/[_\s.-]/gu, '');
  return protectedField.test(normalized) || personalField.test(normalized);
}

class TelemetrySnapshot {
  #nodes = 0;
  #bytes = 0;
  readonly #ancestors = new Set<object>();
  readonly #maximumBytes: number;

  constructor(maximumBytes: number) { this.#maximumBytes = maximumBytes; }
  consume(count: number): void {
    this.#bytes += count;
    if (this.#bytes > this.#maximumBytes) throw new Error('TELEMETRY_RECORD_SIZE_EXCEEDED');
  }
  stringBytes(value: string): number {
    if (Buffer.byteLength(value) > this.#maximumBytes - this.#bytes) throw new Error('TELEMETRY_RECORD_SIZE_EXCEEDED');
    if (!value.isWellFormed()) throw new Error('TELEMETRY_JSON_UNICODE_INVALID');
    return Buffer.byteLength(JSON.stringify(value));
  }
  objectKeys(value: object): PropertyKey[] {
    const array = Array.isArray(value);
    const prototype = Object.getPrototypeOf(value);
    if (array ? prototype !== Array.prototype : prototype !== Object.prototype && prototype !== null) {
      throw new Error('TELEMETRY_JSON_PROTOTYPE_INVALID');
    }
    const keys = Reflect.ownKeys(value);
    if (keys.length > TELEMETRY_JSON_MAX_NODES - this.#nodes + (array ? 1 : 0)) throw new Error('TELEMETRY_JSON_NODE_LIMIT');
    if (array && keys.length !== value.length + 1) throw new Error('TELEMETRY_JSON_ARRAY_INVALID');
    return keys;
  }
  dataValue(value: object, key: PropertyKey): unknown {
    if (typeof key !== 'string') throw new Error('TELEMETRY_JSON_PROPERTY_INVALID');
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !('value' in descriptor) || !descriptor.enumerable) throw new Error('TELEMETRY_JSON_PROPERTY_INVALID');
    return descriptor.value;
  }
  snapshotObject(value: object, depth: number): unknown {
    if (types.isProxy(value)) throw new Error('TELEMETRY_JSON_PROXY_INVALID');
    if (this.#ancestors.has(value)) throw new Error('TELEMETRY_JSON_CYCLE');
    const keys = this.objectKeys(value);
    const array = Array.isArray(value);
    const output: any = array ? [] : Object.create(null);
    this.#ancestors.add(value);
    this.consume(2);
    try {
      const entries = array ? Array.from({ length: value.length }, (_, index) => String(index)) : keys;
      for (const [index, key] of entries.entries()) {
        if (typeof key !== 'string') throw new Error('TELEMETRY_JSON_PROPERTY_INVALID');
        const child = this.dataValue(value, key);
        if (index > 0) this.consume(1);
        if (!array) this.consume(this.stringBytes(key) + 1);
        output[key] = this.snapshot(child, depth + 1);
      }
      return output;
    } finally { this.#ancestors.delete(value); }
  }
  snapshot(value: unknown, depth: number): unknown {
    if (++this.#nodes > TELEMETRY_JSON_MAX_NODES) throw new Error('TELEMETRY_JSON_NODE_LIMIT');
    if (depth > TELEMETRY_JSON_MAX_DEPTH) throw new Error('TELEMETRY_JSON_DEPTH_LIMIT');
    if (value === null || typeof value === 'boolean') { this.consume(JSON.stringify(value).length); return value; }
    if (typeof value === 'string') { this.consume(this.stringBytes(value)); return value; }
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) throw new Error('TELEMETRY_JSON_NUMBER_INVALID');
      this.consume(JSON.stringify(value).length); return value;
    }
    if (typeof value !== 'object') throw new Error('TELEMETRY_JSON_TYPE_INVALID');
    return this.snapshotObject(value, depth);
  }
}

function redact(value: any): any {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) =>
    [key, sensitive(key) ? '[REDACTED]' : redact(item)]));
  return value;
}

// This sink receives no trusted credential-provenance authority. A payload's
// self-asserted demo label cannot exempt a protected field from this projection.
export function telemetryProjection(payload: unknown, maximumBytes: number): Record<string, unknown> {
  const validated = new TelemetrySnapshot(maximumBytes).snapshot(payload, 0);
  if (validated === null || typeof validated !== 'object' || Array.isArray(validated)) throw new Error('TELEMETRY_JSON_ROOT_INVALID');
  // Only a fully validated, accessor-free bounded snapshot reaches redaction.
  return redact(validated);
}
