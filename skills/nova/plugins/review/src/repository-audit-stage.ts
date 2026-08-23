/* eslint-disable max-lines -- The stage keeps compile, dispatch, cache, and report authority in one auditable transaction. */
import { canonicalJson, sha256Text, type ArtifactRef, type PluginInvocationContext, type StageResult } from '@kubeclaw/plugin-sdk';

import { getReviewPolicyProfile } from './review-policy-profiles.ts';
import { resolveReviewPolicy } from './review-policy-resolver.ts';
import { freezeReviewRevision } from './review-repository.ts';
import { parseReviewSnapshotInventory } from './review-snapshot-inventory.ts';
import { compileScalableReview } from './scalable-review-compiler.ts';
import { RepositoryAuditArtifactCache, RepositoryAuditCacheIntegrityError } from './repository-audit-cache.ts';
import { ReviewContentCacheIntegrityError, runWithReviewCache,
  type ReviewCacheIdentity, type ReviewCacheRun } from './review-content-cache.ts';
import { buildScalableReviewDispatchPayload, expandScalableReviewJob,
  type ScalableReviewJob, type ScalableReviewJobResult } from './scalable-review-jobs.ts';
import { executeScalableReviewJobs } from './scalable-review-execution.ts';
import { buildScalableVerificationDispatchPayload, buildScalableVerificationJobs, executeScalableVerificationJobs,
  preflightScalableReviewResults, reduceScalableReview,
  type ScalableVerificationJob, type ScalableVerificationJobResult } from './scalable-review-verification.ts';
import { compareCodeUnits } from './review-ordering.ts';
import { REVIEW_HARD_LIMITS } from './review-hard-limits.ts';
import { parseRepositoryReviewInput, type ResolvedRepositoryReviewProfile } from './repository-review-profile.ts';
import { repositoryExecutionFacts, repositoryPlanFacts } from './repository-audit-results.ts';
import { estimatedReviewCostUsd, reserveReviewRuntimePrompt,
  ReviewDispatchBudget, type ReviewDispatchPhase } from './review-prompt-budget.ts';
import { assertReviewRuntimeIdentity, reviewRuntimeIdentityDigest,
  type ReviewRuntimeIdentity } from './review-runtime-attestation.ts';

interface AuditInput { readonly reviewProfile: ResolvedRepositoryReviewProfile }
interface AuditConfig {
  readonly agent: string;
  readonly reviewerModel: string;
  readonly reviewerRuntime: ReviewRuntimeIdentity['runtime'];
  readonly reviewerAgentId: string;
  readonly reviewerThinking: string;
  readonly profile: string;
  readonly policy?: unknown;
}
class RepositoryAuditIntegrityError extends Error {}

interface AuditCacheRunSummary {
  readonly identity: ReviewCacheIdentity;
  readonly hits: number;
  readonly misses: number;
  readonly keySetDigest: `sha256:${string}`;
}
interface AuditCacheSummary {
  readonly review: AuditCacheRunSummary;
  readonly verification: AuditCacheRunSummary;
}
interface AuditRuntime {
  readonly cache: RepositoryAuditArtifactCache;
  readonly agent: string;
  readonly context: PluginInvocationContext;
  readonly execution: { readonly concurrency: number; readonly maxRetries: number; readonly deadlineEpochMs: number;
    readonly beforeDispatch: (payload: Readonly<Record<string, unknown>>) => void };
  readonly expectedRuntime: ReviewRuntimeIdentity;
}
interface VerificationAccounting {
  readonly jobs: number; readonly promptBytes: number; readonly inputTokens: number;
  readonly maximumJobBytes: number; readonly maximumJobTokens: number;
  readonly reservedOutputTokens: number; readonly estimatedCostUsd: number; readonly estimatedWallTimeSeconds: number;
}

function blocked(code: string, message: string): StageResult {
  return { schemaVersion: 'stage-result.v2', outcome: 'blocked', reason: { code, message }, artifacts: [] };
}

function parseInput(value: unknown): AuditInput {
  return Object.freeze({ reviewProfile: parseRepositoryReviewInput(value) });
}

function configText(value: unknown, fallback?: string): string {
  const selected = value === undefined ? fallback : value;
  return typeof selected === 'string' ? selected.trim() : '';
}

function stageConfig(context: PluginInvocationContext): AuditConfig {
  const value = context.contract.config;
  const agent = configText(value.agent), reviewerModel = configText(value.reviewerModel);
  const reviewerRuntime = value.reviewerRuntime === undefined ? 'subagent' : value.reviewerRuntime;
  const reviewerAgentId = configText(value.reviewerAgentId, 'codex');
  const reviewerThinking = configText(value.reviewerThinking, 'high');
  const profile = configText(value.profile, 'audit');
  if (!agent || !reviewerModel || !['acp', 'subagent'].includes(String(reviewerRuntime))
    || !reviewerAgentId || !reviewerThinking || !profile) {
    throw new Error('repository audit config is invalid');
  }
  return { agent, reviewerModel, reviewerRuntime: reviewerRuntime as ReviewRuntimeIdentity['runtime'],
    reviewerAgentId, reviewerThinking, profile,
    ...(value.policy === undefined ? {} : { policy: value.policy }) };
}

function artifactRef(value: unknown): ArtifactRef {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new RepositoryAuditIntegrityError('artifact adapter returned invalid output');
  const artifact = (value as Readonly<Record<string, unknown>>).artifact;
  if (!artifact || typeof artifact !== 'object' || Array.isArray(artifact)) throw new RepositoryAuditIntegrityError('artifact adapter returned no artifact');
  return artifact as ArtifactRef;
}

function exactArtifactProducer(artifact: ArtifactRef, context: PluginInvocationContext): boolean {
  const attempt = context.contract.lease?.attempt;
  return Boolean(attempt && artifact.producer.runId === attempt.runId
    && artifact.producer.stageId === attempt.stageId && artifact.producer.attemptId === attempt.attemptId
    && artifact.producer.attemptNumber === attempt.attemptNumber);
}

function assertRepositoryReadBudget(snapshot: ReturnType<typeof parseReviewSnapshotInventory>): void {
  let total = 0;
  for (const file of snapshot.files.filter(({ included }) => included)) {
    if (file.sizeBytes > REVIEW_HARD_LIMITS.repositoryAuditFileBytes) {
      throw new RepositoryAuditIntegrityError(
        `repository source file exceeds read limit: ${file.path}:${file.sizeBytes}:${REVIEW_HARD_LIMITS.repositoryAuditFileBytes}`,
      );
    }
    total += file.sizeBytes;
    if (total > REVIEW_HARD_LIMITS.repositoryAuditSourceBytes) {
      throw new RepositoryAuditIntegrityError(
        `repository source set exceeds read limit: ${total}:${REVIEW_HARD_LIMITS.repositoryAuditSourceBytes}`,
      );
    }
  }
}
// eslint-disable-next-line complexity -- One linear guard validates every field in the frozen-source proof.
function validatedSourceResponse(
  raw: unknown, file: { readonly path: string; readonly objectId: string; readonly sizeBytes: number }, head: string,
): { readonly content: string; readonly digest: string } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new RepositoryAuditIntegrityError(`invalid source response: ${file.path}`);
  }
  const response = raw as Readonly<Record<string, unknown>>;
  if (response.head !== head || response.path !== file.path || response.objectId !== file.objectId
    || response.sizeBytes !== file.sizeBytes || typeof response.content !== 'string'
    || Buffer.byteLength(response.content, 'utf8') !== file.sizeBytes
    || response.digest !== sha256Text(response.content)) {
    throw new RepositoryAuditIntegrityError(`invalid frozen source proof: ${file.path}`);
  }
  return { content: response.content, digest: response.digest as string };
}

async function repositoryDocuments(
  snapshot: ReturnType<typeof parseReviewSnapshotInventory>, revision: Awaited<ReturnType<typeof freezeReviewRevision>>,
  context: PluginInvocationContext,
) {
  const documents = [], sourceDigests = new Map<string, string>();
  for (const file of snapshot.files.filter(({ included }) => included)) {
    const raw = await context.invoke('git.repository.read', {
      operation: 'read_revision_text', resource: { type: 'git.repository.path', canonicalId: file.path },
      payload: { head: revision.head, proof: revision.proof,
        expectedObjectId: file.objectId, expectedSizeBytes: file.sizeBytes,
        maxBytes: REVIEW_HARD_LIMITS.repositoryAuditFileBytes },
    });
    const response = validatedSourceResponse(raw, file, revision.head);
    documents.push(Object.freeze({ path: file.path, content: response.content }));
    sourceDigests.set(file.path, response.digest);
  }
  return { documents: Object.freeze(documents), sourceDigests };
}

async function compileRepositoryAudit(
  parsed: AuditInput, context: PluginInvocationContext,
) {
  const revision = await freezeReviewRevision(context);
  const rawInventory = await context.invoke('git.repository.read', {
      operation: 'inventory_revision', resource: { type: 'git.repository.path', canonicalId: '.' },
      payload: { head: revision.head, proof: revision.proof,
        allowedPrefixes: parsed.reviewProfile.allowedPrefixes, maxPaths: 1_000_000 },
  });
  let snapshot: ReturnType<typeof parseReviewSnapshotInventory>;
  try { snapshot = parseReviewSnapshotInventory(rawInventory as never); } catch (error) {
    throw new RepositoryAuditIntegrityError(error instanceof Error ? error.message : String(error));
  }
  if (snapshot.head !== revision.head) throw new RepositoryAuditIntegrityError('repository audit inventory revision is invalid');
  if (parsed.reviewProfile.scope.kind === 'plugin') {
    const paths = snapshot.files.map(({ path }) => path);
    const missing = parsed.reviewProfile.scope.names.filter((name) => (
      !paths.some((path) => path.startsWith(`skills/nova/plugins/${name}/`))
    ));
    if (missing.length > 0) throw new RepositoryAuditIntegrityError(
      `repository audit plugin scope is missing: ${missing.join(',')}`,
    );
  }
  assertRepositoryReadBudget(snapshot);
  const { documents, sourceDigests } = await repositoryDocuments(snapshot, revision, context);
  let compilation: ReturnType<typeof compileScalableReview>;
  try { compilation = compileScalableReview({ snapshot, documents, sourceDigests,
    budget: parsed.reviewProfile.componentBudget, profile: parsed.reviewProfile }); } catch (error) {
    throw new RepositoryAuditIntegrityError(error instanceof Error ? error.message : String(error));
  }
  return { revision, snapshot, compilation };
}

// eslint-disable-next-line max-lines-per-function, complexity -- This is the fail-closed review and verification transaction.
async function verifiedReduction(
  compilation: ReturnType<typeof compileScalableReview>, config: AuditConfig,
  policyDigest: `sha256:${string}`, context: PluginInvocationContext,
) {
  const cache = new RepositoryAuditArtifactCache(context);
  const expectedRuntime: ReviewRuntimeIdentity = Object.freeze({ targetId: config.agent,
    runtime: config.reviewerRuntime, agentId: config.reviewerAgentId,
    model: config.reviewerModel, thinking: config.reviewerThinking });
  const reviewIdentity = cacheIdentity(policyDigest, expectedRuntime, 'kubeclaw.echo-review-scale.v1');
  const deadlineEpochMs = Date.now() + compilation.profile.maxWallTimeSeconds * 1_000;
  const dispatchBudget = new ReviewDispatchBudget(compilation.profile, deadlineEpochMs);
  const execution = (phase: ReviewDispatchPhase) => ({
    concurrency: compilation.profile.concurrency, maxRetries: compilation.profile.maxRetries,
    deadlineEpochMs,
    beforeDispatch: (payload: Readonly<Record<string, unknown>>) => dispatchBudget.reserve(payload, phase),
  });
  const runtime = { cache, agent: config.agent, context, execution: execution('initial'), expectedRuntime };
  const reviewRun = await cachedReviewJobs(compilation.jobs, reviewIdentity, runtime);
  const firstResults = compilation.jobs.map(({ id }) => reviewRun.values.get(id) as ScalableReviewJobResult);
  const completeSources = new Map(compilation.jobs.filter(({ kind }) => kind === 'component')
    .flatMap(({ source }) => source.filter(({ complete }) => complete).map((value) => [value.path, value] as const)));
  const expandedJobs = compilation.jobs.flatMap((job, index) => {
    const request = firstResults[index]?.parsed.ok ? firstResults[index].parsed.value.contextRequest : undefined;
    return request ? [expandScalableReviewJob(job, request.paths, completeSources)] : [];
  });
  let finalJobs = compilation.jobs, reviewResults = firstResults, reviewRuns = [reviewRun];
  let expansionAccounting: Readonly<{ inputTokens: number; estimatedCostUsd: number; estimatedWallTimeSeconds: number }>
    = Object.freeze({ inputTokens: 0, estimatedCostUsd: 0, estimatedWallTimeSeconds: 0 });
  if (expandedJobs.length > 0) {
    expansionAccounting = enforceExpansionBudget(compilation, expandedJobs);
    const expandedRun = await cachedReviewJobs(expandedJobs, reviewIdentity,
      { ...runtime, execution: execution('context-expansion') });
    const replacement = new Map(expandedJobs.map((job) => [job.id, job]));
    finalJobs = Object.freeze(compilation.jobs.map((job) => replacement.get(job.id) ?? job));
    reviewResults = finalJobs.map((job, index) => (
      replacement.has(job.id) ? expandedRun.values.get(job.id) : firstResults[index]
    ) as ScalableReviewJobResult);
    reviewRuns = [reviewRun, expandedRun];
  }
  const preflight = preflightScalableReviewResults(finalJobs, reviewResults);
  if (preflight.integrityIssues.length > 0 || preflight.incompleteJobs.length > 0) {
    throw new RepositoryAuditIntegrityError(`repository audit review is incomplete: ${canonicalJson(preflight)}`);
  }
  const jobs = buildScalableVerificationJobs(preflight, finalJobs, policyDigest, {
    tokenizerEncoding: compilation.profile.tokenizerEncoding,
    maxPromptBytes: compilation.profile.maxPromptBytesPerJob,
    maxInputTokens: Math.min(compilation.profile.maxInputTokensPerJob,
      compilation.profile.maxContextTokensPerJob - compilation.profile.maxOutputTokensPerJob),
  });
  if (jobs.length > compilation.profile.maxVerificationJobs) {
    throw new RepositoryAuditIntegrityError(
      `repository audit verification job budget exceeded: ${jobs.length}:${compilation.profile.maxVerificationJobs}`,
    );
  }
  const verificationMetrics = jobs.map((job) => reserveReviewRuntimePrompt(
    buildScalableVerificationDispatchPayload(job), compilation.profile.tokenizerEncoding));
  const inputTokens = verificationMetrics.reduce((total, value) => total + value.tokens, 0);
  const reservedOutputTokens = jobs.length * compilation.profile.maxOutputTokensPerJob;
  const verificationAccounting: VerificationAccounting = Object.freeze({
    jobs: jobs.length,
    promptBytes: verificationMetrics.reduce((total, value) => total + value.bytes, 0),
    inputTokens,
    maximumJobBytes: Math.max(0, ...verificationMetrics.map(({ bytes }) => bytes)),
    maximumJobTokens: Math.max(0, ...verificationMetrics.map(({ tokens }) => tokens)),
    reservedOutputTokens,
    estimatedCostUsd: estimatedReviewCostUsd({ inputTokens, outputTokens: reservedOutputTokens,
      inputUsdPerMillionTokens: compilation.profile.inputUsdPerMillionTokens,
      outputUsdPerMillionTokens: compilation.profile.outputUsdPerMillionTokens }),
    estimatedWallTimeSeconds: Math.ceil(jobs.length / compilation.profile.concurrency)
      * compilation.profile.estimatedSecondsPerJob,
  });
  const combinedTokens = compilation.accounting.estimatedInputTokens + expansionAccounting.inputTokens
    + verificationAccounting.inputTokens;
  const combinedCost = compilation.accounting.estimatedCostUsd + expansionAccounting.estimatedCostUsd
    + verificationAccounting.estimatedCostUsd;
  const combinedWall = compilation.accounting.estimatedWallTimeSeconds + expansionAccounting.estimatedWallTimeSeconds
    + verificationAccounting.estimatedWallTimeSeconds;
  if (verificationAccounting.maximumJobBytes > compilation.profile.maxPromptBytesPerJob
    || verificationAccounting.maximumJobTokens > compilation.profile.maxInputTokensPerJob
    || verificationAccounting.maximumJobTokens + compilation.profile.maxOutputTokensPerJob
      > compilation.profile.maxContextTokensPerJob
    || verificationAccounting.inputTokens > compilation.profile.maxVerificationInputTokens
    || combinedTokens > compilation.profile.maxTotalInputTokens
    || combinedCost > compilation.profile.maxEstimatedCostUsd
    || combinedWall > compilation.profile.maxWallTimeSeconds) {
    throw new RepositoryAuditIntegrityError('repository audit verification exceeds the resolved operational budget');
  }
  const verificationIdentity = cacheIdentity(policyDigest, expectedRuntime,
    'kubeclaw.echo-review-scale-verification.v1');
  const verificationRun = await cachedVerificationJobs(jobs, verificationIdentity,
    { ...runtime, execution: execution('verification') });
  const results = jobs.map(({ id }) => verificationRun.values.get(id) as ScalableVerificationJobResult);
  const reduction = reduceScalableReview(jobs, results);
  if (reduction.incomplete.length > 0) {
    throw new RepositoryAuditIntegrityError(`repository audit verification is incomplete: ${reduction.incomplete.join(', ')}`);
  }
  return { reduction, cache, verificationAccounting, dispatchAccounting: dispatchBudget.snapshot(),
    contextExpansions: expandedJobs.length, summary: {
    review: combinedCacheSummary(reviewIdentity, reviewRuns),
    verification: cacheSummary(verificationIdentity, verificationRun),
  } satisfies AuditCacheSummary };
}

async function auditDispatch<T>(label: string, execute: () => Promise<T>): Promise<T> {
  try { return await execute(); } catch (error) {
    throw new RepositoryAuditIntegrityError(
      `repository audit ${label} dispatch failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function enforceExpansionBudget(
  compilation: ReturnType<typeof compileScalableReview>, jobs: readonly ScalableReviewJob[],
): Readonly<{ inputTokens: number; estimatedCostUsd: number; estimatedWallTimeSeconds: number }> {
  if (jobs.length > compilation.profile.maxContextExpansionJobs) {
    throw new RepositoryAuditIntegrityError(
      `repository audit context expansion job budget exceeded: ${jobs.length}:${compilation.profile.maxContextExpansionJobs}`,
    );
  }
  const metrics = jobs.map((job) => reserveReviewRuntimePrompt(
    buildScalableReviewDispatchPayload(job), compilation.profile.tokenizerEncoding));
  const inputTokens = metrics.reduce((total, value) => total + value.tokens, 0);
  const outputTokens = jobs.length * compilation.profile.maxOutputTokensPerJob;
  const cost = estimatedReviewCostUsd({ inputTokens, outputTokens,
    inputUsdPerMillionTokens: compilation.profile.inputUsdPerMillionTokens,
    outputUsdPerMillionTokens: compilation.profile.outputUsdPerMillionTokens });
  const wall = Math.ceil(jobs.length / compilation.profile.concurrency) * compilation.profile.estimatedSecondsPerJob;
  if (Math.max(0, ...metrics.map(({ bytes }) => bytes)) > compilation.profile.maxPromptBytesPerJob
    || Math.max(0, ...metrics.map(({ tokens }) => tokens)) > compilation.profile.maxInputTokensPerJob
    || Math.max(0, ...metrics.map(({ tokens }) => tokens)) + compilation.profile.maxOutputTokensPerJob
      > compilation.profile.maxContextTokensPerJob
    || inputTokens > compilation.profile.maxContextExpansionInputTokens
    || compilation.accounting.estimatedInputTokens + inputTokens > compilation.profile.maxTotalInputTokens
    || compilation.accounting.estimatedCostUsd + cost > compilation.profile.maxEstimatedCostUsd
    || compilation.accounting.estimatedWallTimeSeconds + wall > compilation.profile.maxWallTimeSeconds) {
    throw new RepositoryAuditIntegrityError('repository audit context expansion exceeds the resolved operational budget');
  }
  return Object.freeze({ inputTokens, estimatedCostUsd: cost, estimatedWallTimeSeconds: wall });
}

function exactDispatchResults<T extends { readonly jobId: string }>(
  label: string, expected: readonly { readonly id: string }[], results: readonly T[],
): ReadonlyMap<string, T> {
  const wanted = new Set(expected.map(({ id }) => id)), output = new Map<string, T>();
  for (const result of results) {
    if (!wanted.has(result.jobId)) throw new RepositoryAuditIntegrityError(`${label} returned an unknown job: ${result.jobId}`);
    if (output.has(result.jobId)) throw new RepositoryAuditIntegrityError(`${label} returned a duplicate job: ${result.jobId}`);
    output.set(result.jobId, result);
  }
  if (output.size !== wanted.size) throw new RepositoryAuditIntegrityError(`${label} returned an incomplete job set`);
  return output;
}

async function cachedReviewJobs(
  jobs: readonly ScalableReviewJob[], identity: ReviewCacheIdentity,
  runtime: AuditRuntime,
): Promise<ReviewCacheRun<ScalableReviewJobResult>> {
  const run = await runWithReviewCache(jobs, identity, runtime.cache, async (misses) => {
    const wanted = new Set(misses.map(({ id }) => id));
    const selected = jobs.filter(({ id }) => wanted.has(id));
    const results = await auditDispatch('review', () => executeScalableReviewJobs(
      selected, runtime.agent, runtime.context, runtime.execution, runtime.expectedRuntime,
    ));
    return exactDispatchResults('review dispatch', selected, results);
  });
  run.values.forEach((value) => assertReviewRuntimeIdentity(value.runtime, runtime.expectedRuntime));
  return run;
}

async function cachedVerificationJobs(
  jobs: readonly ScalableVerificationJob[], identity: ReviewCacheIdentity,
  runtime: AuditRuntime,
): Promise<ReviewCacheRun<ScalableVerificationJobResult>> {
  const run = await runWithReviewCache(jobs, identity, runtime.cache, async (misses) => {
    const wanted = new Set(misses.map(({ id }) => id));
    const selected = jobs.filter(({ id }) => wanted.has(id));
    const results = await auditDispatch('verification', () => executeScalableVerificationJobs(
      selected, runtime.agent, runtime.context, runtime.execution, runtime.expectedRuntime,
    ));
    return exactDispatchResults('verification dispatch', selected, results);
  });
  run.values.forEach((value) => assertReviewRuntimeIdentity(value.runtime, runtime.expectedRuntime));
  return run;
}

function cacheIdentity(
  policyDigest: `sha256:${string}`, runtime: ReviewRuntimeIdentity, reviewerProtocol: string,
): ReviewCacheIdentity {
  return Object.freeze({ policyDigest, reviewerProtocol, reviewerModel: runtime.model,
    reviewerRuntimeIdentityDigest: reviewRuntimeIdentityDigest(runtime),
    evidenceVersion: 'repository-review-evidence.v1' });
}

function cacheSummary<T>(identity: ReviewCacheIdentity, run: ReviewCacheRun<T>): AuditCacheRunSummary {
  return Object.freeze({ identity, hits: run.hits, misses: run.misses,
    keySetDigest: sha256Text(canonicalJson([...run.cacheKeys.entries()]
      .sort(([left], [right]) => compareCodeUnits(left, right)))) });
}

function combinedCacheSummary<T>(
  identity: ReviewCacheIdentity, runs: readonly ReviewCacheRun<T>[],
): AuditCacheRunSummary {
  const keys = runs.flatMap((run) => [...run.cacheKeys.entries()])
    .sort(([left], [right]) => compareCodeUnits(left, right));
  return Object.freeze({ identity,
    hits: runs.reduce((total, run) => total + run.hits, 0),
    misses: runs.reduce((total, run) => total + run.misses, 0),
    keySetDigest: sha256Text(canonicalJson(keys)),
  });
}

async function storeRepositoryReport(
  report: Readonly<Record<string, unknown>>, identity: string, context: PluginInvocationContext,
): Promise<ArtifactRef> {
  const expectedId = `repository-review:${identity.slice(7)}`;
  const stored = await context.invoke('artifacts.write', {
    operation: 'put_json', resource: { type: 'artifact.object', canonicalId: expectedId },
    payload: { namespace: 'kubeclaw.review', mediaType: 'application/json', value: report },
  });
  const artifact = artifactRef(stored), serialized = canonicalJson(report);
  if (artifact.artifactId !== expectedId || artifact.namespace !== 'kubeclaw.review'
    || artifact.mediaType !== 'application/json' || artifact.digest !== sha256Text(serialized)
    || artifact.sizeBytes !== Buffer.byteLength(serialized) || !exactArtifactProducer(artifact, context)) {
    throw new RepositoryAuditIntegrityError('artifact adapter returned a repository report reference with invalid identity');
  }
  return artifact;
}

// eslint-disable-next-line max-lines-per-function -- Keeping the plan and execute branches together makes report authority explicit.
async function runRepositoryAudit(
  input: unknown, context: PluginInvocationContext,
): Promise<StageResult> {
    const parsed = parseInput(input), config = stageConfig(context);
    const policy = resolveReviewPolicy({ builtIn: getReviewPolicyProfile(config.profile),
      ...(config.policy === undefined ? {} : { settingsFile: config.policy }) });
    const { revision, snapshot, compilation } = await compileRepositoryAudit(parsed, context);
    if (!compilation.plan.coverage.complete) {
      throw new RepositoryAuditIntegrityError(
        `repository audit coverage is incomplete: ${canonicalJson(compilation.plan.coverage)}`,
      );
    }
    if (parsed.reviewProfile.mode === 'plan') {
      const report = Object.freeze({ schemaVersion: 'repository-review-plan.v1', head: revision.head,
        snapshotDigest: snapshot.digest, compilationDigest: compilation.digest, profile: parsed.reviewProfile,
        accounting: compilation.accounting, map: compilation.artifacts, coverage: compilation.plan.coverage });
      const artifact = await storeRepositoryReport(report, sha256Text(canonicalJson(report)), context);
      return { schemaVersion: 'stage-result.v2', outcome: 'passed', artifacts: [artifact],
        facts: repositoryPlanFacts(revision.head, compilation, artifact.digest) };
    }
    const verified = await verifiedReduction(compilation, config, policy.digest, context);
    const report = Object.freeze({ schemaVersion: 'repository-review-report.v1', head: revision.head,
      snapshotDigest: snapshot.digest, compilationDigest: compilation.digest, map: compilation.artifacts,
      profile: parsed.reviewProfile, accounting: compilation.accounting,
      coverage: compilation.plan.coverage, cache: verified.summary,
      contextExpansions: verified.contextExpansions,
      dispatchAccounting: verified.dispatchAccounting,
      verificationAccounting: verified.verificationAccounting, reduction: verified.reduction });
    const identity = sha256Text(canonicalJson(report));
    const artifact = await storeRepositoryReport(report, identity, context);
    return { schemaVersion: 'stage-result.v2', outcome: 'passed', artifacts: [...verified.cache.artifacts(), artifact],
      facts: repositoryExecutionFacts({ head: revision.head, compilation, reportDigest: artifact.digest,
        confirmed: verified.reduction.confirmed.length, rejected: verified.reduction.rejected.length,
        reviewCacheHits: verified.summary.review.hits, reviewCacheMisses: verified.summary.review.misses,
        verificationCacheHits: verified.summary.verification.hits,
        verificationCacheMisses: verified.summary.verification.misses,
        actualModelCalls: verified.dispatchAccounting.calls,
        reservedInputTokens: verified.dispatchAccounting.reservedInputTokens,
        reservedOutputTokens: verified.dispatchAccounting.reservedOutputTokens,
        reservedEstimatedCostUsd: verified.dispatchAccounting.reservedEstimatedCostUsd,
        contextExpansions: verified.contextExpansions }) };
}

export async function executeRepositoryAudit(input: unknown, context: PluginInvocationContext): Promise<StageResult> {
  try {
    return await runRepositoryAudit(input, context);
  } catch (error) {
    if (!(error instanceof RepositoryAuditIntegrityError
      || error instanceof RepositoryAuditCacheIntegrityError
      || error instanceof ReviewContentCacheIntegrityError)) throw error;
    return blocked('kubeclaw.review.repository_audit_incomplete', error instanceof Error ? error.message : String(error));
  }
}
