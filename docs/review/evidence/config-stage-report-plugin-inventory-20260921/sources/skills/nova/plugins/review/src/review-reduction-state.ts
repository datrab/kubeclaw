import type { WaitRequest } from '@kubeclaw/plugin-sdk';

import {
  CHANGE_RELATIONS,
  EVIDENCE_STRENGTHS,
  REVIEW_CATEGORIES,
  REVIEW_PRIORITIES,
  SCOPE_RELATIONS,
  type ChangeRelation,
  type EvidenceStrength,
  type ReviewCategory,
  type ReviewPriority,
  type ScopeRelation,
} from './echo-review-contract.ts';
import {
  isResolvedReviewPolicy,
  isVerifiedReviewPolicy,
  type ResolvedReviewPolicy,
} from './review-policy-resolver.ts';
import type { SemanticVerifierMode } from './review-policy-contract.ts';
import type { ReviewSemanticEncoding } from './review-semantics.ts';
import type { VerifiedRootCause } from './review-cluster-contract.ts';
import { isCertifiedVerifiedRootCause } from './review-verified-findings.ts';
import {
  isCertifiedReviewFindingGovernance,
  type ReviewFindingGovernance,
} from './review-finding-governance.ts';

export interface ReviewVerificationEvaluation {
  readonly protocol: 'kubeclaw.echo-review-verification.v1';
  readonly mode: SemanticVerifierMode;
  readonly attemptId: string;
  readonly eligibleCount: number;
  readonly confirmedCount: number;
  readonly rejectedCount: number;
  readonly insufficientCount: number;
}

export interface ReviewSimplificationEvaluation {
  readonly registryVersion: 'simplification-rules.v1';
  readonly enabledRuleCount: number;
  readonly minimumConfidence: 'high' | 'medium' | 'low';
  readonly candidateCount: number;
  readonly diagnosticCount: number;
}

export interface VerifiedReviewFinding {
  readonly fingerprint: string;
  readonly category: ReviewCategory;
  readonly priority: ReviewPriority;
  readonly message: string;
  readonly recommendedFix: string;
  readonly changeRelation: ChangeRelation;
  readonly scopeRelation: ScopeRelation;
  readonly evidenceStrength: Exclude<EvidenceStrength, 'insufficient'>;
  readonly repairable: boolean;
  readonly verified: true;
  readonly rootCause?: VerifiedRootCause;
}

export interface ReviewReductionInput {
  readonly resolvedPolicy: ResolvedReviewPolicy;
  readonly integrityIssues: readonly string[];
  readonly unverifiedRequirements: readonly string[];
  readonly limitViolations: readonly string[];
  readonly findings: readonly VerifiedReviewFinding[];
  readonly followUpProposalIds?: readonly string[];
  readonly orchestratorProposalIds?: readonly string[];
  readonly verification?: ReviewVerificationEvaluation;
  readonly simplification?: ReviewSimplificationEvaluation;
  readonly governance?: ReviewFindingGovernance;
  readonly orchestratorWait?: WaitRequest;
}

const VERIFIED_REDUCTION_STATES = new WeakSet<object>();
const REDUCTION_POLICY_MODES = new WeakMap<object, ReviewSemanticEncoding | undefined>();
export const REVIEW_ORCHESTRATOR_ISSUER_ID = 'orchestrator:kubeclaw.review' as const;
const OPAQUE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,191}$/u;
const REVIEW_WAIT_FIELDS = [
  'schemaVersion', 'waitId', 'kind', 'signalType', 'authorizedIssuer', 'expiresAt',
] as const;
const VERIFIED_FINDING_FIELDS = [
  'fingerprint', 'category', 'priority', 'message', 'recommendedFix',
  'changeRelation', 'scopeRelation', 'evidenceStrength', 'repairable', 'verified',
] as const;

const REDUCTION_INPUT_FIELDS = [
  'resolvedPolicy', 'integrityIssues', 'unverifiedRequirements',
  'limitViolations', 'findings', 'followUpProposalIds',
  'orchestratorProposalIds', 'verification', 'orchestratorWait',
  'simplification',
  'governance',
] as const;

function objectRecord(value: unknown): Readonly<Record<string, unknown>> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Readonly<Record<string, unknown>>
    : undefined;
}

function hasExactFields(value: Readonly<Record<string, unknown>>, expected: readonly string[]): boolean {
  const fields = Object.keys(value);
  return fields.length === expected.length && fields.every((field) => expected.includes(field));
}

function validReviewIssuer(value: unknown): boolean {
  const issuer = objectRecord(value);
  if (!issuer || !hasExactFields(issuer, ['type', 'id'])) return false;
  return issuer.type === 'orchestrator' && issuer.id === REVIEW_ORCHESTRATOR_ISSUER_ID;
}

export function validReviewWait(value: unknown): value is WaitRequest {
  const wait = objectRecord(value);
  if (!wait || !hasExactFields(wait, REVIEW_WAIT_FIELDS)) return false;
  return [
    wait.schemaVersion === 'wait-request.v2',
    wait.kind === 'orchestrator',
    typeof wait.waitId === 'string',
    typeof wait.waitId === 'string' && OPAQUE_ID.test(wait.waitId),
    wait.signalType === 'kubeclaw.review.resolve',
    validReviewIssuer(wait.authorizedIssuer),
    wait.expiresAt === null,
  ].every(Boolean);
}

function boundedText(value: unknown, maximum: number): boolean {
  return typeof value === 'string'
    && value.length > 0
    && value === value.trim()
    && Array.from(value).length <= maximum;
}

function validVerifiedFinding(value: unknown): value is VerifiedReviewFinding {
  const finding = objectRecord(value);
  if (!finding) return false;
  const fields = Object.keys(finding);
  if (!VERIFIED_FINDING_FIELDS.every((field) => Object.hasOwn(finding, field))) return false;
  if (!fields.every((field) => VERIFIED_FINDING_FIELDS.includes(field as never) || field === 'rootCause')) {
    return false;
  }
  return [
    typeof finding.fingerprint === 'string',
    typeof finding.fingerprint === 'string' && /^sha256:[0-9a-f]{64}$/u.test(finding.fingerprint),
    REVIEW_CATEGORIES.includes(finding.category as never),
    REVIEW_PRIORITIES.includes(finding.priority as never),
    boundedText(finding.message, 4096),
    boundedText(finding.recommendedFix, 4096),
    CHANGE_RELATIONS.includes(finding.changeRelation as never),
    SCOPE_RELATIONS.includes(finding.scopeRelation as never),
    EVIDENCE_STRENGTHS.filter((strength) => strength !== 'insufficient')
      .includes(finding.evidenceStrength as never),
    typeof finding.repairable === 'boolean',
    finding.verified === true,
    finding.rootCause === undefined || isCertifiedVerifiedRootCause(
      finding.rootCause, finding.category as ReviewCategory, String(finding.fingerprint),
    ),
  ].every(Boolean);
}

function denseArray(value: unknown): value is readonly unknown[] {
  if (!Array.isArray(value)) return false;
  return Array.from({ length: value.length }, (_, index) => Object.hasOwn(value, index)).every(Boolean);
}

function validTextList(value: unknown): value is readonly string[] {
  return denseArray(value) && value.every((entry) => boundedText(entry, 4096));
}

function validReductionInput(value: unknown): value is ReviewReductionInput {
  const input = objectRecord(value);
  if (!input) return false;
  const resolved = isResolvedReviewPolicy(input.resolvedPolicy) ? input.resolvedPolicy : undefined;
  const optional = [
    'followUpProposalIds', 'orchestratorProposalIds', 'verification', 'simplification',
    'governance', 'orchestratorWait',
  ];
  const required = REDUCTION_INPUT_FIELDS.filter((field) => !optional.includes(field));
  return [
    Object.keys(input).every((field) => REDUCTION_INPUT_FIELDS.includes(field as never)),
    required.every((field) => Object.hasOwn(input, field)),
    resolved !== undefined,
    validTextList(input.integrityIssues),
    validTextList(input.unverifiedRequirements),
    validTextList(input.limitViolations),
    denseArray(input.findings),
    denseArray(input.findings) && input.findings.every(validVerifiedFinding),
    input.followUpProposalIds === undefined || validTextList(input.followUpProposalIds),
    input.orchestratorProposalIds === undefined || validTextList(input.orchestratorProposalIds),
    input.verification === undefined || validVerificationEvaluation(input.verification),
    validOptionalSimplificationEvaluation(input.simplification, resolved),
    input.governance === undefined || Boolean(
      resolved && isCertifiedReviewFindingGovernance(input.governance, input.findings as never, resolved),
    ),
  ].every(Boolean);
}

function validOptionalSimplificationEvaluation(
  value: unknown,
  resolved: ResolvedReviewPolicy | undefined,
): boolean {
  if (value === undefined) return true;
  if (!resolved || !validSimplificationEvaluation(value)) return false;
  return value.registryVersion === resolved.policy.simplification.registryVersion
    && value.enabledRuleCount === resolved.policy.simplification.enabledRules.length
    && value.minimumConfidence === resolved.policy.simplification.minimumConfidence;
}

function validSimplificationEvaluation(value: unknown): value is ReviewSimplificationEvaluation {
  const item = objectRecord(value);
  if (!item || !hasExactFields(item, [
    'registryVersion', 'enabledRuleCount', 'minimumConfidence', 'candidateCount', 'diagnosticCount',
  ])) return false;
  const counts = [item.enabledRuleCount, item.candidateCount, item.diagnosticCount];
  return item.registryVersion === 'simplification-rules.v1'
    && ['high', 'medium', 'low'].includes(String(item.minimumConfidence))
    && counts.every((count) => Number.isInteger(count) && Number(count) >= 0);
}

function validVerificationEvaluation(value: unknown): value is ReviewVerificationEvaluation {
  const item = objectRecord(value);
  if (!item || !hasExactFields(item, [
    'protocol', 'mode', 'attemptId', 'eligibleCount', 'confirmedCount',
    'rejectedCount', 'insufficientCount',
  ])) return false;
  const counts = [item.eligibleCount, item.confirmedCount, item.rejectedCount, item.insufficientCount];
  return item.protocol === 'kubeclaw.echo-review-verification.v1'
    && ['disabled', 'p0-only', 'all-blockers'].includes(String(item.mode))
    && typeof item.attemptId === 'string' && OPAQUE_ID.test(item.attemptId)
    && counts.every((count) => Number.isInteger(count) && Number(count) >= 0)
    && Number(item.confirmedCount) + Number(item.rejectedCount) + Number(item.insufficientCount)
      === Number(item.eligibleCount);
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Readonly<Record<string, unknown>>)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

/** Called only by the trusted plugin verification boundary after verification. */
export function certifyReviewReductionInput(value: unknown, encoding?: ReviewSemanticEncoding): ReviewReductionInput {
  if (!validReductionInput(value)) throw new Error('review reduction input cannot be certified');
  if (!isVerifiedReviewPolicy(value.resolvedPolicy, encoding)) throw new Error('review reduction policy owner mode cannot be certified');
  // Governance is certified against the exact immutable finding set. Preserve that
  // reference; cloning it would sever the private proof before reduction.
  const findings = value.governance === undefined
    ? value.findings.map((finding) => ({
        ...finding,
        ...(finding.rootCause === undefined ? {} : { rootCause: finding.rootCause }),
      }))
    : value.findings;
  const certified = deepFreeze({
    ...value,
    integrityIssues: [...value.integrityIssues],
    unverifiedRequirements: [...value.unverifiedRequirements],
    limitViolations: [...value.limitViolations],
    findings,
    followUpProposalIds: [...(value.followUpProposalIds ?? [])],
    orchestratorProposalIds: [...(value.orchestratorProposalIds ?? [])],
    ...(value.verification === undefined ? {} : { verification: { ...value.verification } }),
    ...(value.simplification === undefined ? {} : { simplification: { ...value.simplification } }),
    ...(value.governance === undefined ? {} : { governance: value.governance }),
    ...(value.orchestratorWait === undefined ? {} : {
      orchestratorWait: structuredClone(value.orchestratorWait),
    }),
  });
  VERIFIED_REDUCTION_STATES.add(certified);
  REDUCTION_POLICY_MODES.set(certified, encoding);
  return certified;
}

export function isCertifiedReductionPolicy(value: ReviewReductionInput): boolean {
  return VERIFIED_REDUCTION_STATES.has(value) && REDUCTION_POLICY_MODES.has(value)
    && isVerifiedReviewPolicy(value.resolvedPolicy, REDUCTION_POLICY_MODES.get(value));
}

export function isCertifiedReviewReductionInput(value: unknown): value is ReviewReductionInput {
  return Boolean(
    value
    && typeof value === 'object'
    && VERIFIED_REDUCTION_STATES.has(value)
    && validReductionInput(value),
  );
}
