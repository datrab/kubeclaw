import type { ParsedEchoReviewOutput } from './echo-review-parser.ts';
import type { ReviewRuntimeAttestation } from './review-runtime-attestation.ts';

export interface ScalableReviewSource {
  readonly path: string;
  readonly content: string;
  readonly digest: string;
  readonly complete: boolean;
  readonly ranges: readonly { readonly startLine: number; readonly endLine: number }[];
}

export interface ScalableReviewJob {
  readonly schemaVersion: 'scalable-review-job.v1';
  readonly id: string;
  readonly kind: 'component' | 'boundary' | 'system-path' | 'system-lens';
  readonly source: readonly ScalableReviewSource[];
  readonly relationKeys: readonly string[];
  readonly relatedIds: readonly string[];
  readonly systemContext?: Readonly<Record<string, unknown>>;
  readonly requirements: readonly { readonly id: string; readonly text: string }[];
  readonly taskDigest: `sha256:${string}`;
  readonly digest: `sha256:${string}`;
}

export interface ScalableReviewJobResult {
  readonly jobId: string;
  readonly jobDigest: string;
  readonly parsed: ParsedEchoReviewOutput;
  readonly runtime: ReviewRuntimeAttestation;
}
