import {portableJson, PORTABLE_JSON_ENCODING} from '@kubeclaw/plugin-sdk';

export type ReportArtifactEncoding = typeof PORTABLE_JSON_ENCODING;

/** A report-only immutable stage-config selector; absence alone is historical. */
export function reportArtifactEncoding(config: Readonly<Record<string, unknown>>): ReportArtifactEncoding | undefined {
  portableJson(config);
  if (!Object.hasOwn(config, 'reportArtifactEncoding')) return undefined;
  if (config.reportArtifactEncoding !== PORTABLE_JSON_ENCODING) throw new Error('REVIEW_REPORT_ENCODING_INVALID');
  return PORTABLE_JSON_ENCODING;
}

export function assertReportArtifactEncoding(value: unknown): asserts value is ReportArtifactEncoding | undefined {
  if (value !== undefined && value !== PORTABLE_JSON_ENCODING) throw new Error('REVIEW_REPORT_ENCODING_INVALID');
}
