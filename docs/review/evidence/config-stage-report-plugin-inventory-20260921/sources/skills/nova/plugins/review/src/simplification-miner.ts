import { canonicalJson, portableJson, sha256Text } from '@kubeclaw/plugin-sdk';

import {
  SIMPLIFICATION_FACTS_EVIDENCE_KIND,
  type SimplificationCandidate,
  type SimplificationRevisionIdentity,
  type SimplificationSourceDiagnostic,
} from './simplification-contract.ts';
import { parseSimplificationFacts } from './simplification-parser.ts';
import { SIMPLIFICATION_RULE_REGISTRY } from './simplification-registry.ts';
import type { ReviewBundleEvidence } from './review-bundle-contract.ts';
import { REVIEW_HARD_LIMITS } from './review-hard-limits.ts';
import { compareCodeUnits } from './review-ordering.ts';
import type { ResolvedReviewPolicy } from './review-policy-resolver.ts';
import { assertVerifiedReviewPolicy } from './review-policy-resolver.ts';
import type { ReviewSemanticEncoding } from './review-semantics.ts';
import { reviewEvidenceJson } from './review-evidence-encoding.ts';

export interface SimplificationMiningInput {
  readonly revision: SimplificationRevisionIdentity;
  readonly evidence: readonly ReviewBundleEvidence[];
  readonly reviewedPaths: readonly string[];
  readonly policy: ResolvedReviewPolicy;
}

export interface SimplificationMiningResult {
  readonly candidates: readonly SimplificationCandidate[];
  readonly diagnostics: readonly SimplificationSourceDiagnostic[];
}

const CONFIDENCE_RANK = { low: 0, medium: 1, high: 2 } as const;

function revisionMatches(left: SimplificationRevisionIdentity, right: SimplificationRevisionIdentity): boolean {
  return left.base === right.base && left.head === right.head
    && left.changedManifestDigest === right.changedManifestDigest;
}

function candidateIdentity(candidate: Omit<SimplificationCandidate, 'candidateId' | 'source'>): `sha256:${string}` {
  return sha256Text(canonicalJson({
    schemaVersion: 'simplification-candidate-identity.v1', ruleId: candidate.ruleId,
    category: candidate.category, confidence: candidate.confidence, path: candidate.path,
    ...(candidate.symbol === undefined ? {} : { symbol: candidate.symbol }),
    basis: candidate.basis, smallestReplacement: candidate.smallestReplacement,
    ...(candidate.estimatedNetLocReduction === undefined ? {} : {
      estimatedNetLocReduction: candidate.estimatedNetLocReduction,
    }),
  }));
}

function diagnostic(
  sourceDigest: `sha256:${string}`,
  code: SimplificationSourceDiagnostic['code'],
  message: string,
): SimplificationSourceDiagnostic { return { sourceDigest, code, message }; }

function parseSource(evidence: ReviewBundleEvidence) {
  try {
    if (sha256Text(evidence.content) !== evidence.digest) throw new Error('Simplification facts digest does not match its bytes');
    const value: unknown = JSON.parse(evidence.content);
    if (reviewEvidenceJson(value, evidence.encoding) !== evidence.content) throw new Error('Simplification facts encoding does not match its bytes');
    return parseSimplificationFacts(value);
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : String(error) };
  }
}

function factCandidate(
  fact: Extract<ReturnType<typeof parseSource>, { readonly ok: true }>['value']['facts'][number],
  evidence: ReviewBundleEvidence,
): SimplificationCandidate {
  const rule = SIMPLIFICATION_RULE_REGISTRY[fact.ruleId];
  const semantic = {
    ruleId: fact.ruleId, category: rule.category, confidence: fact.confidence,
    path: fact.path, ...(fact.symbol === undefined ? {} : { symbol: fact.symbol }),
    basis: fact.basis, smallestReplacement: fact.smallestReplacement,
    ...(fact.estimatedNetLocReduction === undefined ? {} : {
      estimatedNetLocReduction: fact.estimatedNetLocReduction,
    }),
  } as const;
  return {
    candidateId: candidateIdentity(semantic), ...semantic,
    source: { kind: SIMPLIFICATION_FACTS_EVIDENCE_KIND, digest: evidence.digest, factId: fact.factId },
  };
}

function sourceCandidates(
  evidence: ReviewBundleEvidence,
  input: SimplificationMiningInput,
): SimplificationMiningResult {
  const parsed = parseSource(evidence);
  if (!parsed.ok) return {
    candidates: [], diagnostics: [diagnostic(evidence.digest, 'malformed_source', parsed.error)],
  };
  if (!revisionMatches(parsed.value.revision, input.revision)) return {
    candidates: [], diagnostics: [diagnostic(
      evidence.digest, 'revision_mismatch', 'Simplification facts do not match the frozen review revision.',
    )],
  };
  const reviewed = new Set(input.reviewedPaths);
  const enabled = new Set(input.policy.policy.simplification.enabledRules);
  const minimum = CONFIDENCE_RANK[input.policy.policy.simplification.minimumConfidence];
  const outOfScope = parsed.value.facts.filter(({ path }) => !reviewed.has(path));
  const candidates = parsed.value.facts.filter((fact) => (
    reviewed.has(fact.path) && enabled.has(fact.ruleId)
    && CONFIDENCE_RANK[fact.confidence] >= minimum
  )).map((fact) => factCandidate(fact, evidence));
  return {
    candidates,
    diagnostics: [
      ...(outOfScope.length === 0 ? [] : [diagnostic(evidence.digest, 'scope_mismatch',
        `${outOfScope.length} fact(s) are outside reviewed context.`)]),
      ...(!parsed.value.omittedSourceCount ? [] : [diagnostic(evidence.digest, 'unsupported_source',
        `${parsed.value.omittedSourceCount} JSX/TSX source document(s) omitted by the bounded forwarding-function scanner.`)]),
      ...(!parsed.value.omittedFactCount ? [] : [diagnostic(evidence.digest, 'candidate_limit',
        `${parsed.value.omittedFactCount} source fact(s) omitted by the producer limit.`)]),
    ],
  };
}

export function mineSimplificationCandidates(input: SimplificationMiningInput, encoding?: ReviewSemanticEncoding): SimplificationMiningResult {
  portableJson(input);
  assertVerifiedReviewPolicy(input.policy, encoding);
  if (!input.policy.policy.simplification.enabled) return { candidates: [], diagnostics: [] };
  const results = input.evidence.filter(({ kind }) => kind === SIMPLIFICATION_FACTS_EVIDENCE_KIND)
    .map((evidence) => sourceCandidates(evidence, input));
  const unique = new Map<string, SimplificationCandidate>();
  for (const candidate of results.flatMap(({ candidates }) => candidates)) {
    const current = unique.get(candidate.candidateId);
    const sourceKey = ({ source }: SimplificationCandidate) => `${source.digest}\0${source.factId}`;
    if (!current || sourceKey(candidate) < sourceKey(current)) unique.set(candidate.candidateId, candidate);
  }
  const candidates = [...unique.values()].sort((left, right) => compareCodeUnits(left.candidateId, right.candidateId));
  const limited = candidates.slice(0, REVIEW_HARD_LIMITS.simplificationCandidates);
  const diagnostics = results.flatMap(({ diagnostics: sourceDiagnostics }) => sourceDiagnostics);
  if (limited.length < candidates.length) diagnostics.push(diagnostic(
    sha256Text(canonicalJson(candidates.map(({ candidateId }) => candidateId))),
    'candidate_limit', `${candidates.length - limited.length} candidate(s) exceeded the hard limit.`,
  ));
  return {
    candidates: limited,
    diagnostics: diagnostics.sort((left, right) => (
      compareCodeUnits(`${left.sourceDigest}\0${left.code}`, `${right.sourceDigest}\0${right.code}`)
    )),
  };
}
