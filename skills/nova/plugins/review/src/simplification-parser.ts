import {
  SIMPLIFICATION_CANDIDATE_MANIFEST_SCHEMA_VERSION,
  SIMPLIFICATION_DIAGNOSTIC_CODES,
  SIMPLIFICATION_FACTS_EVIDENCE_KIND,
  SIMPLIFICATION_FACTS_SCHEMA_VERSION,
  type SimplificationCandidate,
  type SimplificationCandidateManifest,
  type SimplificationFact,
  type SimplificationFacts,
  type SimplificationSourceDiagnostic,
} from './simplification-contract.ts';
import { SIMPLIFICATION_CATEGORIES } from './echo-review-contract.ts';
import { compareCodeUnits } from './review-ordering.ts';
import { SIMPLIFICATION_RULE_REGISTRY } from './simplification-registry.ts';
import { REVIEW_HARD_LIMITS } from './review-hard-limits.ts';
import {
  SIMPLIFICATION_CONFIDENCE_LEVELS,
  SIMPLIFICATION_REGISTRY_VERSION,
  SIMPLIFICATION_RULE_IDS,
} from './review-policy-contract.ts';
import {
  bundleArray, bundleDeepFreeze, bundleDigest, bundleExact, bundleGitObject,
  bundleIdentifier, bundlePath, bundleRecord, bundleSelection, bundleText, bundleUnique,
} from './review-bundle-values.ts';

export type ParsedSimplificationFacts = { readonly ok: true; readonly value: SimplificationFacts }
  | { readonly ok: false; readonly error: string };
export type ParsedSimplificationCandidateManifest = { readonly ok: true; readonly value: SimplificationCandidateManifest }
  | { readonly ok: false; readonly error: string };

function integer(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0
    || (value as number) > REVIEW_HARD_LIMITS.estimatedNetLocReduction) {
    throw new Error(`${label} must be a bounded non-negative integer`);
  }
  return value as number;
}

function fact(value: unknown, index: number): SimplificationFact {
  const label = `facts[${index}]`;
  const item = bundleRecord(value, label);
  bundleExact(item, ['factId', 'ruleId', 'confidence', 'path', 'basis', 'smallestReplacement'], [
    'symbol', 'estimatedNetLocReduction',
  ], label);
  return {
    factId: bundleIdentifier(item.factId, `${label}.factId`),
    ruleId: bundleSelection(item.ruleId, SIMPLIFICATION_RULE_IDS, `${label}.ruleId`),
    confidence: bundleSelection(item.confidence, SIMPLIFICATION_CONFIDENCE_LEVELS, `${label}.confidence`),
    path: bundlePath(item.path, `${label}.path`),
    ...(item.symbol === undefined ? {} : { symbol: bundleIdentifier(item.symbol, `${label}.symbol`) }),
    basis: bundleText(item.basis, `${label}.basis`, REVIEW_HARD_LIMITS.explanationCharacters),
    smallestReplacement: bundleText(
      item.smallestReplacement, `${label}.smallestReplacement`, REVIEW_HARD_LIMITS.explanationCharacters,
    ),
    ...(item.estimatedNetLocReduction === undefined ? {} : {
      estimatedNetLocReduction: integer(item.estimatedNetLocReduction, `${label}.estimatedNetLocReduction`),
    }),
  };
}

function parseFacts(value: unknown): SimplificationFacts {
  const input = bundleRecord(value, 'simplification facts');
  bundleExact(input, ['schemaVersion', 'revision', 'facts'], [], 'simplification facts');
  if (input.schemaVersion !== SIMPLIFICATION_FACTS_SCHEMA_VERSION) throw new Error('simplification facts schemaVersion is invalid');
  const revision = bundleRecord(input.revision, 'revision');
  bundleExact(revision, ['base', 'head', 'changedManifestDigest'], [], 'revision');
  const facts = bundleArray(input.facts, 'facts', 0, REVIEW_HARD_LIMITS.simplificationFacts).map(fact);
  bundleUnique(facts.map(({ factId }) => factId), 'fact IDs');
  return bundleDeepFreeze({
    schemaVersion: SIMPLIFICATION_FACTS_SCHEMA_VERSION,
    revision: {
      base: bundleGitObject(revision.base, 'revision.base'),
      head: bundleGitObject(revision.head, 'revision.head'),
      changedManifestDigest: bundleDigest(revision.changedManifestDigest, 'revision.changedManifestDigest'),
    },
    facts: [...facts].sort((left, right) => compareCodeUnits(left.factId, right.factId)),
  });
}

function candidate(value: unknown, index: number): SimplificationCandidate {
  const label = `candidates[${index}]`;
  const item = bundleRecord(value, label);
  bundleExact(item, [
    'candidateId', 'ruleId', 'category', 'confidence', 'path', 'basis', 'smallestReplacement', 'source',
  ], ['symbol', 'estimatedNetLocReduction'], label);
  const source = bundleRecord(item.source, `${label}.source`);
  bundleExact(source, ['kind', 'digest', 'factId'], [], `${label}.source`);
  if (source.kind !== SIMPLIFICATION_FACTS_EVIDENCE_KIND) throw new Error(`${label}.source.kind is invalid`);
  const ruleId = bundleSelection(item.ruleId, SIMPLIFICATION_RULE_IDS, `${label}.ruleId`);
  const category = bundleSelection(item.category, SIMPLIFICATION_CATEGORIES, `${label}.category`);
  if (SIMPLIFICATION_RULE_REGISTRY[ruleId].category !== category) {
    throw new Error(`${label}.category does not match ${ruleId}`);
  }
  return {
    candidateId: bundleDigest(item.candidateId, `${label}.candidateId`),
    ruleId, category,
    confidence: bundleSelection(item.confidence, SIMPLIFICATION_CONFIDENCE_LEVELS, `${label}.confidence`),
    path: bundlePath(item.path, `${label}.path`),
    ...(item.symbol === undefined ? {} : { symbol: bundleIdentifier(item.symbol, `${label}.symbol`) }),
    basis: bundleText(item.basis, `${label}.basis`, REVIEW_HARD_LIMITS.explanationCharacters),
    smallestReplacement: bundleText(
      item.smallestReplacement, `${label}.smallestReplacement`, REVIEW_HARD_LIMITS.explanationCharacters,
    ),
    source: {
      kind: SIMPLIFICATION_FACTS_EVIDENCE_KIND,
      digest: bundleDigest(source.digest, `${label}.source.digest`),
      factId: bundleIdentifier(source.factId, `${label}.source.factId`),
    },
    ...(item.estimatedNetLocReduction === undefined ? {} : {
      estimatedNetLocReduction: integer(item.estimatedNetLocReduction, `${label}.estimatedNetLocReduction`),
    }),
  };
}

function diagnostic(value: unknown, index: number): SimplificationSourceDiagnostic {
  const label = `diagnostics[${index}]`;
  const item = bundleRecord(value, label);
  bundleExact(item, ['sourceDigest', 'code', 'message'], [], label);
  return {
    sourceDigest: bundleDigest(item.sourceDigest, `${label}.sourceDigest`),
    code: bundleSelection(item.code, SIMPLIFICATION_DIAGNOSTIC_CODES, `${label}.code`),
    message: bundleText(item.message, `${label}.message`, REVIEW_HARD_LIMITS.explanationCharacters),
  };
}

function parseManifest(value: unknown): SimplificationCandidateManifest {
  const input = bundleRecord(value, 'simplification candidate manifest');
  bundleExact(input, ['schemaVersion', 'registryVersion', 'revision', 'candidates', 'diagnostics'], [], 'simplification candidate manifest');
  if (input.schemaVersion !== SIMPLIFICATION_CANDIDATE_MANIFEST_SCHEMA_VERSION) {
    throw new Error('simplification candidate manifest schemaVersion is invalid');
  }
  if (input.registryVersion !== SIMPLIFICATION_REGISTRY_VERSION) throw new Error('simplification registryVersion is invalid');
  const revision = bundleRecord(input.revision, 'revision');
  bundleExact(revision, ['base', 'head', 'changedManifestDigest'], [], 'revision');
  const candidates = bundleArray(
    input.candidates, 'candidates', 0, REVIEW_HARD_LIMITS.simplificationCandidates,
  ).map(candidate);
  const diagnostics = bundleArray(
    input.diagnostics, 'diagnostics', 0, REVIEW_HARD_LIMITS.simplificationDiagnostics,
  ).map(diagnostic);
  bundleUnique(candidates.map(({ candidateId }) => candidateId), 'candidate IDs');
  bundleUnique(diagnostics.map(({ sourceDigest, code }) => `${sourceDigest}\0${code}`), 'diagnostic identities');
  return bundleDeepFreeze({
    schemaVersion: SIMPLIFICATION_CANDIDATE_MANIFEST_SCHEMA_VERSION,
    registryVersion: SIMPLIFICATION_REGISTRY_VERSION,
    revision: {
      base: bundleGitObject(revision.base, 'revision.base'),
      head: bundleGitObject(revision.head, 'revision.head'),
      changedManifestDigest: bundleDigest(revision.changedManifestDigest, 'revision.changedManifestDigest'),
    },
    candidates: [...candidates].sort((left, right) => compareCodeUnits(left.candidateId, right.candidateId)),
    diagnostics: [...diagnostics].sort((left, right) => (
      compareCodeUnits(`${left.sourceDigest}\0${left.code}`, `${right.sourceDigest}\0${right.code}`)
    )),
  });
}

function parsed<T>(operation: () => T): { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: string } {
  try { return { ok: true, value: operation() }; } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export function parseSimplificationFacts(value: unknown): ParsedSimplificationFacts { return parsed(() => parseFacts(value)); }
export function parseSimplificationCandidateManifest(value: unknown): ParsedSimplificationCandidateManifest {
  return parsed(() => parseManifest(value));
}
