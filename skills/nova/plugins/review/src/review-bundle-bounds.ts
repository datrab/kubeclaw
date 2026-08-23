import { canonicalJson } from '@kubeclaw/plugin-sdk';

import type { ReviewBundle } from './review-bundle-contract.ts';
import { REVIEW_HARD_LIMITS } from './review-hard-limits.ts';

function assertUtf8Bytes(value: string, maximum: number, label: string): number {
  const bytes = Buffer.byteLength(value, 'utf8');
  if (bytes > maximum) throw new Error(`${label} exceeds ${maximum} UTF-8 bytes`);
  return bytes;
}

function boundedJsonObject(value: object, depth: number): boolean {
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  return Object.values(value as Readonly<Record<string, unknown>>)
    .every((entry) => boundedJson(entry, depth + 1));
}

function boundedJsonArray(value: readonly unknown[], depth: number): boolean {
  return value.length <= 10_000 && value.every((entry) => boundedJson(entry, depth + 1));
}

function boundedJson(value: unknown, depth = 0): boolean {
  if (depth > 32) return false;
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return boundedJsonArray(value, depth);
  return Boolean(value && typeof value === 'object' && boundedJsonObject(value, depth));
}

export function assertReviewEvidenceContent(value: string, label: string): number {
  const bytes = assertUtf8Bytes(value, REVIEW_HARD_LIMITS.evidenceContentBytes, label);
  let parsed: unknown;
  try { parsed = JSON.parse(value); } catch { throw new Error(`${label} must be valid JSON`); }
  if (!boundedJson(parsed)) throw new Error(`${label} must be bounded JSON`);
  if (canonicalJson(parsed) !== value) throw new Error(`${label} must be canonical JSON`);
  return bytes;
}

export function assertReviewContextContent(value: string, label: string): number {
  return assertUtf8Bytes(value, REVIEW_HARD_LIMITS.contextFileBytes, label);
}

export function assertReviewBundleInputResourceBounds(
  input: Readonly<Record<string, unknown>>,
): void {
  const evidence = Array.isArray(input.evidence) ? input.evidence : [];
  const context = Array.isArray(input.context) ? input.context : [];
  if (evidence.length > REVIEW_HARD_LIMITS.inspectedEvidence) {
    throw new Error(`evidence exceeds ${REVIEW_HARD_LIMITS.inspectedEvidence} items`);
  }
  if (context.length > REVIEW_HARD_LIMITS.contextFiles) {
    throw new Error(`context exceeds ${REVIEW_HARD_LIMITS.contextFiles} items`);
  }
  let bytes = 0;
  evidence.forEach((entry, index) => {
    const content = entry && typeof entry === 'object'
      ? (entry as Readonly<Record<string, unknown>>).content : undefined;
    if (typeof content === 'string') bytes += assertReviewEvidenceContent(content, `evidence[${index}].content`);
  });
  context.forEach((entry, index) => {
    const content = entry && typeof entry === 'object'
      ? (entry as Readonly<Record<string, unknown>>).content : undefined;
    if (typeof content === 'string') bytes += assertReviewContextContent(content, `context[${index}].content`);
  });
  if (bytes > REVIEW_HARD_LIMITS.bundleBytes) {
    throw new Error(`review bundle content exceeds ${REVIEW_HARD_LIMITS.bundleBytes} UTF-8 bytes`);
  }
}

export function assertReviewBundleResourceBounds(
  bundle: Pick<ReviewBundle, 'evidence' | 'context'>,
): void {
  bundle.evidence.forEach((item, index) => (
    assertReviewEvidenceContent(item.content, `evidence[${index}].content`)
  ));
  bundle.context.forEach((item, index) => (
    assertReviewContextContent(
      item.content,
      `context[${index}].content`,
    )
  ));
}

export function assertReviewBundleSerializedBounds(bundle: ReviewBundle): void {
  assertUtf8Bytes(
    canonicalJson(bundle),
    REVIEW_HARD_LIMITS.bundleBytes,
    'review bundle',
  );
}
