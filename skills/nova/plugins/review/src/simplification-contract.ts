import { SIMPLIFICATION_CATEGORIES, type SimplificationCategory } from './echo-review-contract.ts';
import { REVIEW_HARD_LIMITS } from './review-hard-limits.ts';
import { SIMPLIFICATION_RULE_REGISTRY } from './simplification-registry.ts';
import {
  SIMPLIFICATION_CONFIDENCE_LEVELS,
  SIMPLIFICATION_REGISTRY_VERSION,
  SIMPLIFICATION_RULE_IDS,
  type SimplificationConfidence,
  type SimplificationRuleId,
} from './review-policy-contract.ts';

export const SIMPLIFICATION_FACTS_SCHEMA_VERSION = 'simplification-facts.v1' as const;
export const SIMPLIFICATION_CANDIDATE_MANIFEST_SCHEMA_VERSION = 'simplification-candidate-manifest.v1' as const;
export const SIMPLIFICATION_FACTS_EVIDENCE_KIND = 'simplification-facts' as const;
export const SIMPLIFICATION_CANDIDATES_EVIDENCE_KIND = 'simplification-candidates' as const;
export const SIMPLIFICATION_DIAGNOSTIC_CODES = [
  'malformed_source', 'revision_mismatch', 'scope_mismatch', 'candidate_limit',
] as const;

export type SimplificationDiagnosticCode = typeof SIMPLIFICATION_DIAGNOSTIC_CODES[number];

export interface SimplificationRevisionIdentity {
  readonly base: string;
  readonly head: string;
  readonly changedManifestDigest: `sha256:${string}`;
}

export interface SimplificationFact {
  readonly factId: string;
  readonly ruleId: SimplificationRuleId;
  readonly confidence: SimplificationConfidence;
  readonly path: string;
  readonly symbol?: string;
  readonly basis: string;
  readonly smallestReplacement: string;
  readonly estimatedNetLocReduction?: number;
}

export interface SimplificationFacts {
  readonly schemaVersion: typeof SIMPLIFICATION_FACTS_SCHEMA_VERSION;
  readonly revision: SimplificationRevisionIdentity;
  readonly facts: readonly SimplificationFact[];
}

export interface SimplificationCandidate {
  readonly candidateId: `sha256:${string}`;
  readonly ruleId: SimplificationRuleId;
  readonly category: SimplificationCategory;
  readonly confidence: SimplificationConfidence;
  readonly path: string;
  readonly symbol?: string;
  readonly basis: string;
  readonly smallestReplacement: string;
  readonly source: {
    readonly kind: typeof SIMPLIFICATION_FACTS_EVIDENCE_KIND;
    readonly digest: `sha256:${string}`;
    readonly factId: string;
  };
  readonly estimatedNetLocReduction?: number;
}

export interface SimplificationSourceDiagnostic {
  readonly sourceDigest: `sha256:${string}`;
  readonly code: SimplificationDiagnosticCode;
  readonly message: string;
}

export interface SimplificationCandidateManifest {
  readonly schemaVersion: typeof SIMPLIFICATION_CANDIDATE_MANIFEST_SCHEMA_VERSION;
  readonly registryVersion: typeof SIMPLIFICATION_REGISTRY_VERSION;
  readonly revision: SimplificationRevisionIdentity;
  readonly candidates: readonly SimplificationCandidate[];
  readonly diagnostics: readonly SimplificationSourceDiagnostic[];
}

const text = (maximum: number) => ({ type: 'string', minLength: 1, maxLength: maximum } as const);
const identifier = { ...text(REVIEW_HARD_LIMITS.identifierCharacters), pattern: '^[A-Za-z0-9][A-Za-z0-9._:-]*$' } as const;
const digest = { type: 'string', pattern: '^sha256:[0-9a-f]{64}$' } as const;
const gitObject = { type: 'string', pattern: '^(?:[0-9a-f]{40}|[0-9a-f]{64})$' } as const;
const path = {
  type: 'string', minLength: 1, maxLength: REVIEW_HARD_LIMITS.pathCharacters,
  pattern: '^(?!/)(?!.*:)(?!.*\\\\)(?!.*//)(?!.*\/$)(?!.*[\\u0000-\\u001F\\u007F])(?!.*(?:^|/)\\.\\.?(?:/|$)).+$',
} as const;
const closed = (required: readonly string[], properties: Readonly<Record<string, unknown>>) => ({
  type: 'object', additionalProperties: false, required, properties,
} as const);
const optionalLoc = { type: 'integer', minimum: 0, maximum: REVIEW_HARD_LIMITS.estimatedNetLocReduction } as const;

const revisionSchema = closed(['base', 'head', 'changedManifestDigest'], {
  base: gitObject, head: gitObject, changedManifestDigest: digest,
});
const factSchema = closed([
  'factId', 'ruleId', 'confidence', 'path', 'basis', 'smallestReplacement',
], {
  factId: identifier, ruleId: { enum: SIMPLIFICATION_RULE_IDS }, confidence: { enum: SIMPLIFICATION_CONFIDENCE_LEVELS },
  path, symbol: identifier, basis: text(REVIEW_HARD_LIMITS.explanationCharacters),
  smallestReplacement: text(REVIEW_HARD_LIMITS.explanationCharacters),
  estimatedNetLocReduction: optionalLoc,
});

export const simplificationFactsSchema = closed(['schemaVersion', 'revision', 'facts'], {
  schemaVersion: { const: SIMPLIFICATION_FACTS_SCHEMA_VERSION }, revision: revisionSchema,
  facts: { type: 'array', maxItems: REVIEW_HARD_LIMITS.simplificationFacts, items: factSchema },
});

const candidateSchema = {
  ...closed([
  'candidateId', 'ruleId', 'category', 'confidence', 'path', 'basis', 'smallestReplacement', 'source',
], {
  candidateId: digest, ruleId: { enum: SIMPLIFICATION_RULE_IDS }, category: { enum: SIMPLIFICATION_CATEGORIES },
  confidence: { enum: SIMPLIFICATION_CONFIDENCE_LEVELS }, path, symbol: identifier,
  basis: text(REVIEW_HARD_LIMITS.explanationCharacters),
  smallestReplacement: text(REVIEW_HARD_LIMITS.explanationCharacters),
  source: closed(['kind', 'digest', 'factId'], {
    kind: { const: SIMPLIFICATION_FACTS_EVIDENCE_KIND }, digest, factId: identifier,
  }),
  estimatedNetLocReduction: optionalLoc,
  }),
  allOf: Object.values(SIMPLIFICATION_RULE_REGISTRY).map(({ id, category }) => ({
    if: { properties: { ruleId: { const: id } }, required: ['ruleId'] },
    then: { properties: { category: { const: category } }, required: ['category'] },
  })),
} as const;

export const simplificationCandidateManifestSchema = closed([
  'schemaVersion', 'registryVersion', 'revision', 'candidates', 'diagnostics',
], {
  schemaVersion: { const: SIMPLIFICATION_CANDIDATE_MANIFEST_SCHEMA_VERSION },
  registryVersion: { const: SIMPLIFICATION_REGISTRY_VERSION },
  revision: revisionSchema,
  candidates: { type: 'array', maxItems: REVIEW_HARD_LIMITS.simplificationCandidates, items: candidateSchema },
  diagnostics: {
    type: 'array', maxItems: REVIEW_HARD_LIMITS.simplificationDiagnostics,
    items: closed(['sourceDigest', 'code', 'message'], {
      sourceDigest: digest, code: { enum: SIMPLIFICATION_DIAGNOSTIC_CODES },
      message: text(REVIEW_HARD_LIMITS.explanationCharacters),
    }),
  },
});
