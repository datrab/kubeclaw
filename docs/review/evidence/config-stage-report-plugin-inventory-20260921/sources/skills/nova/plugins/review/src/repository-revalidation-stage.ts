/* eslint-disable max-lines -- Artifact validation, bounded dispatch, and backlog construction form one authority. */
import { canonicalJson, sha256Text, type ArtifactRef, type PluginInvocationContext, type StageResult } from '@kubeclaw/plugin-sdk';

import { compileRepositoryAudit } from './repository-audit-stage.ts';
import { parseRepositoryReviewInput } from './repository-review-profile.ts';
import { freezeReviewRevision } from './review-repository.ts';
import { compareCodeUnits } from './review-ordering.ts';
import { ReviewPhaseAdmission, ReviewPhaseAdmissionError } from './review-phase-admission.ts';
import { ReviewDispatchBudget } from './review-prompt-budget.ts';
import { assertReviewRuntimeIdentity, parseReviewRuntimeAttestation,
  type ReviewRuntimeIdentity } from './review-runtime-attestation.ts';
import { parseRepositoryRevalidationResult, repositoryRevalidationOutputSchema,
  type RepositoryRevalidationResult } from './repository-revalidation-contract.ts';
import { blockedReviewStage } from './review-stage-result.ts';
import type { ScalableReviewJob, ScalableReviewSource } from './scalable-review-types.ts';

const REPORT_NAMESPACE = 'kubeclaw.review';
const MAX_BASELINE_BYTES = 128 * 1024 * 1024;
const MAX_BASELINE_RELATIONS = 100_000;
type JsonObject = Readonly<Record<string, unknown>>;
export class RepositoryRevalidationIntegrityError extends Error {}
function integrity<T>(check: () => T): T {
  try { return check(); }
  catch (error) { throw new RepositoryRevalidationIntegrityError(error instanceof Error ? error.message : String(error)); }
}

interface BaselineReference {
  readonly artifactId: string;
  readonly digest: `sha256:${string}`;
  readonly sizeBytes: number;
}
interface BaselineFinding {
  readonly fingerprint: `sha256:${string}`;
  readonly clusterId: `sha256:${string}`;
  readonly finding: JsonObject;
}

function record(value: unknown, label: string): JsonObject {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new RepositoryRevalidationIntegrityError(`${label} is invalid`);
  return value as JsonObject;
}
function text(value: unknown, label: string, maximum = 1024): string {
  if (typeof value !== 'string' || value !== value.trim() || value.length < 1 || value.length > maximum) {
    throw new RepositoryRevalidationIntegrityError(`${label} is invalid`);
  }
  return value;
}
function digest(value: unknown, label: string): `sha256:${string}` {
  const parsed = text(value, label, 71);
  if (!/^sha256:[0-9a-f]{64}$/u.test(parsed)) throw new RepositoryRevalidationIntegrityError(`${label} is invalid`);
  return parsed as `sha256:${string}`;
}
function baselineReference(value: unknown): BaselineReference {
  const source = record(value, 'baselineReport');
  const fields = ['artifactId', 'digest', 'sizeBytes', 'namespace', 'mediaType'];
  if (Object.keys(source).some((field) => !fields.includes(field))
    || source.namespace !== REPORT_NAMESPACE || source.mediaType !== 'application/json') {
    throw new RepositoryRevalidationIntegrityError('baselineReport is invalid');
  }
  const artifactId = text(source.artifactId, 'baselineReport.artifactId', 512);
  if (!artifactId.startsWith('repository-review:')) throw new RepositoryRevalidationIntegrityError('baselineReport.artifactId is invalid');
  if (!Number.isSafeInteger(source.sizeBytes) || Number(source.sizeBytes) < 1
    || Number(source.sizeBytes) > MAX_BASELINE_BYTES) throw new RepositoryRevalidationIntegrityError('baselineReport.sizeBytes is invalid');
  return Object.freeze({ artifactId, digest: digest(source.digest, 'baselineReport.digest'),
    sizeBytes: Number(source.sizeBytes) });
}
function input(value: unknown): { readonly baseline: BaselineReference;
  readonly profile: ReturnType<typeof parseRepositoryReviewInput> } {
  const source = record(value, 'repository revalidation input');
  const allowed = ['baselineReport', 'grade', 'scope', 'overrides'];
  if (Object.keys(source).some((field) => !allowed.includes(field))) throw new RepositoryRevalidationIntegrityError('repository revalidation input has unknown fields');
  return Object.freeze({ baseline: baselineReference(source.baselineReport),
    profile: parseRepositoryReviewInput({ grade: source.grade, scope: source.scope,
      overrides: source.overrides, mode: 'execute' }) });
}
function baselineFindings(value: unknown): { readonly head: string; readonly findings: readonly BaselineFinding[];
  readonly relatedPaths: ReadonlyMap<string, readonly string[]> } {
  const report = record(value, 'baseline repository report');
  if (report.schemaVersion !== 'repository-review-report.v1') throw new RepositoryRevalidationIntegrityError('baseline repository report version is invalid');
  const reduction = record(report.reduction, 'baseline repository report reduction');
  if (!Array.isArray(reduction.confirmed) || reduction.confirmed.length > 2048) {
    throw new RepositoryRevalidationIntegrityError('baseline repository report findings are invalid');
  }
  const findings = reduction.confirmed.map((raw, index) => {
    const item = record(raw, `baseline finding ${index}`), finding = record(item.finding, `baseline finding ${index}.finding`);
    if (!Array.isArray(finding.locations) || finding.locations.length < 1 || finding.locations.length > 64
      || !['P0', 'P1', 'P2', 'P3'].includes(String(finding.priority))) {
      throw new RepositoryRevalidationIntegrityError(`baseline finding ${index} is invalid`);
    }
    for (const [locationIndex, rawLocation] of finding.locations.entries()) {
      const location = record(rawLocation, `baseline finding ${index}.location ${locationIndex}`);
      text(location.path, `baseline finding ${index}.location ${locationIndex}.path`);
    }
    return Object.freeze({ fingerprint: digest(item.fingerprint, `baseline finding ${index}.fingerprint`),
      clusterId: digest(item.clusterId, `baseline finding ${index}.clusterId`), finding });
  });
  const map = record(report.map, 'baseline repository report map');
  const relationsText = typeof map.relationsJsonl === 'string' ? map.relationsJsonl : '';
  if (Buffer.byteLength(relationsText, 'utf8') > MAX_BASELINE_BYTES) throw new RepositoryRevalidationIntegrityError('baseline relation map is too large');
  const relationLines = relationsText.split('\n').filter(Boolean);
  if (relationLines.length > MAX_BASELINE_RELATIONS) throw new RepositoryRevalidationIntegrityError('baseline relation count is too large');
  const relationIndex = new Map<string, Set<string>>();
  relationLines.forEach((line, index) => {
    const relation = record(JSON.parse(line), `baseline relation ${index}`);
    const from = text(relation.from, `baseline relation ${index}.from`);
    const to = text(relation.to, `baseline relation ${index}.to`);
    if (!relationIndex.has(from)) relationIndex.set(from, new Set());
    if (!relationIndex.has(to)) relationIndex.set(to, new Set());
    relationIndex.get(from)?.add(to);
    relationIndex.get(to)?.add(from);
  });
  const relatedPaths = new Map([...relationIndex.entries()].map(([path, related]) =>
    [path, Object.freeze([...related].sort(compareCodeUnits))] as const));
  return Object.freeze({ head: text(report.head, 'baseline repository report head', 64),
    findings: Object.freeze(findings), relatedPaths });
}
async function readBaseline(reference: BaselineReference, context: PluginInvocationContext) {
  const response = record(await context.invoke('artifacts.read', {
    operation: 'get_json', resource: { type: 'artifact.object', canonicalId: reference.artifactId },
    payload: { namespace: REPORT_NAMESPACE, digest: reference.digest },
  }), 'baseline report read response');
  const serialized = canonicalJson(response.value);
  if (response.digest !== reference.digest || response.sizeBytes !== reference.sizeBytes
    || sha256Text(serialized) !== reference.digest || Buffer.byteLength(serialized) !== reference.sizeBytes) {
    throw new RepositoryRevalidationIntegrityError('baseline repository report proof is invalid');
  }
  return integrity(() => baselineFindings(response.value));
}

function runtimeIdentity(context: PluginInvocationContext): { readonly target: string; readonly identity: ReviewRuntimeIdentity } {
  const config = context.contract.config;
  const target = text(config.agent, 'config.agent');
  return Object.freeze({ target, identity: Object.freeze({ targetId: target,
    runtime: (config.reviewerRuntime ?? 'subagent') as ReviewRuntimeIdentity['runtime'],
    agentId: text(config.reviewerAgentId ?? 'codex', 'config.reviewerAgentId'),
    model: text(config.reviewerModel, 'config.reviewerModel'),
    thinking: text(config.reviewerThinking ?? 'high', 'config.reviewerThinking'),
  }) });
}

function findingLocations(finding: JsonObject): readonly string[] {
  return Object.freeze([...new Set((finding.locations as readonly unknown[])
    .map((location) => text(record(location, 'finding location').path, 'finding location path')))].sort(compareCodeUnits));
}
function relatedPaths(finding: BaselineFinding, relationIndex: ReadonlyMap<string, readonly string[]>) {
  const located = new Set(findingLocations(finding.finding));
  return Object.freeze([...new Set([...located].flatMap((path) => relationIndex.get(path) ?? []))]
    .sort(compareCodeUnits));
}
function selectedSources(finding: BaselineFinding, jobs: readonly ScalableReviewJob[], related: readonly string[]) {
  const paths = new Set(findingLocations(finding.finding));
  const navigation = new Set([...paths, ...related]);
  const names = new Set([...paths].map((path) => path.split('/').at(-1)));
  const matching = jobs.filter(({ source }) => source.some((item) => navigation.has(item.path)
    || names.has(item.path.split('/').at(-1))));
  const sources = new Map<string, ScalableReviewSource>();
  for (const job of matching) for (const source of job.source) sources.set(String(source.path), source);
  return Object.freeze([...sources.values()].sort((left, right) => {
    const exact = Number(paths.has(String(right.path))) - Number(paths.has(String(left.path)));
    return exact || compareCodeUnits(String(left.path), String(right.path));
  }).slice(0, 64));
}
function revalidationTask(): string {
  return [
    '# KubeClaw repository finding revalidation v1', '',
    'Revalidate one previously confirmed finding against the exact newer revision and supplied source.',
    'currentPathStates is the authoritative current frozen-inventory proof for in-scope original paths; state=absent proves absence but not that behavior was not moved, while state=outside-scope makes no presence claim.',
    'Confirm the named path and symbol, trace callers and reachable behavior in supplied related files, check whether the fix already exists, and run the narrowest applicable validation command.',
    'Use accepted_current only when current source and a reachable path still prove the claim.',
    'Use already_fixed when later code removes the behavior, rejected when the original claim is disproved, needs_additional_reproduction when source is insufficient, or superseded_by_shared_root_cause when another fingerprint owns the same root cause.',
    'Cite only supplied current-source digests. Return raw JSON matching outputContract.',
  ].join('\n');
}
function payload(finding: BaselineFinding, baselineHead: string, targetHead: string,
  sources: readonly ScalableReviewSource[], pathStates: readonly JsonObject[],
  relationshipCandidates: readonly JsonObject[]) {
  return Object.freeze({ protocol: 'kubeclaw.repository-finding-revalidation.v1', task: revalidationTask(),
    revalidation: Object.freeze({ baselineHead, targetHead, findingFingerprint: finding.fingerprint,
      clusterId: finding.clusterId, finding: finding.finding, currentPathStates: pathStates,
      currentSource: sources, relationshipCandidates }),
    outputContract: repositoryRevalidationOutputSchema });
}

async function dispatchOne(values: { readonly finding: BaselineFinding; readonly baselineHead: string;
  readonly targetHead: string; readonly sources: readonly ScalableReviewSource[]; readonly target: string;
  readonly pathStates: readonly JsonObject[];
  readonly relationshipCandidates: readonly JsonObject[];
  readonly expectedRuntime: ReviewRuntimeIdentity; readonly context: PluginInvocationContext;
  readonly budget: ReviewDispatchBudget; readonly admission: ReviewPhaseAdmission; readonly maxRetries: number }): Promise<RepositoryRevalidationResult> {
  const sourceEvidence = new Map(values.sources.map((source) => [source.path,
    { digest: source.digest, ranges: source.ranges }]));
  let lastError: unknown;
  for (let attempt = 0; attempt <= values.maxRetries; attempt += 1) {
    if (attempt > 0) values.admission.retry();
    try {
      const requestPayload = values.budget.reserve(payload(values.finding, values.baselineHead,
        values.targetHead, values.sources, values.pathStates, values.relationshipCandidates), 'verification');
      const response = record(await values.context.invoke('runtime.dispatch', withRuntimeDispatchProfile({ operation: 'dispatch',
        resource: { type: 'runtime.agent', canonicalId: values.target },
        payload: Object.freeze({ ...requestPayload, runtimeDispatchAttempt: attempt }) }, values.context.contract.runtimeDispatchProfile)), 'runtime dispatch response');
      return integrity(() => {
      const attestation = parseReviewRuntimeAttestation(response.runtimeEvidence);
      assertReviewRuntimeIdentity(attestation, values.expectedRuntime);
      return parseRepositoryRevalidationResult(response.result, { fingerprint: values.finding.fingerprint,
        targetHead: values.targetHead, sources: sourceEvidence,
        relationshipFingerprints: new Set(values.relationshipCandidates.map((candidate) => String(candidate.fingerprint))) });
      });
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('EFFECT_OUTCOME_UNRESOLVED:')) throw error;
      lastError = error;
    }
  }
  throw lastError;
}

function ownership(path: string): Readonly<{ owner: string; package: string }> {
  const parts = path.split('/');
  if (parts[0] === 'skills' && parts[2] === 'plugins' && parts[3]) {
    return Object.freeze({ owner: `skills/${parts[1]}`, package: parts[3] });
  }
  if (parts[0] === 'cmd' && parts[1]) return Object.freeze({ owner: 'cmd', package: parts[1] });
  if (parts[0] === 'charts' && parts[1]) return Object.freeze({ owner: 'charts', package: parts[1] });
  return Object.freeze({ owner: parts[0] ?? '.', package: parts.slice(0, 2).join('/') || '.' });
}
function inProfileScope(path: string, prefixes: readonly string[]): boolean {
  return prefixes.some((prefix) => {
    if (prefix === '.') return true;
    const normalized = prefix.replace(/\/$/u, '');
    return path === normalized || path.startsWith(`${normalized}/`);
  });
}
function relationshipCandidates(finding: BaselineFinding, candidates: readonly BaselineFinding[]): readonly JsonObject[] {
  const paths = new Set(findingLocations(finding.finding));
  return Object.freeze(candidates.filter((candidate) => candidate.fingerprint !== finding.fingerprint
    && (candidate.clusterId === finding.clusterId
      || findingLocations(candidate.finding).some((path) => paths.has(path))))
    .slice(0, 64).map((candidate) => Object.freeze({ fingerprint: candidate.fingerprint,
      clusterId: candidate.clusterId, priority: candidate.finding.priority,
      claim: candidate.finding.claim, locations: candidate.finding.locations })));
}
export function buildRepositoryRevalidationBacklog(
  baseline: { readonly head: string; readonly findings: readonly BaselineFinding[] },
  targetHead: string, results: readonly RepositoryRevalidationResult[], usage: ReturnType<ReviewDispatchBudget['snapshot']>) {
  const byFingerprint = new Map(baseline.findings.map((finding) => [finding.fingerprint, finding]));
  const resultByFingerprint = new Map(results.map((result) => [result.findingFingerprint, result]));
  for (const result of results) {
    for (const dependency of result.remediationDependencies) {
      const dependencyResult = resultByFingerprint.get(dependency);
      if (dependency === result.findingFingerprint || !byFingerprint.has(dependency)
        || dependencyResult?.disposition !== 'accepted_current') {
        throw new RepositoryRevalidationIntegrityError('repository revalidation remediation dependency is invalid');
      }
    }
  }
  const visiting = new Set<`sha256:${string}`>(), visited = new Set<`sha256:${string}`>();
  const visit = (fingerprint: `sha256:${string}`): void => {
    if (visiting.has(fingerprint)) throw new RepositoryRevalidationIntegrityError('repository revalidation remediation dependency cycle is invalid');
    if (visited.has(fingerprint)) return;
    visiting.add(fingerprint);
    for (const dependency of resultByFingerprint.get(fingerprint)?.remediationDependencies ?? []) visit(dependency);
    visiting.delete(fingerprint); visited.add(fingerprint);
  };
  results.forEach(({ findingFingerprint }) => visit(findingFingerprint));
  const items = results.map((result) => {
    const original = byFingerprint.get(result.findingFingerprint) as BaselineFinding;
    if (result.supersededBy !== undefined) {
      const target = byFingerprint.get(result.supersededBy);
      const targetResult = resultByFingerprint.get(result.supersededBy);
      if (!target || target.fingerprint === original.fingerprint || target.clusterId !== original.clusterId
        || targetResult?.disposition !== 'accepted_current') {
        throw new RepositoryRevalidationIntegrityError('repository revalidation supersession target is invalid');
      }
    }
    const firstPath = result.evidence[0]?.path ?? findingLocations(original.finding)[0] as string;
    return Object.freeze({ findingFingerprint: result.findingFingerprint, rootCauseId: original.clusterId,
      severity: original.finding.priority, category: original.finding.category, ...ownership(firstPath),
      disposition: result.disposition, reason: result.reason, evidence: result.evidence,
      validationCommands: result.validationCommands,
      remediationDependencies: result.remediationDependencies,
      ...(result.supersededBy === undefined ? {} : { supersededBy: result.supersededBy }) });
  }).sort((left, right) => compareCodeUnits(String(left.findingFingerprint), String(right.findingFingerprint)));
  const roots = [...new Set(items.map(({ rootCauseId }) => rootCauseId))].sort(compareCodeUnits).map((rootCauseId) =>
    Object.freeze({ rootCauseId, findingFingerprints: Object.freeze(items.filter((item) => item.rootCauseId === rootCauseId)
      .map(({ findingFingerprint }) => findingFingerprint)) }));
  return Object.freeze({ schemaVersion: 'repository-revalidation-backlog.v1', baselineHead: baseline.head, targetHead,
    items: Object.freeze(items), rootCauses: Object.freeze(roots), usage });
}

function artifact(value: unknown): ArtifactRef {
  return record(value, 'artifact response').artifact as ArtifactRef;
}
async function storeBacklog(value: JsonObject, context: PluginInvocationContext): Promise<ArtifactRef> {
  const serialized = canonicalJson(value), valueDigest = sha256Text(serialized);
  const artifactId = `repository-revalidation:${valueDigest.slice(7)}`;
  const response = await context.invoke('artifacts.write', { operation: 'put_json',
    resource: { type: 'artifact.object', canonicalId: artifactId },
    payload: { namespace: REPORT_NAMESPACE, mediaType: 'application/json', value } });
  const result = artifact(response), attempt = context.contract.lease?.attempt;
  if (!result || result.artifactId !== artifactId || result.namespace !== REPORT_NAMESPACE
    || result.mediaType !== 'application/json' || result.digest !== valueDigest
    || result.sizeBytes !== Buffer.byteLength(serialized) || !attempt
    || result.producer.runId !== attempt.runId || result.producer.stageId !== attempt.stageId
    || result.producer.attemptId !== attempt.attemptId) throw new RepositoryRevalidationIntegrityError('repository revalidation artifact proof is invalid');
  return result;
}

async function run(value: unknown, context: PluginInvocationContext): Promise<StageResult> {
  const parsed = integrity(() => input(value)), baseline = await readBaseline(parsed.baseline, context);
  const revision = await freezeReviewRevision(context);
  const ancestry = record(await context.invoke('git.repository.read', { operation: 'verify_ancestry',
    resource: { type: 'git.repository.path', canonicalId: '.' }, payload: { base: baseline.head,
      head: revision.head, proof: revision.proof } }), 'repository ancestry response');
  if (ancestry.base !== baseline.head || ancestry.head !== revision.head || ancestry.ancestryVerified !== true) {
    throw new RepositoryRevalidationIntegrityError('repository revalidation ancestry proof is invalid');
  }
  const current = await compileRepositoryAudit({ reviewProfile: parsed.profile }, context, revision);
  const runtime = integrity(() => runtimeIdentity(context)), budget = new ReviewDispatchBudget(parsed.profile, Date.now()
    + parsed.profile.maxWallTimeSeconds * 1000);
  const inScope = baseline.findings.filter((finding) => findingLocations(finding.finding)
    .some((path) => inProfileScope(path, parsed.profile.allowedPrefixes)));
  ReviewPhaseAdmission.requireJobs(inScope.length, parsed.profile.maxVerificationJobs);
  const admission = new ReviewPhaseAdmission(parsed.profile.maxRetryAttemptsPerPhase);
  const scopedBaseline = Object.freeze({ ...baseline, findings: Object.freeze(inScope) });
  const currentFiles = new Map(current.snapshot.files.map((file) => [file.path, file]));
  const results: RepositoryRevalidationResult[] = [];
  for (let offset = 0; offset < inScope.length; offset += parsed.profile.concurrency) {
    const wave = inScope.slice(offset, offset + parsed.profile.concurrency);
    results.push(...await Promise.all(wave.map((finding) => dispatchOne({ finding, baselineHead: baseline.head,
      targetHead: revision.head,
      sources: selectedSources(finding, current.compilation.jobs, relatedPaths(finding, baseline.relatedPaths)),
      pathStates: findingLocations(finding.finding).map((path) => inProfileScope(path, parsed.profile.allowedPrefixes)
        ? Object.freeze({ path, state: currentFiles.has(path) ? 'present' : 'absent',
          ...(currentFiles.has(path) ? { objectId: currentFiles.get(path)?.objectId } : {}) })
        : Object.freeze({ path, state: 'outside-scope' })),
      relationshipCandidates: relationshipCandidates(finding, inScope),
      target: runtime.target,
      expectedRuntime: runtime.identity, context, budget, admission, maxRetries: parsed.profile.maxRetries }))));
  }
  const report = buildRepositoryRevalidationBacklog(scopedBaseline, revision.head, results, budget.snapshot());
  const stored = await storeBacklog(report, context);
  const dispositionCounts = Object.fromEntries([...new Set(results.map(({ disposition }) => disposition))]
    .map((disposition) => [disposition, results.filter((result) => result.disposition === disposition).length]));
  return { schemaVersion: 'stage-result.v2', outcome: 'passed', artifacts: [stored], facts: {
    'review.revalidation_baseline_head': baseline.head, 'review.revalidation_target_head': revision.head,
    'review.revalidation_findings': results.length, 'review.revalidation_backlog_digest': stored.digest,
    ...Object.fromEntries(Object.entries(dispositionCounts).map(([key, count]) => [`review.revalidation_${key}`, count])),
  } };
}

export async function executeRepositoryRevalidation(value: unknown, context: PluginInvocationContext): Promise<StageResult> {
  try { return await run(value, context); }
  catch (error) {
    if (!(error instanceof RepositoryRevalidationIntegrityError) && !(error instanceof ReviewPhaseAdmissionError)) throw error;
    return blockedReviewStage('kubeclaw.review.repository_revalidation_incomplete', error.message);
  }
}
import { withRuntimeDispatchProfile } from '@kubeclaw/plugin-sdk';
