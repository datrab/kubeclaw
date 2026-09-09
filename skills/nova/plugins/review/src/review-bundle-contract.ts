import { REVIEW_HARD_LIMITS } from './review-hard-limits.ts';
import { PORTABLE_JSON_ENCODING } from '@kubeclaw/plugin-sdk';

export const REVIEW_BUNDLE_SCHEMA_VERSION = 'review-bundle.v1' as const;
export const REVIEW_CONTEXT_SELECTION_VERSION = 'focused-context.v1' as const;
export const REVIEW_CHANGE_STATUSES = [
  'added', 'modified', 'deleted', 'renamed', 'copied', 'type_changed',
] as const;
export const REVIEW_CONTEXT_REASON_KINDS = [
  'changed', 'direct_import', 'direct_caller', 'dependency', 'public_export',
  'contract', 'schema', 'configuration', 'test', 'ownership', 'context_expansion',
] as const;

export type ReviewChangeStatus = typeof REVIEW_CHANGE_STATUSES[number];
export type ReviewContextReasonKind = typeof REVIEW_CONTEXT_REASON_KINDS[number];

export interface ReviewBundleTask { readonly id: string; readonly statement: string }
export interface ReviewBundleRevisions {
  readonly base: string;
  readonly head: string;
  readonly changedManifestDigest: `sha256:${string}`;
}
export interface ReviewChangedPath {
  readonly path: string;
  readonly status: ReviewChangeStatus;
  readonly previousPath?: string;
}
export interface ReviewBundleScope {
  readonly changedPaths: readonly ReviewChangedPath[];
  readonly allowedPrefixes: readonly string[];
}
export interface ReviewBundleRequirement { readonly id: string; readonly statement: string }
export interface ReviewBundleEvidence {
  readonly encoding?: typeof PORTABLE_JSON_ENCODING;
  readonly kind: string;
  readonly digest: `sha256:${string}`;
  readonly content: string;
}
export interface ReviewContextReason {
  readonly kind: ReviewContextReasonKind;
  readonly sourcePath?: string;
}
export interface ReviewBundleContextItem {
  readonly path: string;
  readonly digest: `sha256:${string}`;
  readonly content: string;
  readonly reasons: readonly ReviewContextReason[];
}
export interface ReviewBundleSelection {
  readonly version: typeof REVIEW_CONTEXT_SELECTION_VERSION;
  readonly candidateManifestDigest: `sha256:${string}`;
  readonly expansionRound: 0 | 1;
}
export interface ReviewBundle {
  readonly schemaVersion: typeof REVIEW_BUNDLE_SCHEMA_VERSION;
  readonly task: ReviewBundleTask;
  readonly revisions: ReviewBundleRevisions;
  readonly scope: ReviewBundleScope;
  readonly requirements: readonly ReviewBundleRequirement[];
  readonly evidence: readonly ReviewBundleEvidence[];
  readonly context: readonly ReviewBundleContextItem[];
  readonly selection: ReviewBundleSelection;
  readonly policyDigest: `sha256:${string}`;
}

const boundedText = (maximum: number) => ({
  type: 'string', minLength: 1, maxLength: maximum,
  pattern: '^\\S(?:[\\s\\S]*\\S)?(?![\\s\\S])',
} as const);
const identifier = {
  ...boundedText(REVIEW_HARD_LIMITS.identifierCharacters),
  pattern: '^[A-Za-z0-9][A-Za-z0-9._:-]*(?![\\s\\S])',
} as const;
const digest = {
  type: 'string', pattern: '^sha256:[0-9a-f]{64}(?![\\s\\S])',
  maxLength: REVIEW_HARD_LIMITS.digestCharacters,
} as const;
const gitObjectId = {
  type: 'string', pattern: '^(?:[0-9a-f]{40}|[0-9a-f]{64})(?![\\s\\S])',
} as const;
const repositoryPath = {
  type: 'string',
  allOf: [
    boundedText(REVIEW_HARD_LIMITS.pathCharacters),
    { pattern: '^(?!/)(?!.*:)(?!.*\\\\)(?!.*//)(?!.*\/$)(?!.*[\\u0000-\\u001F\\u007F])(?!.*(?:^|/)\\.\\.?(?:/|$)).+$' },
  ],
} as const;
const scopePrefix = { anyOf: [{ const: '.' }, repositoryPath] } as const;
const closed = <T extends Readonly<Record<string, unknown>>>(
  required: readonly (keyof T & string)[], properties: T,
) => ({ type: 'object', additionalProperties: false, required, properties } as const);

const evidenceSchema = closed(['kind', 'digest', 'content'], {
  kind: identifier, digest,
  encoding: { const: PORTABLE_JSON_ENCODING },
  content: { type: 'string', maxLength: REVIEW_HARD_LIMITS.evidenceContentBytes },
});
const requirementSchema = closed(['id', 'statement'], {
  id: identifier, statement: boundedText(REVIEW_HARD_LIMITS.explanationCharacters),
});
const changedPathProperties = {
  path: repositoryPath, status: { enum: REVIEW_CHANGE_STATUSES }, previousPath: repositoryPath,
} as const;
const changedPathSchema = {
  ...closed(['path', 'status'], changedPathProperties),
  allOf: [{
    if: { properties: { status: { enum: ['renamed', 'copied'] } }, required: ['status'] },
    then: { properties: changedPathProperties, required: ['path', 'status', 'previousPath'] },
    else: { not: { properties: { previousPath: {} }, required: ['previousPath'] } },
  }],
} as const;
const contextReasonSchema = closed(['kind'], {
  kind: { enum: REVIEW_CONTEXT_REASON_KINDS }, sourcePath: repositoryPath,
});
const contextItemSchema = closed(['path', 'digest', 'content', 'reasons'], {
  path: repositoryPath, digest,
  content: { type: 'string', maxLength: REVIEW_HARD_LIMITS.contextFileBytes },
  reasons: {
    type: 'array', minItems: 1, maxItems: REVIEW_HARD_LIMITS.contextReasonsPerFile,
    uniqueItems: true, items: contextReasonSchema,
  },
});

export const reviewBundleSchema = closed([
  'schemaVersion', 'task', 'revisions', 'scope', 'requirements',
  'evidence', 'context', 'selection', 'policyDigest',
], {
  schemaVersion: { const: REVIEW_BUNDLE_SCHEMA_VERSION },
  task: closed(['id', 'statement'], {
    id: identifier, statement: boundedText(16_384),
  }),
  revisions: closed(['base', 'head', 'changedManifestDigest'], {
    base: gitObjectId, head: gitObjectId, changedManifestDigest: digest,
  }),
  scope: closed(['changedPaths', 'allowedPrefixes'], {
    changedPaths: {
      type: 'array', minItems: 1, maxItems: REVIEW_HARD_LIMITS.changedPaths,
      items: changedPathSchema,
    },
    allowedPrefixes: {
      type: 'array', minItems: 1, maxItems: REVIEW_HARD_LIMITS.scopePrefixes,
      uniqueItems: true, items: scopePrefix,
    },
  }),
  requirements: {
    type: 'array', minItems: 1, maxItems: REVIEW_HARD_LIMITS.requirementAssessments,
    items: requirementSchema,
  },
  evidence: {
    type: 'array', minItems: 1, maxItems: REVIEW_HARD_LIMITS.inspectedEvidence,
    items: evidenceSchema,
  },
  context: {
    type: 'array', maxItems: REVIEW_HARD_LIMITS.contextFiles,
    items: contextItemSchema,
  },
  selection: closed(['version', 'candidateManifestDigest', 'expansionRound'], {
    version: { const: REVIEW_CONTEXT_SELECTION_VERSION },
    candidateManifestDigest: digest,
    expansionRound: { enum: [0, 1] },
  }),
  policyDigest: digest,
} as const);
