import { REVIEW_HARD_LIMITS } from './review-hard-limits.ts';

export const ECHO_REVIEW_SCHEMA_VERSION = 'echo-review-output.v1' as const;

export const REQUIREMENT_ASSESSMENTS = [
  'satisfied',
  'violated',
  'unverified',
] as const;

export const REVIEW_CATEGORIES = [
  'correctness',
  'security',
  'contract',
  'architecture',
  'simplification',
] as const;

export const REVIEW_PRIORITIES = ['P0', 'P1', 'P2', 'P3'] as const;
export const CHANGE_RELATIONS = [
  'introduced',
  'exposed',
  'pre_existing',
  'unknown',
] as const;
export const SCOPE_RELATIONS = ['inside', 'outside', 'unknown'] as const;
export const EVIDENCE_STRENGTHS = ['direct', 'inferred', 'insufficient'] as const;
export const SIMPLIFICATION_CATEGORIES = [
  'delete',
  'stdlib',
  'native',
  'yagni',
  'shrink',
] as const;

export const EVIDENCE_REF_FIELDS = ['kind', 'digest'] as const;
export const REQUIREMENT_FIELDS = [
  'assessment',
  'explanation',
  'evidence',
] as const;
export const LOCATION_FIELDS = ['path', 'symbol', 'lineHint'] as const;
export const SIMPLIFICATION_FIELDS = [
  'category',
  'candidateIds',
  'smallestReplacement',
  'estimatedNetLocReduction',
] as const;
export const PROPOSED_FINDING_FIELDS = [
  'category',
  'priority',
  'claim',
  'impact',
  'locations',
  'evidence',
  'recommendedFix',
  'changeRelation',
  'scopeRelation',
  'evidenceStrength',
  'rootCauseHint',
  'simplification',
] as const;
export const CONTEXT_REQUEST_FIELDS = ['paths', 'requirementIds', 'reason'] as const;
export const ECHO_REVIEW_OUTPUT_FIELDS = [
  'schemaVersion',
  'summary',
  'inspectedEvidence',
  'requirementAssessments',
  'proposedFindings',
  'contextRequest',
] as const;

export type RequirementAssessment = typeof REQUIREMENT_ASSESSMENTS[number];
export type ReviewCategory = typeof REVIEW_CATEGORIES[number];
export type ReviewPriority = typeof REVIEW_PRIORITIES[number];
export type ChangeRelation = typeof CHANGE_RELATIONS[number];
export type ScopeRelation = typeof SCOPE_RELATIONS[number];
export type EvidenceStrength = typeof EVIDENCE_STRENGTHS[number];
export type SimplificationCategory = typeof SIMPLIFICATION_CATEGORIES[number];

export interface EvidenceRef {
  readonly kind: string;
  readonly digest: string;
}

export interface RequirementResult {
  readonly assessment: RequirementAssessment;
  readonly explanation: string;
  readonly evidence: readonly EvidenceRef[];
}

export interface SourceLocation {
  readonly path: string;
  readonly symbol?: string;
  readonly lineHint?: number;
}

export interface SimplificationProposal {
  readonly category: SimplificationCategory;
  readonly candidateIds: readonly `sha256:${string}`[];
  readonly smallestReplacement: string;
  readonly estimatedNetLocReduction?: number;
}

export interface ProposedFinding {
  readonly category: ReviewCategory;
  readonly priority: ReviewPriority;
  readonly claim: string;
  readonly impact: string;
  readonly locations: readonly SourceLocation[];
  readonly evidence: readonly EvidenceRef[];
  readonly recommendedFix: string;
  readonly changeRelation: ChangeRelation;
  readonly scopeRelation: ScopeRelation;
  readonly evidenceStrength: EvidenceStrength;
  readonly rootCauseHint?: string;
  readonly simplification?: SimplificationProposal;
}

export interface EchoContextRequest {
  readonly paths: readonly string[];
  readonly requirementIds: readonly string[];
  readonly reason: string;
}

export interface EchoReviewOutput {
  readonly schemaVersion: typeof ECHO_REVIEW_SCHEMA_VERSION;
  readonly summary: string;
  readonly inspectedEvidence: readonly EvidenceRef[];
  readonly requirementAssessments: Readonly<Record<string, RequirementResult>>;
  readonly proposedFindings: readonly ProposedFinding[];
  readonly contextRequest?: EchoContextRequest;
}

const boundedTextSchema = (maxLength: number) => ({
  type: 'string', minLength: 1, maxLength,
  pattern: '^\\S(?:[\\s\\S]*\\S)?(?![\\s\\S])',
} as const);
const identifierSchema = {
  type: 'string', minLength: 1, maxLength: REVIEW_HARD_LIMITS.identifierCharacters,
  pattern: '^[A-Za-z0-9][A-Za-z0-9._:-]*(?![\\s\\S])',
} as const;
const evidenceRefSchema = {
  type: 'object', additionalProperties: false,
  required: ['kind', 'digest'],
  properties: {
    kind: identifierSchema,
    digest: {
      type: 'string', maxLength: REVIEW_HARD_LIMITS.digestCharacters,
      pattern: '^sha256:[0-9a-f]{64}(?![\\s\\S])',
    },
  },
} as const;
const evidenceArraySchema = {
  type: 'array', maxItems: REVIEW_HARD_LIMITS.evidencePerRecord, uniqueItems: true,
  items: evidenceRefSchema,
} as const;
const locationSchema = {
  type: 'object', additionalProperties: false,
  required: ['path'],
  properties: {
    path: {
      allOf: [
        boundedTextSchema(REVIEW_HARD_LIMITS.pathCharacters),
        { pattern: '^(?!/)(?!.*:)(?!.*\\\\)(?!.*//)(?!.*\/$)(?!.*[\\u0000-\\u001F\\u007F])(?!.*(?:^|/)\\.\\.?(?:/|$)).+$' },
      ],
    },
    symbol: boundedTextSchema(REVIEW_HARD_LIMITS.symbolCharacters),
    lineHint: { type: 'integer', minimum: 1 },
  },
} as const;
const simplificationSchema = {
  type: 'object', additionalProperties: false,
  required: ['category', 'candidateIds', 'smallestReplacement'],
  properties: {
    category: { enum: SIMPLIFICATION_CATEGORIES },
    candidateIds: {
      type: 'array', minItems: 1, maxItems: REVIEW_HARD_LIMITS.simplificationCandidateIds,
      uniqueItems: true,
      items: {
        type: 'string', maxLength: REVIEW_HARD_LIMITS.digestCharacters,
        pattern: '^sha256:[0-9a-f]{64}(?![\\s\\S])',
      },
    },
    smallestReplacement: boundedTextSchema(REVIEW_HARD_LIMITS.explanationCharacters),
    estimatedNetLocReduction: {
      type: 'integer', minimum: 0, maximum: REVIEW_HARD_LIMITS.estimatedNetLocReduction,
    },
  },
} as const;
const contextRequestSchema = {
  type: 'object', additionalProperties: false,
  required: CONTEXT_REQUEST_FIELDS,
  properties: {
    paths: {
      type: 'array', minItems: 1, maxItems: REVIEW_HARD_LIMITS.contextExpansionPaths,
      uniqueItems: true, items: locationSchema.properties.path,
    },
    requirementIds: {
      type: 'array', minItems: 1, maxItems: REVIEW_HARD_LIMITS.requirementAssessments,
      uniqueItems: true, items: identifierSchema,
    },
    reason: boundedTextSchema(REVIEW_HARD_LIMITS.explanationCharacters),
  },
} as const;

export const echoReviewOutputSchema = {
  type: 'object',
  additionalProperties: false,
  required: ECHO_REVIEW_OUTPUT_FIELDS.filter((field) => field !== 'contextRequest'),
  properties: {
    schemaVersion: { const: ECHO_REVIEW_SCHEMA_VERSION },
    summary: boundedTextSchema(REVIEW_HARD_LIMITS.summaryCharacters),
    inspectedEvidence: {
      type: 'array', minItems: 1, maxItems: REVIEW_HARD_LIMITS.inspectedEvidence,
      uniqueItems: true,
      items: evidenceRefSchema,
    },
    requirementAssessments: {
      type: 'object', minProperties: 1,
      maxProperties: REVIEW_HARD_LIMITS.requirementAssessments,
      propertyNames: identifierSchema,
      additionalProperties: {
        type: 'object', additionalProperties: false,
        required: REQUIREMENT_FIELDS,
        properties: {
          assessment: { enum: REQUIREMENT_ASSESSMENTS },
          explanation: boundedTextSchema(REVIEW_HARD_LIMITS.explanationCharacters),
          evidence: evidenceArraySchema,
        },
        allOf: [{
          if: {
            required: ['assessment'],
            properties: { assessment: { enum: ['satisfied', 'violated'] } },
          },
          then: { properties: { evidence: { minItems: 1 } } },
        }],
      },
    },
    proposedFindings: {
      type: 'array', maxItems: REVIEW_HARD_LIMITS.proposedFindings,
      items: {
        type: 'object', additionalProperties: false,
        required: PROPOSED_FINDING_FIELDS.filter((field) => !['rootCauseHint', 'simplification'].includes(field)),
        properties: {
          category: { enum: REVIEW_CATEGORIES },
          priority: { enum: REVIEW_PRIORITIES },
          claim: boundedTextSchema(REVIEW_HARD_LIMITS.explanationCharacters),
          impact: boundedTextSchema(REVIEW_HARD_LIMITS.explanationCharacters),
          locations: {
            type: 'array', minItems: 1, maxItems: REVIEW_HARD_LIMITS.findingLocations,
            items: locationSchema,
          },
          evidence: { ...evidenceArraySchema, minItems: 1 },
          recommendedFix: boundedTextSchema(REVIEW_HARD_LIMITS.explanationCharacters),
          changeRelation: { enum: CHANGE_RELATIONS },
          scopeRelation: { enum: SCOPE_RELATIONS },
          evidenceStrength: { enum: EVIDENCE_STRENGTHS },
          rootCauseHint: boundedTextSchema(REVIEW_HARD_LIMITS.rootCauseHintCharacters),
          simplification: simplificationSchema,
        },
        allOf: [{
          if: { required: ['simplification'] },
          then: { properties: { category: { const: 'simplification' } } },
        }],
      },
    },
    contextRequest: contextRequestSchema,
  },
  allOf: [{
    if: { required: ['contextRequest'] },
    then: { properties: { proposedFindings: { maxItems: 0 } } },
  }],
} as const;
