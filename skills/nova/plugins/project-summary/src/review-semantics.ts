import { canonicalJson, portableJson, sha256Text } from '@kubeclaw/plugin-sdk';

/** Bounded cross-consumer mapping; no private Review package import. */
export const SUMMARY_REVIEW_SEMANTIC_ENCODING = 'review-semantics.utf16-v1' as const;
export type SummaryReviewSemanticEncoding = typeof SUMMARY_REVIEW_SEMANTIC_ENCODING;

export function summaryReviewSemanticEncoding(final: Readonly<Record<string, unknown>>): SummaryReviewSemanticEncoding | undefined {
  portableJson(final);
  if (!Object.hasOwn(final, 'reviewSemanticEncoding')) return undefined;
  if (final.reviewSemanticEncoding !== SUMMARY_REVIEW_SEMANTIC_ENCODING || typeof final.reviewStageId !== 'string') {
    throw new Error('DELIVERY_REVIEW_SEMANTIC_MODE_INVALID');
  }
  return SUMMARY_REVIEW_SEMANTIC_ENCODING;
}

function record(value: unknown): Readonly<Record<string, unknown>> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('DELIVERY_REVIEW_SEMANTIC_PAIR_INVALID');
  return value as Readonly<Record<string, unknown>>;
}

function validateGovernor(report: Readonly<Record<string, unknown>>, governor: Readonly<Record<string, unknown>>,
  serialize: typeof portableJson): void {
  const baseline = record(governor.baseline), current = record(governor.current), revision = record(report.revision);
  if (governor.baselineId !== sha256Text(serialize({ schemaVersion: governor.schemaVersion, baseline }))
    || baseline.base !== revision.base || baseline.policyDigest !== report.policyDigest
    || current.head !== revision.head || current.changedManifestDigest !== revision.changedManifestDigest) {
    throw new Error('DELIVERY_REVIEW_GOVERNOR_IDENTITY_INVALID');
  }
}

export function summaryReviewBundleDigest(reportValue: unknown, bundleValue: unknown,
  expected?: SummaryReviewSemanticEncoding): `sha256:${string}` {
  if (expected !== undefined && expected !== SUMMARY_REVIEW_SEMANTIC_ENCODING) throw new Error('DELIVERY_REVIEW_SEMANTIC_MODE_INVALID');
  portableJson(reportValue); portableJson(bundleValue);
  const report = record(reportValue), bundle = record(bundleValue);
  // The original Summary API accepted this exact unversioned pair. It is not
  // an assertion that Review's actual producer emitted unversioned reports.
  if (expected === undefined && !Object.hasOwn(report, 'schemaVersion') && !Object.hasOwn(bundle, 'schemaVersion')) {
    return sha256Text(canonicalJson(bundle));
  }
  const portable = expected !== undefined;
  const governor = record(report.governor);
  if (bundle.schemaVersion !== (portable ? 'review-bundle.v2' : 'review-bundle.v1')
    || report.schemaVersion !== (portable ? 'review-report.v3' : 'review-report.v2')
    || governor.schemaVersion !== (portable ? 'review-governor.v2' : 'review-governor.v1')) {
    throw new Error('DELIVERY_REVIEW_SEMANTIC_PAIR_INVALID');
  }
  const serialize = portable ? portableJson : canonicalJson;
  validateGovernor(report, governor, serialize);
  return sha256Text(serialize(bundle));
}
