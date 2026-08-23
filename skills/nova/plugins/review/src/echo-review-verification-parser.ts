import {
  ECHO_REVIEW_VERIFICATION_SCHEMA_VERSION,
  VERIFICATION_VERDICTS,
  type EchoReviewVerificationOutput,
  type EchoReviewVerificationResult,
} from './echo-review-verification-contract.ts';
import type { EvidenceRef } from './echo-review-contract.ts';
import { REVIEW_HARD_LIMITS } from './review-hard-limits.ts';

export type ParsedEchoReviewVerificationOutput =
  | { readonly ok: true; readonly value: EchoReviewVerificationOutput }
  | { readonly ok: false; readonly error: string };

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Readonly<Record<string, unknown>>)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function record(value: unknown, label: string): Readonly<Record<string, unknown>> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value as Readonly<Record<string, unknown>>;
}

function closed(value: Readonly<Record<string, unknown>>, fields: readonly string[], label: string): void {
  const unknown = Object.keys(value).filter((key) => !fields.includes(key));
  if (unknown.length > 0) throw new Error(`${label} has unknown field(s): ${unknown.sort().join(', ')}`);
}

function text(value: unknown, label: string, maximum: number): string {
  if (
    typeof value !== 'string'
    || !value.trim()
    || value !== value.trim()
    || Array.from(value).length > maximum
  ) throw new Error(`${label} must be non-empty, unpadded text of at most ${maximum} characters`);
  return value;
}

function digest(value: unknown, label: string): `sha256:${string}` {
  const parsed = text(value, label, REVIEW_HARD_LIMITS.digestCharacters);
  if (!/^sha256:[0-9a-f]{64}(?![\s\S])/u.test(parsed)) throw new Error(`${label} must be a SHA-256 digest`);
  return parsed as `sha256:${string}`;
}

function evidence(value: unknown, label: string): EvidenceRef {
  const item = record(value, label);
  closed(item, ['kind', 'digest'], label);
  const kind = text(item.kind, `${label}.kind`, REVIEW_HARD_LIMITS.identifierCharacters);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]*(?![\s\S])/u.test(kind)) throw new Error(`${label}.kind must be a stable identifier`);
  return { kind, digest: digest(item.digest, `${label}.digest`) };
}

function evidenceList(value: unknown, label: string): readonly EvidenceRef[] {
  if (!Array.isArray(value) || value.length > REVIEW_HARD_LIMITS.evidencePerRecord) {
    throw new Error(`${label} must contain 0-${REVIEW_HARD_LIMITS.evidencePerRecord} items`);
  }
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.hasOwn(value, index)) throw new Error(`${label} must not contain sparse entries`);
  }
  const parsed = value.map((entry, index) => evidence(entry, `${label}[${index}]`));
  const keys = parsed.map((entry) => `${entry.kind}\0${entry.digest}`);
  if (new Set(keys).size !== keys.length) throw new Error(`${label} contains duplicate evidence`);
  return parsed;
}

function result(value: unknown, label: string): EchoReviewVerificationResult {
  const item = record(value, label);
  closed(item, ['verdict', 'reason', 'evidence'], label);
  if (typeof item.verdict !== 'string' || !VERIFICATION_VERDICTS.includes(item.verdict as never)) {
    throw new Error(`${label}.verdict is invalid`);
  }
  const references = evidenceList(item.evidence, `${label}.evidence`);
  if (item.verdict !== 'insufficient_evidence' && references.length === 0) {
    throw new Error(`${label}.evidence is required for ${item.verdict}`);
  }
  return {
    verdict: item.verdict as EchoReviewVerificationResult['verdict'],
    reason: text(item.reason, `${label}.reason`, REVIEW_HARD_LIMITS.explanationCharacters),
    evidence: references,
  };
}

function parse(value: unknown): EchoReviewVerificationOutput {
  const output = record(value, 'Echo verification output');
  closed(output, ['schemaVersion', 'bundleDigest', 'policyDigest', 'proposalSetDigest', 'results'], 'Echo verification output');
  if (output.schemaVersion !== ECHO_REVIEW_VERIFICATION_SCHEMA_VERSION) {
    throw new Error('Echo verification schemaVersion is invalid');
  }
  const entries = Object.entries(record(output.results, 'results'));
  if (entries.length < 1 || entries.length > REVIEW_HARD_LIMITS.verificationResults) {
    throw new Error(`results must contain 1-${REVIEW_HARD_LIMITS.verificationResults} properties`);
  }
  const results = Object.fromEntries(entries.map(([key, value]) => [
    digest(key, `results key ${JSON.stringify(key)}`), result(value, `results.${key}`),
  ] as const).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0));
  return deepFreeze({
    schemaVersion: ECHO_REVIEW_VERIFICATION_SCHEMA_VERSION,
    bundleDigest: digest(output.bundleDigest, 'bundleDigest'),
    policyDigest: digest(output.policyDigest, 'policyDigest'),
    proposalSetDigest: digest(output.proposalSetDigest, 'proposalSetDigest'),
    results,
  });
}

export function parseEchoReviewVerificationOutput(value: unknown): ParsedEchoReviewVerificationOutput {
  try { return { ok: true, value: parse(value) }; } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export function parseEchoReviewVerificationDispatchResponse(
  response: unknown,
): ParsedEchoReviewVerificationOutput {
  if (!response || typeof response !== 'object' || Array.isArray(response)) {
    return { ok: false, error: 'runtime dispatch response must be an object' };
  }
  const envelope = response as Readonly<Record<string, unknown>>;
  if (!Object.hasOwn(envelope, 'result')) return { ok: false, error: 'runtime dispatch response is missing result' };
  return parseEchoReviewVerificationOutput(envelope.result);
}
