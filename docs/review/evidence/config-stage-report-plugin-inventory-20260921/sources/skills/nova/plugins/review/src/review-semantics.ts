import { canonicalJson, portableJson, PORTABLE_JSON_ENCODING } from '@kubeclaw/plugin-sdk';

export const REVIEW_SEMANTIC_ENCODING = 'review-semantics.utf16-v1' as const;
export type ReviewSemanticEncoding = typeof REVIEW_SEMANTIC_ENCODING;
export const PORTABLE_REVIEW_BUNDLE_VERSION = 'review-bundle.v2' as const;
export const PORTABLE_REVIEW_GOVERNOR_VERSION = 'review-governor.v2' as const;
export const PORTABLE_REVIEW_REPORT_VERSION = 'review-report.v3' as const;

export function assertReviewSemanticEncoding(value: unknown): asserts value is ReviewSemanticEncoding | undefined {
  if (value !== undefined && value !== REVIEW_SEMANTIC_ENCODING) throw new Error('REVIEW_SEMANTIC_ENCODING_INVALID');
}

/** Only the frozen Review stage config owns this choice; other codec markers do not. */
export function reviewSemanticEncoding(config: Readonly<Record<string, unknown>>): ReviewSemanticEncoding | undefined {
  portableJson(config);
  if (!Object.hasOwn(config, 'reviewSemanticEncoding')) return undefined;
  if (config.reviewSemanticEncoding !== REVIEW_SEMANTIC_ENCODING) throw new Error('REVIEW_SEMANTIC_ENCODING_INVALID');
  if (config.reportArtifactEncoding !== PORTABLE_JSON_ENCODING) throw new Error('REVIEW_SEMANTIC_REPORT_ENCODING_REQUIRED');
  return REVIEW_SEMANTIC_ENCODING;
}

export function reviewSemanticJson(value: unknown, encoding?: ReviewSemanticEncoding): string {
  assertReviewSemanticEncoding(encoding);
  return encoding === undefined ? canonicalJson(value) : portableJson(value);
}

export function reviewBundleVersion(encoding?: ReviewSemanticEncoding): 'review-bundle.v1' | typeof PORTABLE_REVIEW_BUNDLE_VERSION {
  assertReviewSemanticEncoding(encoding);
  return encoding === undefined ? 'review-bundle.v1' : PORTABLE_REVIEW_BUNDLE_VERSION;
}

export function reviewBundleJson(value: unknown): string {
  portableJson(value);
  const version = value && typeof value === 'object' ? (value as Record<string, unknown>).schemaVersion : undefined;
  if (version === 'review-bundle.v1') return canonicalJson(value);
  if (version === PORTABLE_REVIEW_BUNDLE_VERSION) return portableJson(value);
  throw new Error('REVIEW_BUNDLE_VERSION_INVALID');
}

/** Preserve the old exported partial-snapshot helper API, never infer new authority. */
export function assertReviewSemanticBundle(bundle: unknown, encoding?: ReviewSemanticEncoding): void {
  assertReviewSemanticEncoding(encoding);
  portableJson(bundle);
  if (!bundle || typeof bundle !== 'object' || Array.isArray(bundle)) throw new Error('REVIEW_BUNDLE_VERSION_INVALID');
  const hasVersion = Object.hasOwn(bundle, 'schemaVersion');
  if (!hasVersion && encoding === undefined) return;
  if ((bundle as Record<string, unknown>).schemaVersion !== reviewBundleVersion(encoding)) {
    throw new Error('REVIEW_BUNDLE_SEMANTIC_MODE_MISMATCH');
  }
}
