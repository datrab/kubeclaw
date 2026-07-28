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
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
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
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('PROMPT_VALUE_NUMBER_INVALID');
    return value;
  }
  if (typeof value !== 'object') throw new Error('PROMPT_VALUE_UNSUPPORTED');
  if (seen.has(value)) throw new Error('PROMPT_VALUE_CYCLE');
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      if (Object.keys(value).length !== value.length) throw new Error('PROMPT_VALUE_ARRAY_SPARSE');
      return value.map((entry) => canonicalize(entry, limits, seen, depth + 1, count));
    }
    if (!plainRecord(value)) throw new Error('PROMPT_VALUE_PROTOTYPE_INVALID');
    const result: Record<string, unknown> = Object.create(null);
    for (const key of Object.keys(value).sort()) {
      if (!key || key.length > 128 || FORBIDDEN_KEYS.has(key)) throw new Error('PROMPT_VALUE_KEY_INVALID');
      result[key] = canonicalize(value[key], limits, seen, depth + 1, count);
    }
    return result;
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
  if (Object.keys(input).some((key) => !allowed.has(key))) throw new Error('PROMPT_ENVELOPE_UNKNOWN_FIELD');
  const guidance = input.guidance ?? [];
  if (!Array.isArray(guidance) || guidance.length > 100) throw new Error('PROMPT_GUIDANCE_INVALID');
  const envelope = {
    schemaVersion: PROMPT_CONTRACT_VERSION,
    task: text(input.task, 'PROMPT_TASK_INVALID', 32_768),
    evidence: input.evidence,
    responseContract: input.responseContract,
    guidance: guidance.map((entry) => text(entry, 'PROMPT_GUIDANCE_INVALID', 4_096)),
  } satisfies PromptEnvelope;
  return JSON.parse(stablePromptJson(envelope, limits)) as PromptEnvelope;
}

export function serializePromptEnvelope(input: PromptEnvelopeInput, limits: PromptLimits = {}): string {
  return stablePromptJson(createPromptEnvelope(input, limits), limits);
}
