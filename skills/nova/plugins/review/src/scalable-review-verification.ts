/* eslint-disable max-lines -- Preflight and independent verification share one evidence-integrity authority. */
import { canonicalJson, sha256Text, type PluginInvocationContext } from '@kubeclaw/plugin-sdk';

import type { ProposedFinding } from './echo-review-contract.ts';
import { echoReviewVerificationOutputSchema } from './echo-review-verification-contract.ts';
import { parseEchoReviewVerificationDispatchResponse, type ParsedEchoReviewVerificationOutput } from './echo-review-verification-parser.ts';
import { REVIEWED_SOURCE_EVIDENCE_KIND, REVIEWED_TOPOLOGY_EVIDENCE_KIND } from './review-evidence-authority.ts';
import { scalableReviewSourceExcerpt, type ScalableReviewJob, type ScalableReviewJobResult } from './scalable-review-jobs.ts';
import { compareCodeUnits } from './review-ordering.ts';
import { reserveReviewRuntimePrompt, type ReviewTokenizerEncoding } from './review-prompt-budget.ts';
import { assertReviewDeadline, invokeBeforeReviewDeadline, resolveReviewExecutionSettings,
  type ReviewExecutionSettings } from './review-execution-settings.ts';
import { verifierEvidenceMatchesSource } from './scalable-review-verification-evidence.ts';
import { assertReviewRuntimeIdentity, parseReviewRuntimeAttestation,
  type ReviewRuntimeAttestation, type ReviewRuntimeIdentity } from './review-runtime-attestation.ts';

export interface ScalableReviewProposal {
  readonly id: `sha256:${string}`;
  readonly jobId: string;
  readonly jobDigest: string;
  readonly finding: ProposedFinding;
}

export interface ScalableReviewPreflight {
  readonly proposals: readonly ScalableReviewProposal[];
  readonly integrityIssues: readonly string[];
  readonly incompleteJobs: readonly string[];
}

export interface ScalableVerificationJob {
  readonly id: string;
  readonly proposal: ScalableReviewProposal;
  readonly source: ScalableReviewJob['source'];
  readonly policyDigest: `sha256:${string}`;
  readonly proposalSetDigest: `sha256:${string}`;
  readonly taskDigest: `sha256:${string}`;
  readonly digest: `sha256:${string}`;
}

export interface ScalableVerificationBudget {
  readonly tokenizerEncoding: ReviewTokenizerEncoding;
  readonly maxPromptBytes: number; readonly maxInputTokens: number;
}

export interface ScalableVerificationJobResult {
  readonly jobId: string;
  readonly parsed: ParsedEchoReviewVerificationOutput;
  readonly runtime: ReviewRuntimeAttestation;
}

export interface ScalableReducedFinding {
  readonly proposalId: `sha256:${string}`;
  readonly fingerprint: `sha256:${string}`;
  readonly clusterId: `sha256:${string}`;
  readonly jobId: string;
  readonly finding: ProposedFinding;
  readonly verification: 'confirmed' | 'rejected' | 'insufficient_evidence';
  readonly verificationReason: string;
}

export interface ScalableReviewReduction {
  readonly confirmed: readonly ScalableReducedFinding[];
  readonly rejected: readonly ScalableReducedFinding[];
  readonly incomplete: readonly string[];
  readonly duplicateCount: number;
  readonly digest: `sha256:${string}`;
}

function findingFingerprint(finding: ProposedFinding): `sha256:${string}` {
  return sha256Text(canonicalJson({
    category: finding.category, priority: finding.priority, claim: finding.claim,
    locations: finding.locations, recommendedFix: finding.recommendedFix,
  }));
}

function proposal(job: ScalableReviewJob, finding: ProposedFinding): ScalableReviewProposal {
  const id = sha256Text(canonicalJson({ jobDigest: job.digest, finding }));
  return Object.freeze({ id, jobId: job.id, jobDigest: job.digest, finding });
}

function evidenceKeys(finding: ProposedFinding): ReadonlySet<string> {
  return new Set(finding.evidence.filter(({ kind }) => kind === REVIEWED_SOURCE_EVIDENCE_KIND).map(({ digest }) => digest));
}

function citesBoundaryRelation(
  job: ScalableReviewJob, sources: ReadonlyMap<string, string>, cited: ReadonlySet<string>,
  located: ReadonlySet<string>,
): boolean {
  return job.relationKeys.some((key) => {
    const [, from, to] = key.split('\0');
    const endpoints = [from, to].filter((path): path is string => Boolean(path && sources.has(path)));
    return endpoints.length > 0 && endpoints.every((path) => (
      located.has(path) && cited.has(sources.get(path) as string)
    ));
  });
}

function validateFinding(job: ScalableReviewJob, finding: ProposedFinding): string | undefined {
  if (['system-path', 'system-lens'].includes(job.kind) && job.source.length === 0) {
    return `holistic job cannot propose a code finding without expanded source: ${job.id}`;
  }
  const sourceRecords = new Map(job.source.map((value) => [value.path, value]));
  const sources = new Map(job.source.map((value) => [value.path, value.digest]));
  const cited = evidenceKeys(finding);
  const located = new Set(finding.locations.map(({ path }) => path));
  for (const location of finding.locations) {
    const source = sourceRecords.get(location.path);
    if (!source) return `finding names source outside job ${job.id}: ${location.path}`;
    if (location.lineHint === undefined) return `finding location has no precise line hint: ${job.id}:${location.path}`;
    if (!source.ranges.some(({ startLine, endLine }) => (
      (location.lineHint as number) >= startLine && (location.lineHint as number) <= endLine
    ))) return `finding line is outside reviewed source range: ${job.id}:${location.path}:${location.lineHint}`;
    if (!cited.has(source.digest)) return `finding does not cite exact source ${location.path}`;
  }
  if (job.kind === 'boundary' && !citesBoundaryRelation(job, sources, cited, located)) {
    return `boundary finding does not cite the endpoints of one relation: ${job.id}`;
  }
  return undefined;
}

function topologyEvidence(job: ScalableReviewJob): string | undefined {
  const evidence = job.systemContext?.topologyEvidence;
  if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence)) return undefined;
  const value = evidence as Readonly<Record<string, unknown>>;
  return value.kind === REVIEWED_TOPOLOGY_EVIDENCE_KIND && typeof value.digest === 'string'
    ? value.digest : undefined;
}

function sourceLessHolisticJobCertified(job: ScalableReviewJob, parsed: ScalableReviewJobResult['parsed']): boolean {
  if (!['system-path', 'system-lens'].includes(job.kind) || job.source.length > 0 || !parsed.ok) return true;
  const digest = topologyEvidence(job);
  if (!digest) return false;
  const key = `${REVIEWED_TOPOLOGY_EVIDENCE_KIND}\0${digest}`;
  const inspected = new Set(parsed.value.inspectedEvidence.map((value) => `${value.kind}\0${value.digest}`));
  return inspected.has(key) && Object.values(parsed.value.requirementAssessments).every(({ assessment, evidence }) => (
    assessment === 'satisfied' && evidence.some((value) => `${value.kind}\0${value.digest}` === key)
  ));
}

// eslint-disable-next-line complexity -- Preflight validates each independent trust condition before accepting findings.
function preflightJob(
  job: ScalableReviewJob, result: Pick<ScalableReviewJobResult, 'jobDigest' | 'parsed'> | undefined,
  proposals: ScalableReviewProposal[], integrityIssues: string[], incompleteJobs: string[],
): void {
  if (!result || result.jobDigest !== job.digest || !result.parsed.ok) { incompleteJobs.push(job.id); return; }
  if (result.parsed.value.contextRequest) { integrityIssues.push(`complete job requested context: ${job.id}`); return; }
  const expected = job.requirements.map(({ id }) => id).sort();
  const actual = Object.keys(result.parsed.value.requirementAssessments).sort();
  if (canonicalJson(expected) !== canonicalJson(actual)) {
    integrityIssues.push(`job requirement assessments are incomplete: ${job.id}`); return;
  }
  if (!sourceLessHolisticJobCertified(job, result.parsed)) {
    integrityIssues.push(`source-less holistic job did not certify the supplied topology: ${job.id}`); return;
  }
  const offered = new Set(job.source.map(({ digest }) => `${REVIEWED_SOURCE_EVIDENCE_KIND}\0${digest}`));
  const topologyDigest = topologyEvidence(job);
  if (topologyDigest) offered.add(`${REVIEWED_TOPOLOGY_EVIDENCE_KIND}\0${topologyDigest}`);
  const untrusted = result.parsed.value.inspectedEvidence.some(({ kind, digest }) => !offered.has(`${kind}\0${digest}`));
  if (untrusted) { integrityIssues.push(`job inspected evidence is untrusted: ${job.id}`); return; }
  for (const finding of result.parsed.value.proposedFindings) {
    const issue = validateFinding(job, finding);
    if (issue) integrityIssues.push(issue); else proposals.push(proposal(job, finding));
  }
}

function uniqueResults<T extends { readonly jobId: string }>(results: readonly T[], label: string): ReadonlyMap<string, T> {
  const output = new Map<string, T>();
  for (const result of results) {
    if (output.has(result.jobId)) throw new Error(`${label} contains duplicate job result: ${result.jobId}`);
    output.set(result.jobId, result);
  }
  return output;
}

export function preflightScalableReviewResults(
  jobs: readonly ScalableReviewJob[],
  results: readonly Pick<ScalableReviewJobResult, 'jobId' | 'jobDigest' | 'parsed'>[],
): ScalableReviewPreflight {
  const resultById = uniqueResults(results, 'scalable review preflight');
  const proposals: ScalableReviewProposal[] = [], integrityIssues: string[] = [], incompleteJobs: string[] = [];
  for (const job of jobs) preflightJob(job, resultById.get(job.id), proposals, integrityIssues, incompleteJobs);
  if (results.some(({ jobId }) => !jobs.some(({ id }) => id === jobId))) integrityIssues.push('unknown scalable review result');
  return Object.freeze({
    proposals: Object.freeze(proposals.sort((left, right) => compareCodeUnits(left.id, right.id))),
    integrityIssues: Object.freeze([...new Set(integrityIssues)].sort()),
    incompleteJobs: Object.freeze([...new Set(incompleteJobs)].sort()),
  });
}

function reducedFinding(
  job: ScalableVerificationJob, response: ScalableVerificationJobResult | undefined,
): ScalableReducedFinding | undefined {
  if (!response || !completeVerificationResponse(job, response.parsed)) return undefined;
  const parsed = response.parsed.value;
  const result = parsed.results[job.proposal.id]!;
  const fingerprint = findingFingerprint(job.proposal.finding);
  const clusterId = sha256Text(canonicalJson({
    category: job.proposal.finding.category, rootCauseHint: job.proposal.finding.rootCauseHint,
    primaryPath: job.proposal.finding.locations[0]?.path,
  }));
  return Object.freeze({ proposalId: job.proposal.id, fingerprint, clusterId,
    jobId: job.proposal.jobId, finding: job.proposal.finding,
    verification: result.verdict, verificationReason: result.reason });
}

function completeVerificationResponse(
  job: ScalableVerificationJob, parsed: ParsedEchoReviewVerificationOutput,
): parsed is Extract<ParsedEchoReviewVerificationOutput, { readonly ok: true }> {
  if (!parsed.ok || parsed.value.bundleDigest !== job.digest
    || parsed.value.policyDigest !== job.policyDigest
    || parsed.value.proposalSetDigest !== job.proposalSetDigest) return false;
  const result = parsed.value.results[job.proposal.id];
  return Boolean(result && Object.keys(parsed.value.results).length === 1
    && verifierEvidenceMatchesSource({ evidence: result.evidence, verdict: result.verdict,
      locations: job.proposal.finding.locations, source: job.source }));
}

export function buildScalableVerificationJobs(
  preflight: ScalableReviewPreflight, jobs: readonly ScalableReviewJob[],
  policyDigest: `sha256:${string}`, budget?: ScalableVerificationBudget,
): readonly ScalableVerificationJob[] {
  if (preflight.integrityIssues.length > 0 || preflight.incompleteJobs.length > 0) {
    throw new Error('scalable review preflight is incomplete');
  }
  const byId = new Map(jobs.map((value) => [value.id, value]));
  const completeSource = new Map(jobs.filter(({ kind }) => kind === 'component')
    .flatMap(({ source }) => source.filter(({ complete }) => complete).map((value) => [value.path, value] as const)));
  return Object.freeze(preflight.proposals.map((value, index) => {
    const sourceJob = byId.get(value.jobId); if (!sourceJob) throw new Error(`proposal job is missing: ${value.jobId}`);
    const proposalSetDigest = sha256Text(canonicalJson({ [value.id]: value.finding }));
    const paths = [...new Set(value.finding.locations.map(({ path }) => path))];
    const source = paths.map((path) => completeSource.get(path) ?? sourceJob.source.find((item) => item.path === path));
    if (source.some((item) => !item)) throw new Error(`verification source is missing: ${value.id}`);
    const unsigned = { id: `verification-${String(index + 1).padStart(6, '0')}`, proposal: value,
      source: source as ScalableReviewJob['source'], policyDigest, proposalSetDigest,
      taskDigest: sha256Text(scalableVerificationTask()) };
    return boundedVerificationJob(unsigned, budget);
  }));
}

type UnsignedVerificationJob = Omit<ScalableVerificationJob, 'digest'>;

function frozenVerificationJob(unsigned: UnsignedVerificationJob): ScalableVerificationJob {
  return Object.freeze({ ...unsigned, digest: sha256Text(canonicalJson(unsigned)) });
}

function lineHints(job: UnsignedVerificationJob, path: string): readonly number[] {
  const source = job.source.find((value) => value.path === path);
  return job.proposal.finding.locations.filter((value) => value.path === path).map((value) => {
    if (value.lineHint !== undefined) return value.lineHint;
    const lines = source?.content.split('\n') ?? [], symbol = value.symbol;
    return symbol ? Math.max(1, lines.findIndex((line) => line.includes(symbol)) + 1) : 1;
  });
}

function withinVerificationBudget(job: ScalableVerificationJob, budget: ScalableVerificationBudget): boolean {
  const measured = reserveReviewRuntimePrompt(buildScalableVerificationDispatchPayload(job), budget.tokenizerEncoding);
  return measured.bytes <= budget.maxPromptBytes && measured.tokens <= budget.maxInputTokens;
}

function boundedVerificationJob(
  unsigned: UnsignedVerificationJob, budget: ScalableVerificationBudget | undefined,
): ScalableVerificationJob {
  let job = frozenVerificationJob(unsigned);
  if (!budget || withinVerificationBudget(job, budget)) return job;
  for (const radius of [64, 32, 16, 8, 4]) {
    const source = unsigned.source.map((value) => scalableReviewSourceExcerpt(
      { path: value.path, content: value.content }, lineHints(unsigned, value.path), radius));
    job = frozenVerificationJob({ ...unsigned, source });
    if (withinVerificationBudget(job, budget)) return job;
  }
  throw new Error(`verification source cannot fit the resolved prompt budget: ${unsigned.id}`);
}

export function scalableVerificationTask(): string {
  return [
    '# KubeClaw scalable semantic verification v1', '',
    'Independently confirm or reject the proposed finding from exact frozen source.',
    'Confirm only when the cited code directly proves the claimed behavior and material impact.',
    'For a confirmed verdict, cite the exact reviewed-source digest for every path named by the proposal locations, even when one path only provides supporting context.',
    'If exact source for any named location is insufficient, return insufficient_evidence instead of confirmed.',
    'Reject style opinions, speculation, absent callers, and unsupported severity.',
    'Return raw JSON matching outputContract.',
  ].join('\n');
}

export function buildScalableVerificationDispatchPayload(
  value: ScalableVerificationJob,
): Readonly<Record<string, unknown>> {
  return Object.freeze({
    protocol: 'kubeclaw.echo-review-scale-verification.v1',
    task: scalableVerificationTask(),
    verification: Object.freeze({ bundleDigest: value.digest, policyDigest: value.policyDigest,
      proposalSetDigest: value.proposalSetDigest, proposals: { [value.proposal.id]: value.proposal.finding },
      source: value.source }),
    outputContract: echoReviewVerificationOutputSchema,
  });
}

interface VerificationDispatchContext {
  readonly agent: string; readonly context: PluginInvocationContext; readonly maxRetries: number;
  readonly deadlineEpochMs: number | undefined;
  readonly beforeDispatch: ReviewExecutionSettings['beforeDispatch'] | undefined;
  readonly expectedRuntime: ReviewRuntimeIdentity;
}

async function dispatchVerificationJob(
  value: ScalableVerificationJob, runtime: VerificationDispatchContext,
): Promise<ScalableVerificationJobResult> {
  const { agent, context, maxRetries, deadlineEpochMs, beforeDispatch } = runtime;
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    assertReviewDeadline(deadlineEpochMs, 'verification');
    try {
      const basePayload = buildScalableVerificationDispatchPayload(value);
      const payload = beforeDispatch?.(basePayload) ?? basePayload;
      const response = await invokeBeforeReviewDeadline(() => context.invoke('runtime.dispatch', {
        operation: 'dispatch', resource: { type: 'runtime.agent', canonicalId: agent },
        payload,
      }), deadlineEpochMs, 'verification');
      const attestation = parseReviewRuntimeAttestation(response.runtimeEvidence);
      assertReviewRuntimeIdentity(attestation, runtime.expectedRuntime);
      const parsed = parseEchoReviewVerificationDispatchResponse(response);
      if (completeVerificationResponse(value, parsed) || attempt === maxRetries) {
        return Object.freeze({ jobId: value.id, parsed, runtime: attestation });
      }
    } catch (error) { if (attempt === maxRetries) throw error; }
  }
  throw new Error(`scalable verification retry state is invalid: ${value.id}`);
}

// eslint-disable-next-line max-params -- The optional checkpoint callback is separate from immutable execution settings.
export async function executeScalableVerificationJobs(
  jobs: readonly ScalableVerificationJob[], agent: string, context: PluginInvocationContext,
  execution: number | ReviewExecutionSettings = 4, expectedRuntime?: ReviewRuntimeIdentity,
  checkpoint?: (result: ScalableVerificationJobResult) => Promise<void>,
): Promise<readonly ScalableVerificationJobResult[]> {
  const { concurrency, maxRetries, deadlineEpochMs, beforeDispatch }
    = resolveReviewExecutionSettings(execution, 'verification');
  const runtime = { agent, context, maxRetries, deadlineEpochMs, beforeDispatch,
    expectedRuntime: expectedRuntime ?? { targetId: agent, runtime: 'subagent', agentId: 'codex',
      model: 'gpt-5.6-terra', thinking: 'high' } };
  const output: ScalableVerificationJobResult[] = [];
  for (let offset = 0; offset < jobs.length; offset += concurrency) {
    assertReviewDeadline(deadlineEpochMs, 'verification');
    const batch = jobs.slice(offset, offset + concurrency);
    output.push(...await Promise.all(batch.map(async (value) => {
      const result = await dispatchVerificationJob(value, runtime);
      await checkpoint?.(result);
      return result;
    })));
  }
  return Object.freeze(output);
}

export function reduceScalableReview(
  verificationJobs: readonly ScalableVerificationJob[], results: readonly ScalableVerificationJobResult[],
): ScalableReviewReduction {
  const byId = uniqueResults(results, 'scalable review reduction');
  const values: ScalableReducedFinding[] = [], incomplete: string[] = [];
  for (const job of verificationJobs) {
    const value = reducedFinding(job, byId.get(job.id));
    if (value) values.push(value); else incomplete.push(job.id);
  }
  const unique = new Map<string, ScalableReducedFinding>(); let duplicateCount = 0;
  for (const value of values.sort((left, right) => compareCodeUnits(left.proposalId, right.proposalId))) {
    if (unique.has(value.fingerprint)) duplicateCount += 1; else unique.set(value.fingerprint, value);
  }
  const reduced = [...unique.values()];
  const unsigned = {
    confirmed: Object.freeze(reduced.filter(({ verification }) => verification === 'confirmed')),
    rejected: Object.freeze(reduced.filter(({ verification }) => verification !== 'confirmed')),
    incomplete: Object.freeze([...new Set(incomplete)].sort()), duplicateCount,
  };
  return Object.freeze({ ...unsigned, digest: sha256Text(canonicalJson(unsigned)) });
}
