import { canonicalJson, sha256Text } from '@kubeclaw/plugin-sdk';

import { REVIEW_HARD_LIMITS } from './review-hard-limits.ts';

export const REVALIDATION_DISPOSITIONS = Object.freeze([
  'accepted_current', 'already_fixed', 'rejected', 'needs_additional_reproduction',
  'superseded_by_shared_root_cause',
] as const);
export type RepositoryRevalidationDisposition = typeof REVALIDATION_DISPOSITIONS[number];

export interface RepositoryRevalidationResult {
  readonly schemaVersion: 'repository-finding-revalidation.v1';
  readonly findingFingerprint: `sha256:${string}`;
  readonly targetHead: string;
  readonly disposition: RepositoryRevalidationDisposition;
  readonly reason: string;
  readonly evidence: readonly Readonly<{ path: string; lineHint: number; symbol?: string; digest: `sha256:${string}` }>[];
  readonly validationCommands: readonly string[];
  readonly supersededBy?: `sha256:${string}`;
  readonly remediationDependencies: readonly `sha256:${string}`[];
}

const digest = { type: 'string', pattern: '^sha256:[0-9a-f]{64}(?![\\s\\S])' } as const;
const text = (maximum: number) => ({ type: 'string', minLength: 1, maxLength: maximum,
  pattern: '^\\S(?:[\\s\\S]*\\S)?(?![\\s\\S])' } as const);

export const repositoryRevalidationOutputSchema = Object.freeze({
  type: 'object', additionalProperties: false,
  required: ['schemaVersion', 'findingFingerprint', 'targetHead', 'disposition', 'reason', 'evidence',
    'validationCommands', 'remediationDependencies'],
  properties: {
    schemaVersion: { const: 'repository-finding-revalidation.v1' },
    findingFingerprint: digest,
    targetHead: text(64),
    disposition: { enum: REVALIDATION_DISPOSITIONS },
    reason: text(REVIEW_HARD_LIMITS.explanationCharacters),
    evidence: { type: 'array', maxItems: 64, uniqueItems: true, items: {
      type: 'object', additionalProperties: false, required: ['path', 'lineHint', 'digest'],
      properties: { path: text(1024), lineHint: { type: 'integer', minimum: 1, maximum: 100_000_000 },
        symbol: text(512), digest },
    } },
    validationCommands: { type: 'array', minItems: 1, maxItems: 32, uniqueItems: true,
      items: text(4096) },
    supersededBy: digest,
    remediationDependencies: { type: 'array', maxItems: 64, uniqueItems: true, items: digest },
  },
  allOf: [{
    if: { properties: { disposition: { const: 'superseded_by_shared_root_cause' } }, required: ['disposition'] },
    then: { required: ['supersededBy'] },
    else: { not: { required: ['supersededBy'] } },
  }, {
    if: { properties: { disposition: { const: 'accepted_current' } }, required: ['disposition'] },
    then: { properties: { evidence: { minItems: 1 } } },
  }],
} as const);

function record(value: unknown, label: string): Readonly<Record<string, unknown>> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} is invalid`);
  return value as Readonly<Record<string, unknown>>;
}
function exact(value: Readonly<Record<string, unknown>>, required: readonly string[], optional: readonly string[] = []): void {
  if (!required.every((field) => Object.hasOwn(value, field))
    || Object.keys(value).some((field) => !required.includes(field) && !optional.includes(field))) {
    throw new Error('repository revalidation output shape is invalid');
  }
}
function requiredText(value: unknown, label: string, maximum = 4096): string {
  if (typeof value !== 'string' || value !== value.trim() || value.length < 1 || value.length > maximum) {
    throw new Error(`${label} is invalid`);
  }
  return value;
}
function requiredDigest(value: unknown, label: string): `sha256:${string}` {
  const parsed = requiredText(value, label, 71);
  if (!/^sha256:[0-9a-f]{64}$/u.test(parsed)) throw new Error(`${label} is invalid`);
  return parsed as `sha256:${string}`;
}
function textList(value: unknown, label: string, maximum: number): readonly string[] {
  if (!Array.isArray(value) || value.length > maximum) throw new Error(`${label} is invalid`);
  const output = value.map((item, index) => requiredText(item, `${label}[${index}]`));
  if (new Set(output).size !== output.length) throw new Error(`${label} is invalid`);
  return Object.freeze(output);
}

export function parseRepositoryRevalidationResult(
  value: unknown, expected: { readonly fingerprint: string; readonly targetHead: string;
    readonly sources: ReadonlyMap<string, { readonly digest: string;
      readonly ranges: readonly { readonly startLine: number; readonly endLine: number }[] }>;
    readonly relationshipFingerprints: ReadonlySet<string> },
): RepositoryRevalidationResult {
  const output = record(value, 'repository revalidation output');
  const required = ['schemaVersion', 'findingFingerprint', 'targetHead', 'disposition', 'reason', 'evidence',
    'validationCommands', 'remediationDependencies'];
  exact(output, required, ['supersededBy']);
  if (output.schemaVersion !== 'repository-finding-revalidation.v1'
    || output.findingFingerprint !== expected.fingerprint || output.targetHead !== expected.targetHead
    || !REVALIDATION_DISPOSITIONS.includes(output.disposition as never)) {
    throw new Error('repository revalidation output identity is invalid');
  }
  if (!Array.isArray(output.evidence) || output.evidence.length > 64) throw new Error('repository revalidation evidence is invalid');
  const evidence = output.evidence.map((raw, index) => {
    const item = record(raw, `evidence[${index}]`); exact(item, ['path', 'lineHint', 'digest'], ['symbol']);
    const path = requiredText(item.path, `evidence[${index}].path`, 1024);
    const digestValue = requiredDigest(item.digest, `evidence[${index}].digest`);
    const source = expected.sources.get(path);
    if (!Number.isSafeInteger(item.lineHint) || Number(item.lineHint) < 1
      || Number(item.lineHint) > 100_000_000 || source?.digest !== digestValue
      || !source.ranges.some(({ startLine, endLine }) => Number(item.lineHint) >= startLine
        && Number(item.lineHint) <= endLine)) throw new Error('repository revalidation evidence is not supplied source');
    return Object.freeze({ path, lineHint: Number(item.lineHint), digest: digestValue,
      ...(item.symbol === undefined ? {} : { symbol: requiredText(item.symbol, `evidence[${index}].symbol`, 512) }) });
  });
  if (new Set(evidence.map(canonicalJson)).size !== evidence.length) {
    throw new Error('repository revalidation evidence is not unique');
  }
  const disposition = output.disposition as RepositoryRevalidationDisposition;
  if (disposition === 'accepted_current' && evidence.length < 1) {
    throw new Error('accepted repository revalidation requires current evidence');
  }
  const supersededBy = output.supersededBy === undefined ? undefined
    : requiredDigest(output.supersededBy, 'supersededBy');
  if ((disposition === 'superseded_by_shared_root_cause') !== (supersededBy !== undefined)) {
    throw new Error('repository revalidation supersession is invalid');
  }
  const commands = textList(output.validationCommands, 'validationCommands', 32);
  if (commands.length < 1) throw new Error('repository revalidation validationCommands is invalid');
  const dependencies = textList(output.remediationDependencies, 'remediationDependencies', 64)
    .map((item) => requiredDigest(item, 'remediationDependency')).sort();
  if ((supersededBy !== undefined && !expected.relationshipFingerprints.has(supersededBy))
    || dependencies.some((item) => !expected.relationshipFingerprints.has(item))) {
    throw new Error('repository revalidation relationship is not supplied');
  }
  return Object.freeze({ schemaVersion: 'repository-finding-revalidation.v1',
    findingFingerprint: requiredDigest(output.findingFingerprint, 'findingFingerprint'),
    targetHead: requiredText(output.targetHead, 'targetHead', 64), disposition,
    reason: requiredText(output.reason, 'reason', REVIEW_HARD_LIMITS.explanationCharacters),
    evidence: Object.freeze(evidence), validationCommands: commands,
    ...(supersededBy === undefined ? {} : { supersededBy }),
    remediationDependencies: Object.freeze(dependencies) });
}

export function repositoryRevalidationResultDigest(value: RepositoryRevalidationResult): `sha256:${string}` {
  return sha256Text(canonicalJson(value));
}
