import { canonicalJson, sha256Text } from '@kubeclaw/plugin-sdk';

import type {
  ReviewBundleEvidence,
  ReviewBundleRequirement,
  ReviewBundleTask,
} from './review-bundle-contract.ts';
import { REVIEW_HARD_LIMITS } from './review-hard-limits.ts';
import { SIMPLIFICATION_CANDIDATES_EVIDENCE_KIND } from './simplification-contract.ts';

export interface ReviewStageInput {
  readonly task: ReviewBundleTask;
  readonly revisions: { readonly base: string };
  readonly scope: {
    readonly allowedPrefixes: readonly string[];
    readonly ownershipPrefixes: readonly string[];
  };
  readonly requirements: readonly ReviewBundleRequirement[];
  readonly evidence: readonly ReviewBundleEvidence[];
  readonly contextCandidates: readonly unknown[];
}

export type ParsedReviewInput =
  | { readonly ok: true; readonly value: ReviewStageInput }
  | { readonly ok: false; readonly error: string };

export type ReviewInputPreflight =
  | 'within_limit' | 'size_exceeded' | 'depth_exceeded' | 'invalid_json';

function plainRecord(value: unknown, label: string): Readonly<Record<string, unknown>> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw new Error(`${label} must be plain JSON`);
  return value as Readonly<Record<string, unknown>>;
}

function exact(value: Readonly<Record<string, unknown>>, fields: readonly string[], label: string): void {
  const actual = Object.keys(value);
  if (actual.length !== fields.length || actual.some((field) => !fields.includes(field))) {
    throw new Error(`${label} fields are invalid`);
  }
}

function text(value: unknown, label: string, maximum: number): string {
  if (typeof value !== 'string' || !value.trim() || value !== value.trim()
    || Array.from(value).length > maximum) throw new Error(`${label} must be non-empty bounded text`);
  return value;
}

function identifier(value: unknown, label: string): string {
  const parsed = text(value, label, REVIEW_HARD_LIMITS.identifierCharacters);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]*$/u.test(parsed)) throw new Error(`${label} is invalid`);
  return parsed;
}

function array(value: unknown, label: string, minimum: number, maximum: number): readonly unknown[] {
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum) {
    throw new Error(`${label} must contain ${minimum}-${maximum} items`);
  }
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.hasOwn(value, index)) throw new Error(`${label} must not be sparse`);
  }
  return value;
}

function repositoryPath(value: unknown, label: string, allowRoot = false): string {
  const parsed = text(value, label, REVIEW_HARD_LIMITS.pathCharacters);
  if (allowRoot && parsed === '.') return parsed;
  if (parsed.startsWith('/') || parsed.includes(':') || parsed.includes('\\')
    || /[\u0000-\u001F\u007F]/u.test(parsed)
    || parsed.split('/').some((part) => !part || part === '.' || part === '..')) {
    throw new Error(`${label} is invalid`);
  }
  return parsed;
}

function gitObject(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u.test(value)) {
    throw new Error(`${label} is invalid`);
  }
  return value;
}

function digest(value: unknown, label: string): `sha256:${string}` {
  if (typeof value !== 'string' || !/^sha256:[0-9a-f]{64}$/u.test(value)) {
    throw new Error(`${label} is invalid`);
  }
  return value as `sha256:${string}`;
}

function requirement(value: unknown, index: number): ReviewBundleRequirement {
  const label = `requirements[${index}]`;
  const item = plainRecord(value, label);
  exact(item, ['id', 'statement'], label);
  return {
    id: identifier(item.id, `${label}.id`),
    statement: text(item.statement, `${label}.statement`, REVIEW_HARD_LIMITS.explanationCharacters),
  };
}

function evidence(value: unknown, index: number): ReviewBundleEvidence {
  const label = `evidence[${index}]`;
  const item = plainRecord(value, label);
  exact(item, ['kind', 'digest', 'content'], label);
  const kind = identifier(item.kind, `${label}.kind`);
  if (kind === SIMPLIFICATION_CANDIDATES_EVIDENCE_KIND) {
    throw new Error(`${label}.kind is reserved for plugin-authored evidence`);
  }
  const content = canonicalJson(item.content);
  const expected = digest(item.digest, `${label}.digest`);
  if (sha256Text(content) !== expected) throw new Error(`${label}.digest does not match canonical content`);
  if (Buffer.byteLength(content, 'utf8') > REVIEW_HARD_LIMITS.evidenceContentBytes) {
    throw new Error(`${label}.content exceeds its byte limit`);
  }
  return { kind, digest: expected, content };
}

function unique(values: readonly string[], label: string): void {
  if (new Set(values).size !== values.length) throw new Error(`${label} contains duplicates`);
}

function freeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Readonly<Record<string, unknown>>)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

function parseScope(scopeValue: Readonly<Record<string, unknown>>): ReviewStageInput['scope'] {
  const scopeFields = Object.keys(scopeValue);
  if (!Object.hasOwn(scopeValue, 'allowedPrefixes')
    || scopeFields.some((field) => !['allowedPrefixes', 'ownershipPrefixes'].includes(field))) {
    throw new Error('scope fields are invalid');
  }
  const allowedPrefixes = array(
    scopeValue.allowedPrefixes, 'scope.allowedPrefixes', 1, REVIEW_HARD_LIMITS.scopePrefixes,
  ).map((entry, index) => repositoryPath(entry, `scope.allowedPrefixes[${index}]`, true));
  const ownershipPrefixes = scopeValue.ownershipPrefixes === undefined ? [...allowedPrefixes]
    : array(scopeValue.ownershipPrefixes, 'scope.ownershipPrefixes', 1, REVIEW_HARD_LIMITS.scopePrefixes)
      .map((entry, index) => repositoryPath(entry, `scope.ownershipPrefixes[${index}]`, true));
  unique(allowedPrefixes, 'scope.allowedPrefixes'); unique(ownershipPrefixes, 'scope.ownershipPrefixes');
  if (ownershipPrefixes.some((prefix) => !allowedPrefixes.some((allowed) => (
    allowed === '.' || prefix === allowed || prefix.startsWith(`${allowed}/`)
  )))) throw new Error('scope.ownershipPrefixes must be within allowed scope');
  return { allowedPrefixes, ownershipPrefixes };
}

function parse(value: unknown): ReviewStageInput {
  const input = plainRecord(value, 'review input');
  exact(input, ['task', 'revisions', 'scope', 'requirements', 'evidence', 'contextCandidates'], 'review input');
  const taskValue = plainRecord(input.task, 'task');
  exact(taskValue, ['id', 'statement'], 'task');
  const revisionsValue = plainRecord(input.revisions, 'revisions');
  exact(revisionsValue, ['base'], 'revisions');
  const scopeValue = plainRecord(input.scope, 'scope');
  const scope = parseScope(scopeValue);
  const requirements = array(
    input.requirements, 'requirements', 1, REVIEW_HARD_LIMITS.requirementAssessments,
  ).map(requirement);
  const evidenceItems = array(
    input.evidence, 'evidence', 1, REVIEW_HARD_LIMITS.inspectedEvidence,
  ).map(evidence);
  const contextCandidates = array(
    input.contextCandidates, 'contextCandidates', 0, REVIEW_HARD_LIMITS.contextCandidates,
  ).map((entry) => structuredClone(entry));
  unique(requirements.map(({ id }) => id), 'requirements');
  unique(evidenceItems.map(({ kind, digest: valueDigest }) => `${kind}\0${valueDigest}`), 'evidence');
  return freeze({
    task: {
      id: identifier(taskValue.id, 'task.id'),
      statement: text(taskValue.statement, 'task.statement', 16_384),
    },
    revisions: {
      base: gitObject(revisionsValue.base, 'revisions.base'),
    },
    scope, requirements, evidence: evidenceItems, contextCandidates,
  });
}

function boundedJsonPrimitive(value: unknown): boolean | undefined {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  return undefined;
}

function boundedJson(value: unknown, depth = 0): boolean {
  if (depth > 32) return false;
  const primitive = boundedJsonPrimitive(value);
  if (primitive !== undefined) return primitive;
  if (Array.isArray(value)) return value.length <= 10_000 && value.every((entry) => boundedJson(entry, depth + 1));
  if (!value || typeof value !== 'object') return false;
  const prototype = Object.getPrototypeOf(value);
  return (prototype === Object.prototype || prototype === null)
    && Object.values(value as Readonly<Record<string, unknown>>).every((entry) => boundedJson(entry, depth + 1));
}

export function preflightReviewInput(value: unknown, limit: number): ReviewInputPreflight {
  if (!boundedJson(value)) return 'invalid_json';
  try {
    return Buffer.byteLength(canonicalJson(value), 'utf8') > limit ? 'size_exceeded' : 'within_limit';
  } catch { return 'invalid_json'; }
}

export function parseReviewInput(value: unknown): ParsedReviewInput {
  try { return { ok: true, value: parse(value) }; } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
