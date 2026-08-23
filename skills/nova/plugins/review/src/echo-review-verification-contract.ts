import type { ReviewBundle } from './review-bundle-contract.ts';
import type { EvidenceRef, ProposedFinding } from './echo-review-contract.ts';
import { REVIEW_HARD_LIMITS } from './review-hard-limits.ts';

export const ECHO_REVIEW_VERIFICATION_SCHEMA_VERSION = 'echo-review-verification.v1' as const;
export const ECHO_REVIEW_VERIFICATION_PROTOCOL = 'kubeclaw.echo-review-verification.v1' as const;
export const VERIFICATION_VERDICTS = ['confirmed', 'rejected', 'insufficient_evidence'] as const;
export type VerificationVerdict = typeof VERIFICATION_VERDICTS[number];

export interface EchoReviewVerificationResult {
  readonly verdict: VerificationVerdict;
  readonly reason: string;
  readonly evidence: readonly EvidenceRef[];
}

export interface EchoReviewVerificationOutput {
  readonly schemaVersion: typeof ECHO_REVIEW_VERIFICATION_SCHEMA_VERSION;
  readonly bundleDigest: `sha256:${string}`;
  readonly policyDigest: `sha256:${string}`;
  readonly proposalSetDigest: `sha256:${string}`;
  readonly results: Readonly<Record<string, EchoReviewVerificationResult>>;
}

export interface EchoReviewVerificationRequest {
  readonly [key: string]: unknown;
  readonly protocol: typeof ECHO_REVIEW_VERIFICATION_PROTOCOL;
  readonly agent: string;
  readonly role: 'semantic-verifier';
  readonly identity: {
    readonly runId: string;
    readonly stageId: string;
    readonly attemptId: string;
    readonly attemptNumber: number;
  };
  readonly task: string;
  readonly verification: {
    readonly bundle: ReviewBundle;
    readonly bundleDigest: `sha256:${string}`;
    readonly policyDigest: `sha256:${string}`;
    readonly proposalSetDigest: `sha256:${string}`;
    readonly proposals: Readonly<Record<string, ProposedFinding>>;
  };
  readonly outputContract: Readonly<Record<string, unknown>>;
}

const boundedText = (maximum: number) => ({
  type: 'string', minLength: 1, maxLength: maximum,
  pattern: '^\\S(?:[\\s\\S]*\\S)?(?![\\s\\S])',
} as const);
const digest = {
  type: 'string', maxLength: REVIEW_HARD_LIMITS.digestCharacters,
  pattern: '^sha256:[0-9a-f]{64}(?![\\s\\S])',
} as const;
const identifier = {
  type: 'string', minLength: 1, maxLength: REVIEW_HARD_LIMITS.identifierCharacters,
  pattern: '^[A-Za-z0-9][A-Za-z0-9._:-]*(?![\\s\\S])',
} as const;
const evidenceRef = {
  type: 'object', additionalProperties: false,
  required: ['kind', 'digest'],
  properties: { kind: identifier, digest },
} as const;
const result = {
  type: 'object', additionalProperties: false,
  required: ['verdict', 'reason', 'evidence'],
  properties: {
    verdict: { enum: VERIFICATION_VERDICTS },
    reason: boundedText(REVIEW_HARD_LIMITS.explanationCharacters),
    evidence: {
      type: 'array', maxItems: REVIEW_HARD_LIMITS.evidencePerRecord,
      uniqueItems: true, items: evidenceRef,
    },
  },
  allOf: [{
    if: { properties: { verdict: { enum: ['confirmed', 'rejected'] } }, required: ['verdict'] },
    then: { properties: { evidence: { minItems: 1 } } },
  }],
} as const;

export const echoReviewVerificationOutputSchema = {
  type: 'object', additionalProperties: false,
  required: ['schemaVersion', 'bundleDigest', 'policyDigest', 'proposalSetDigest', 'results'],
  properties: {
    schemaVersion: { const: ECHO_REVIEW_VERIFICATION_SCHEMA_VERSION },
    bundleDigest: digest,
    policyDigest: digest,
    proposalSetDigest: digest,
    results: {
      type: 'object', minProperties: 1,
      maxProperties: REVIEW_HARD_LIMITS.verificationResults,
      propertyNames: digest,
      additionalProperties: result,
    },
  },
} as const;
