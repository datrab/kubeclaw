import { portableJson, PORTABLE_JSON_ENCODING } from '@kubeclaw/plugin-sdk';

/** Project's explicit new-compilation choice; parity-tested against Review's owner. */
export const PROJECT_REVIEW_SEMANTIC_ENCODING = 'review-semantics.utf16-v1' as const;
export type ProjectReviewSemanticMode = 'legacy' | typeof PROJECT_REVIEW_SEMANTIC_ENCODING;

export function assertProjectReviewModes(report: 'legacy' | typeof PORTABLE_JSON_ENCODING,
  semantic: ProjectReviewSemanticMode): void {
  if (report !== 'legacy' && report !== PORTABLE_JSON_ENCODING) throw new Error('PROJECT_REPORT_ENCODING_INVALID');
  if (semantic !== 'legacy' && semantic !== PROJECT_REVIEW_SEMANTIC_ENCODING) throw new Error('PROJECT_REVIEW_SEMANTIC_ENCODING_INVALID');
  if (semantic !== 'legacy' && report !== PORTABLE_JSON_ENCODING) throw new Error('PROJECT_REVIEW_SEMANTIC_REPORT_ENCODING_REQUIRED');
}

export function projectReviewConfig(config: Readonly<Record<string, unknown>>,
  report: 'legacy' | typeof PORTABLE_JSON_ENCODING, semantic: ProjectReviewSemanticMode): Readonly<Record<string, unknown>> {
  assertProjectReviewModes(report, semantic);
  portableJson(config);
  if (report === 'legacy' && semantic === 'legacy') return config;
  return { ...config, ...(report === 'legacy' ? {} : { reportArtifactEncoding: report }),
    ...(semantic === 'legacy' ? {} : { reviewSemanticEncoding: semantic }) };
}
