import { canonicalJson, PORTABLE_JSON_ENCODING, sha256Text } from '@kubeclaw/plugin-sdk';
import { reviewEvidenceJson } from './review-evidence-encoding.ts';
import { PORTABLE_REVIEW_BUNDLE_VERSION } from './review-semantics.ts';

import type {
  ChangeRelation,
  ProposedFinding,
  ScopeRelation,
} from './echo-review-contract.ts';
import type { ParsedEchoReviewOutput } from './echo-review-parser.ts';
import type { ReviewBundle } from './review-bundle-contract.ts';
import type { ResolvedReviewPolicy } from './review-policy-resolver.ts';
import { isResolvedReviewPolicy, assertReviewPolicyBundle } from './review-policy-resolver.ts';
import type { ReviewChangedLineRange } from './review-repository.ts';
import {
  SIMPLIFICATION_CANDIDATES_EVIDENCE_KIND,
  type SimplificationCandidateManifest,
} from './simplification-contract.ts';
import { parseSimplificationCandidateManifest } from './simplification-parser.ts';
import { offeredReviewEvidenceKeys } from './review-evidence-authority.ts';

export interface PreflightedReviewProposal {
  readonly proposalId: `sha256:${string}`;
  readonly finding: ProposedFinding;
  readonly changeRelation: ChangeRelation;
  readonly scopeRelation: ScopeRelation;
}

export interface ReviewProposalPreflight {
  readonly proposals: Readonly<Record<string, PreflightedReviewProposal>>;
  readonly eligibleProposalIds: readonly `sha256:${string}`[];
  readonly proposalSetDigest: `sha256:${string}`;
  readonly exactDuplicateCount: number;
  readonly integrityIssues: readonly string[];
  readonly limitViolations: readonly string[];
}

interface PreflightProof {
  readonly bundle: ReviewBundle;
  readonly policy: ResolvedReviewPolicy;
}

const CERTIFIED_PREFLIGHTS = new WeakMap<object, PreflightProof>();

export function isCertifiedReviewProposalPreflight(
  value: unknown,
  bundle: ReviewBundle,
  policy: ResolvedReviewPolicy,
): value is ReviewProposalPreflight {
  if (!value || typeof value !== 'object') return false;
  const proof = CERTIFIED_PREFLIGHTS.get(value);
  return proof?.bundle === bundle && proof.policy === policy;
}

function inScope(path: string, prefixes: readonly string[]): boolean {
  return prefixes.some((prefix) => prefix === '.' || path === prefix || path.startsWith(`${prefix}/`));
}

function evidenceKey(kind: string, digest: string): string { return `${kind}\0${digest}`; }

function sourceLineCount(content: string): number {
  if (content.length === 0) return 0;
  return content.split('\n').length - (content.endsWith('\n') ? 1 : 0);
}

function locationRelation(
  path: string,
  lineHint: number | undefined,
  bundle: ReviewBundle,
  rangesByPath: ReadonlyMap<string, readonly ReviewChangedLineRange[]>,
): ChangeRelation {
  const change = bundle.scope.changedPaths.find((entry) => entry.path === path);
  if (!change) return 'pre_existing';
  if (change.status === 'added') return 'introduced';
  if (change.status === 'deleted' || lineHint === undefined) return 'unknown';
  const ranges = rangesByPath.get(path);
  if (!ranges || ranges.length === 0) return 'unknown';
  return ranges.some(({ start, end }) => lineHint >= start && lineHint <= end)
    ? 'introduced' : 'pre_existing';
}

function findingChangeRelation(
  finding: ProposedFinding,
  bundle: ReviewBundle,
  rangesByPath: ReadonlyMap<string, readonly ReviewChangedLineRange[]>,
): ChangeRelation {
  const relations = new Set(finding.locations.map(({ path, lineHint }) => (
    locationRelation(path, lineHint, bundle, rangesByPath)
  )));
  if (relations.size === 1) return [...relations][0] as ChangeRelation;
  if (relations.has('unknown')) return 'unknown';
  return 'exposed';
}

function eligible(
  proposal: PreflightedReviewProposal,
  policy: ResolvedReviewPolicy['policy'],
): boolean {
  const verifierPriority = policy.verification.semanticVerifier === 'p0-only'
    ? proposal.finding.priority === 'P0'
    : policy.blocking.priorities.includes(proposal.finding.priority);
  return [
    proposal.finding.simplification === undefined,
    policy.verification.semanticVerifier !== 'disabled',
    policy.blocking.categories.includes(proposal.finding.category),
    proposal.finding.evidenceStrength !== 'insufficient',
    !policy.blocking.requireDirectEvidence || proposal.finding.evidenceStrength === 'direct',
    verifierPriority,
    !policy.blocking.requireIntroducedByDiff || proposal.changeRelation === 'introduced',
    proposal.scopeRelation === 'inside',
  ].every(Boolean);
}

interface ProposalProofContext {
  readonly bundle: ReviewBundle;
  readonly offeredEvidence: ReadonlySet<string>;
  readonly inspectedEvidence: ReadonlySet<string>;
  readonly contextByPath: ReadonlyMap<string, ReviewBundle['context'][number]>;
  readonly rangesByPath: ReadonlyMap<string, readonly ReviewChangedLineRange[]>;
  readonly requireLineProof: boolean;
  readonly simplificationManifest?: SimplificationCandidateManifest;
  readonly simplificationEvidenceKey?: string;
  readonly policy: ResolvedReviewPolicy['policy'];
}

function candidateBindingIssues(
  finding: ProposedFinding & { readonly simplification: NonNullable<ProposedFinding['simplification']> },
  label: string,
  proof: ProposalProofContext,
): string[] {
  if (!proof.simplificationManifest || !proof.simplificationEvidenceKey) {
    return [`${label} cites a missing Simplification candidate manifest`];
  }
  const byId = new Map(proof.simplificationManifest.candidates.map((candidate) => [candidate.candidateId, candidate]));
  const candidates = finding.simplification.candidateIds.map((candidateId) => byId.get(candidateId));
  const issues: string[] = [];
  if (candidates.some((candidate) => !candidate)) issues.push(`${label} cites an unknown Simplification candidate`);
  if (candidates.some((candidate) => candidate && !proof.policy.simplification.enabledRules.includes(candidate.ruleId))) {
    issues.push(`${label} cites a disabled Simplification rule`);
  }
  if (candidates.some((candidate) => candidate && candidate.category !== finding.simplification?.category)) {
    issues.push(`${label} Simplification category does not match its candidates`);
  }
  const paths = new Set(finding.locations.map(({ path }) => path));
  if (candidates.some((candidate) => candidate && !paths.has(candidate.path))) {
    issues.push(`${label} does not locate every cited Simplification candidate`);
  }
  if (!finding.evidence.some(({ kind, digest }) => evidenceKey(kind, digest) === proof.simplificationEvidenceKey)) {
    issues.push(`${label} does not cite the Simplification candidate manifest as evidence`);
  }
  return issues;
}

function simplificationIssues(finding: ProposedFinding, label: string, proof: ProposalProofContext): string[] {
  if (!finding.simplification) return [];
  if (finding.category !== 'simplification') return [`${label} uses Simplification metadata on a blocking category`];
  if (!proof.policy.simplification.enabled) return [`${label} cites Simplification candidates while Simplification is disabled`];
  return candidateBindingIssues(
    finding as ProposedFinding & { readonly simplification: NonNullable<ProposedFinding['simplification']> }, label, proof,
  );
}

function evidenceIssues(finding: ProposedFinding, label: string, proof: ProposalProofContext): string[] {
  const issues: string[] = [];
  for (const reference of finding.evidence) {
    const key = evidenceKey(reference.kind, reference.digest);
    if (!proof.offeredEvidence.has(key)) issues.push(`${label} cites evidence that was not supplied`);
    if (!proof.inspectedEvidence.has(key)) issues.push(`${label} cites evidence Echo did not inspect`);
  }
  const citedReviewedSourceDigests = new Set(finding.evidence
    .filter(({ kind }) => kind === 'reviewed-source')
    .map(({ digest }) => digest));
  for (const location of finding.locations) {
    const context = proof.contextByPath.get(location.path);
    if (!context) {
      issues.push(`${label} location ${location.path} is not in reviewed context`);
    } else if (!citedReviewedSourceDigests.has(context.digest)) {
      issues.push(`${label} does not cite reviewed source evidence for location ${location.path}`);
    }
  }
  return issues;
}

function oneLocationIssues(
  location: ProposedFinding['locations'][number], label: string, proof: ProposalProofContext,
): string[] {
  const issues: string[] = [];
  const context = proof.contextByPath.get(location.path);
  if (context && location.lineHint !== undefined && location.lineHint > sourceLineCount(context.content)) {
    issues.push(`${label} location ${location.path}:${location.lineHint} is outside reviewed content`);
  }
  if (!inScope(location.path, proof.bundle.scope.allowedPrefixes)) {
    issues.push(`${label} location ${location.path} is outside allowed scope`);
  }
  issues.push(...changedLineIssues(location, label, proof));
  return issues;
}

function changedLineIssues(
  location: ProposedFinding['locations'][number], label: string, proof: ProposalProofContext,
): string[] {
  const changed = proof.bundle.scope.changedPaths.find(({ path }) => path === location.path);
  const required = proof.requireLineProof && changed && !['added', 'deleted'].includes(changed.status);
  return required && !proof.rangesByPath.has(location.path) && location.lineHint !== undefined
    ? [`${label} location ${location.path} has no changed-line proof`] : [];
}

function locationIssues(finding: ProposedFinding, label: string, proof: ProposalProofContext): string[] {
  return finding.locations.flatMap((location) => oneLocationIssues(location, label, proof));
}

function proposalIntegrityIssues(finding: ProposedFinding, label: string, proof: ProposalProofContext): string[] {
  return [
    ...evidenceIssues(finding, label, proof), ...locationIssues(finding, label, proof),
    ...simplificationIssues(finding, label, proof),
  ];
}

function simplificationManifest(bundle: ReviewBundle): {
  readonly manifest?: SimplificationCandidateManifest;
  readonly evidenceKey?: string;
  readonly issues: readonly string[];
} {
  const sources = bundle.evidence.filter(({ kind }) => kind === SIMPLIFICATION_CANDIDATES_EVIDENCE_KIND);
  if (sources.length === 0) return { issues: [] };
  if (sources.length !== 1) return { issues: ['review bundle contains multiple Simplification candidate manifests'] };
  const source = sources[0];
  if (!source) return { issues: ['Simplification candidate manifest is missing'] };
  let value: unknown;
  try { value = JSON.parse(source.content); } catch { return { issues: ['Simplification candidate manifest is not JSON'] }; }
  try {
    if (sha256Text(source.content) !== source.digest
      || (bundle.schemaVersion === PORTABLE_REVIEW_BUNDLE_VERSION && source.encoding !== PORTABLE_JSON_ENCODING)
      || reviewEvidenceJson(value, source.encoding) !== source.content) {
      return { issues: ['Simplification candidate manifest digest or encoding is invalid'] };
    }
  } catch { return { issues: ['Simplification candidate manifest encoding is invalid'] }; }
  const parsed = parseSimplificationCandidateManifest(value);
  if (!parsed.ok) return { issues: [`invalid Simplification candidate manifest: ${parsed.error}`] };
  const revision = parsed.value.revision;
  if (revision.base !== bundle.revisions.base || revision.head !== bundle.revisions.head
    || revision.changedManifestDigest !== bundle.revisions.changedManifestDigest) {
    return { issues: ['Simplification candidate manifest does not match the review bundle revision'] };
  }
  return { manifest: parsed.value, evidenceKey: evidenceKey(source.kind, source.digest), issues: [] };
}

function collectProposals(
  findings: readonly ProposedFinding[], proof: ProposalProofContext,
): { readonly unique: Map<string, PreflightedReviewProposal>; readonly issues: string[]; readonly duplicates: number } {
  const unique = new Map<string, PreflightedReviewProposal>();
  const issues: string[] = [];
  let duplicates = 0;
  findings.forEach((finding, index) => {
    const proposalIssues = proposalIntegrityIssues(finding, `proposedFindings[${index}]`, proof);
    issues.push(...proposalIssues);
    if (proposalIssues.length > 0) return;
    const proposalId = sha256Text(canonicalJson(finding));
    if (unique.has(proposalId)) { duplicates += 1; return; }
    unique.set(proposalId, {
      proposalId, finding,
      changeRelation: findingChangeRelation(finding, proof.bundle, proof.rangesByPath),
      scopeRelation: finding.locations.every(({ path }) => inScope(path, proof.bundle.scope.allowedPrefixes))
        ? 'inside' : 'outside',
    });
  });
  return { unique, issues, duplicates };
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Readonly<Record<string, unknown>>)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

export function preflightEchoReviewProposals(
  bundle: ReviewBundle,
  parsed: Extract<ParsedEchoReviewOutput, { readonly ok: true }>['value'],
  policy: ResolvedReviewPolicy,
  rangesByPath: ReadonlyMap<string, readonly ReviewChangedLineRange[]>,
): ReviewProposalPreflight {
  assertReviewPolicyBundle(policy, bundle);
  if (!isResolvedReviewPolicy(policy)) {
    throw new Error('proposal preflight requires a resolver-owned review policy');
  }
  const offeredEvidence = offeredReviewEvidenceKeys(bundle);
  const inspectedEvidence = new Set(parsed.inspectedEvidence.map(({ kind, digest }) => evidenceKey(kind, digest)));
  const contextByPath = new Map(bundle.context.map((item) => [item.path, item]));
  const simplification = simplificationManifest(bundle);
  const overLimit = parsed.proposedFindings.length > policy.policy.limits.maxProposals;
  const collected = collectProposals(parsed.proposedFindings, {
    bundle, offeredEvidence, inspectedEvidence, contextByPath, rangesByPath,
    requireLineProof: !overLimit, policy: policy.policy,
    ...(simplification.manifest ? { simplificationManifest: simplification.manifest } : {}),
    ...(simplification.evidenceKey ? { simplificationEvidenceKey: simplification.evidenceKey } : {}),
  });
  const proposals = Object.fromEntries([...collected.unique.entries()].sort(([left], [right]) => (
    left < right ? -1 : left > right ? 1 : 0
  )));
  const eligibleProposalIds = Object.values(proposals)
    .filter((proposal) => eligible(proposal, policy.policy))
    .map(({ proposalId }) => proposalId)
    .sort();
  const result = deepFreeze({
    proposals,
    eligibleProposalIds,
    proposalSetDigest: sha256Text(canonicalJson(eligibleProposalIds)),
    exactDuplicateCount: collected.duplicates,
    integrityIssues: [...simplification.issues, ...collected.issues],
    limitViolations: overLimit
      ? [`proposed finding count ${parsed.proposedFindings.length} exceeds policy limit`]
      : [],
  });
  CERTIFIED_PREFLIGHTS.set(result, Object.freeze({ bundle, policy }));
  return result;
}
