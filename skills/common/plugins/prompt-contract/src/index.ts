import { types } from 'node:util';

export const PROMPT_CONTRACT_VERSION = 'prompt-envelope.v1' as const;

export interface PromptEnvelopeInput {
  readonly task: string;
  readonly evidence: unknown;
  readonly responseContract: unknown;
  readonly guidance?: readonly string[];
}

export interface PromptEnvelope {
  readonly schemaVersion: typeof PROMPT_CONTRACT_VERSION;
  readonly task: string;
  readonly evidence: unknown;
  readonly responseContract: unknown;
  readonly guidance: readonly string[];
}

export interface PromptLimits {
  readonly maxBytes?: number;
  readonly maxDepth?: number;
  readonly maxEntries?: number;
}

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function plainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || types.isProxy(value) || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function positiveInteger(value: number | undefined, fallback: number, maximum: number, code: string): number {
  const candidate = value ?? fallback;
  if (!Number.isSafeInteger(candidate) || candidate < 1 || candidate > maximum) throw new Error(code);
  return candidate;
}

function text(value: unknown, code: string, maximum: number): string {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum || /[\u0000]/u.test(value)) {
    throw new Error(code);
  }
  return value;
}

function canonicalNumber(value: number): number {
  if (!Number.isFinite(value)) throw new Error('PROMPT_VALUE_NUMBER_INVALID');
  return value;
}

function dataProperty(value: object, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (!descriptor || !('value' in descriptor) || !descriptor.enumerable) throw new Error('PROMPT_VALUE_PROPERTY_INVALID');
  return descriptor.value;
}

function dataKeys(value: object): string[] {
  const keys = Reflect.ownKeys(value);
  if (keys.some((key) => typeof key !== 'string')) throw new Error('PROMPT_VALUE_PROPERTY_INVALID');
  for (const key of keys as string[]) dataProperty(value, key);
  return keys as string[];
}

function canonicalArray(
  value: readonly unknown[], limits: Required<PromptLimits>, seen: Set<object>,
  depth: number, count: { value: number },
): readonly unknown[] {
  if (Object.getPrototypeOf(value) !== Array.prototype) throw new Error('PROMPT_VALUE_PROTOTYPE_INVALID');
  const keys = Reflect.ownKeys(value);
  if (keys.length !== value.length + 1) throw new Error('PROMPT_VALUE_ARRAY_SPARSE');
  const result: unknown[] = [];
  for (let index = 0; index < value.length; index++) {
    if (!Object.hasOwn(value, index)) throw new Error('PROMPT_VALUE_ARRAY_SPARSE');
    result.push(canonicalize(dataProperty(value, String(index)), limits, seen, depth + 1, count));
  }
  return result;
}

function canonicalRecord(
  value: Record<string, unknown>, limits: Required<PromptLimits>, seen: Set<object>,
  depth: number, count: { value: number },
): Record<string, unknown> {
  const result: Record<string, unknown> = Object.create(null);
  for (const key of dataKeys(value).sort()) {
    if (!key || key.length > 128 || FORBIDDEN_KEYS.has(key)) throw new Error('PROMPT_VALUE_KEY_INVALID');
    result[key] = canonicalize(dataProperty(value, key), limits, seen, depth + 1, count);
  }
  return result;
}

function canonicalize(
  value: unknown,
  limits: Required<PromptLimits>,
  seen: Set<object>,
  depth: number,
  count: { value: number },
): unknown {
  if (depth > limits.maxDepth) throw new Error('PROMPT_VALUE_DEPTH_EXCEEDED');
  count.value += 1;
  if (count.value > limits.maxEntries) throw new Error('PROMPT_VALUE_ENTRIES_EXCEEDED');
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return value;
  if (typeof value === 'number') return canonicalNumber(value);
  if (typeof value !== 'object') throw new Error('PROMPT_VALUE_UNSUPPORTED');
  if (types.isProxy(value)) throw new Error('PROMPT_VALUE_PROXY_UNSUPPORTED');
  if (seen.has(value)) throw new Error('PROMPT_VALUE_CYCLE');
  seen.add(value);
  try {
    if (Array.isArray(value)) return canonicalArray(value, limits, seen, depth, count);
    if (!plainRecord(value)) throw new Error('PROMPT_VALUE_PROTOTYPE_INVALID');
    return canonicalRecord(value, limits, seen, depth, count);
  } finally {
    seen.delete(value);
  }
}

function resolvedLimits(limits: PromptLimits = {}): Required<PromptLimits> {
  return {
    maxBytes: positiveInteger(limits.maxBytes, 262_144, 8_388_608, 'PROMPT_LIMIT_INVALID:maxBytes'),
    maxDepth: positiveInteger(limits.maxDepth, 20, 100, 'PROMPT_LIMIT_INVALID:maxDepth'),
    maxEntries: positiveInteger(limits.maxEntries, 10_000, 100_000, 'PROMPT_LIMIT_INVALID:maxEntries'),
  };
}

export function stablePromptJson(value: unknown, limits: PromptLimits = {}): string {
  const resolved = resolvedLimits(limits);
  const canonical = canonicalize(value, resolved, new Set(), 0, { value: 0 });
  const output = JSON.stringify(canonical);
  if (Buffer.byteLength(output, 'utf8') > resolved.maxBytes) throw new Error('PROMPT_VALUE_SIZE_EXCEEDED');
  return output;
}

export function createPromptEnvelope(input: PromptEnvelopeInput, limits: PromptLimits = {}): PromptEnvelope {
  if (!plainRecord(input)) throw new Error('PROMPT_ENVELOPE_INVALID');
  const allowed = new Set(['task', 'evidence', 'responseContract', 'guidance']);
  if (dataKeys(input).some((key) => !allowed.has(key))) throw new Error('PROMPT_ENVELOPE_UNKNOWN_FIELD');
  // Validate before mapping so accessors or extra array properties cannot be lost.
  const guidance = input.guidance ?? [];
  if (!Array.isArray(guidance) || guidance.length > 100) throw new Error('PROMPT_GUIDANCE_INVALID');
  const checkedGuidance = canonicalize(guidance, resolvedLimits(limits), new Set(), 0, { value: 0 }) as unknown[];
  const envelope = {
    schemaVersion: PROMPT_CONTRACT_VERSION,
    task: text(input.task, 'PROMPT_TASK_INVALID', 32_768),
    evidence: input.evidence,
    responseContract: input.responseContract,
    guidance: checkedGuidance.map((entry) => text(entry, 'PROMPT_GUIDANCE_INVALID', 4_096)),
  } satisfies PromptEnvelope;
  return JSON.parse(stablePromptJson(envelope, limits)) as PromptEnvelope;
}

export function serializePromptEnvelope(input: PromptEnvelopeInput, limits: PromptLimits = {}): string {
  return stablePromptJson(createPromptEnvelope(input, limits), limits);
}
