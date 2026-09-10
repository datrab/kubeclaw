/* eslint-disable max-lines -- The stage keeps compile, dispatch, cache, and report authority in one auditable transaction. */
import { canonicalJson, sha256Text, type ArtifactRef, type PluginInvocationContext, type StageResult } from '@kubeclaw/plugin-sdk';

import { reusableReviewResult, selectedReviewIncomplete } from './review-completion.ts';
import { ReviewPhaseAdmission } from './review-phase-admission.ts';
import { getReviewPolicyProfile } from './review-policy-profiles.ts';
import { resolveReviewPolicy } from './review-policy-resolver.ts';
import { freezeReviewRevision } from './review-repository.ts';
import { parseReviewSnapshotInventory } from './review-snapshot-inventory.ts';
import { compileScalableReview, type ScalableReviewCompilation } from './scalable-review-compiler.ts';
import { RepositoryAuditArtifactCache, RepositoryAuditCacheIntegrityError } from './repository-audit-cache.ts';
import { ReviewContentCacheIntegrityError, runWithReviewCache,
  type ReviewCacheIdentity, type ReviewCacheRun } from './review-content-cache.ts';
import { buildScalableReviewDispatchPayload, expandScalableReviewJob,
  type ScalableReviewJob, type ScalableReviewJobResult, type ScalableReviewSource } from './scalable-review-jobs.ts';
import { executeScalableReviewJobs } from './scalable-review-execution.ts';
import { buildScalableVerificationDispatchPayload, buildScalableVerificationJobs, executeScalableVerificationJobs,
  preflightScalableReviewResults, reduceScalableReview,
  type ScalableVerificationJob, type ScalableVerificationJobResult } from './scalable-review-verification.ts';
import { compareCodeUnits } from './review-ordering.ts';
import { REVIEW_HARD_LIMITS } from './review-hard-limits.ts';
import { buildReviewInventoryLookup } from './review-inventory-lookup.ts';
import { parseRepositoryReviewInput, type ResolvedRepositoryReviewProfile } from './repository-review-profile.ts';
import { repositoryCompleteness, repositoryExecutionFacts, repositoryPlanFacts,
  repositoryUsageAccounting } from './repository-audit-results.ts';
import { estimatedReviewCostUsd, reserveReviewAttempts, reserveReviewRuntimePrompt, selectFittingCandidates,
  ReviewDispatchBudget, type ReviewDispatchPhase } from './review-prompt-budget.ts';
import { assertReviewRuntimeIdentity, ReviewRuntimeAttestationError, reviewRuntimeIdentityDigest,
  type ReviewRuntimeIdentity } from './review-runtime-attestation.ts';
import { blockedReviewStage } from './review-stage-result.ts';

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
class RepositoryAuditInfrastructureError extends Error {}

const PREPARED_PLAN_PREFIX = 'repository-review-prepared:';
const REVIEW_NAMESPACE = 'kubeclaw.review';

interface PreparedRepositoryReview {
  readonly schemaVersion: 'repository-review-prepared-plan.v1';
  readonly head: string;
  readonly profileDigest: `sha256:${string}`;
  readonly snapshot: ReturnType<typeof parseReviewSnapshotInventory>;
  readonly compilation: ScalableReviewCompilation;
}

interface AuditCacheRunSummary {
  readonly identity: ReviewCacheIdentity;
  readonly hits: number;
  readonly misses: number;
  readonly keySetDigest: `sha256:${string}`;
}
interface AuditCacheSummary {
  readonly review: AuditCacheRunSummary;
  readonly initialReview: AuditCacheRunSummary;
  readonly contextExpansion: AuditCacheRunSummary;
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
interface DispatchAccountingSnapshot {
  readonly calls: number;
  readonly reservedPromptBytes: number;
  readonly modelPayloadBytes: number;
  readonly reservedInputTokens: number;
  readonly reservedOutputTokens: number;
  readonly reservedEstimatedCostUsd: number;
  readonly initialCalls: number;
  readonly contextExpansionCalls: number;
  readonly verificationCalls: number;
  readonly initialPromptBytes: number;
  readonly contextExpansionPromptBytes: number;
  readonly verificationPromptBytes: number;
  readonly initialPayloadBytes: number;
  readonly contextExpansionPayloadBytes: number;
  readonly verificationPayloadBytes: number;
  readonly initialInputTokens: number;
  readonly contextExpansionInputTokens: number;
  readonly verificationInputTokens: number;
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
  allowedPrefixes: readonly string[],
  context: PluginInvocationContext,
) {
  const documents = [], sourceDigests = new Map<string, string>();
  for (const file of snapshot.files.filter(({ included }) => included)) {
    const raw = await context.invoke('git.repository.read', {
      operation: 'read_revision_text', resource: { type: 'git.repository.path', canonicalId: file.path },
      payload: { head: revision.head, proof: revision.proof,
        allowedPrefixes,
        expectedObjectId: file.objectId, expectedSizeBytes: file.sizeBytes,
        maxBytes: REVIEW_HARD_LIMITS.repositoryAuditFileBytes },
    });
    const response = validatedSourceResponse(raw, file, revision.head);
    documents.push(Object.freeze({ path: file.path, content: response.content }));
    sourceDigests.set(file.path, response.digest);
  }
  return { documents: Object.freeze(documents), sourceDigests };
}

export async function compileRepositoryAudit(
  parsed: AuditInput, context: PluginInvocationContext,
  revision: Awaited<ReturnType<typeof freezeReviewRevision>>,
) {
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
  const { documents, sourceDigests } = await repositoryDocuments(
    snapshot, revision, parsed.reviewProfile.allowedPrefixes, context,
  );
  let compilation: ReturnType<typeof compileScalableReview>;
  try { compilation = compileScalableReview({ snapshot, documents, sourceDigests,
    budget: parsed.reviewProfile.componentBudget, profile: executionProfile(parsed.reviewProfile) }); } catch (error) {
    throw new RepositoryAuditIntegrityError(error instanceof Error ? error.message : String(error));
  }
  return { revision, snapshot, compilation };
}

type CompiledRepositoryAudit = Awaited<ReturnType<typeof compileRepositoryAudit>>;

function executionProfile(profile: ResolvedRepositoryReviewProfile): ResolvedRepositoryReviewProfile {
  if (profile.mode === 'execute') return profile;
  const { digest: _digest, mode: _mode, ...values } = profile;
  const unsigned = { ...values, mode: 'execute' as const };
  return Object.freeze({ ...unsigned, digest: sha256Text(canonicalJson(unsigned)) });
}

function preparedPlanId(head: string, profile: ResolvedRepositoryReviewProfile): string {
  return `${PREPARED_PLAN_PREFIX}${sha256Text(canonicalJson({ head, profileDigest: executionProfile(profile).digest })).slice(7)}`;
}

function compilationDigest(compilation: ScalableReviewCompilation): `sha256:${string}` {
  return sha256Text(canonicalJson({ schemaVersion: compilation.schemaVersion,
    snapshotDigest: compilation.snapshotDigest, graphDigest: compilation.graph.digest,
    coverageDigest: compilation.plan.coverage.digest,
    jobDigests: compilation.jobs.map(({ digest }) => digest),
    mapDigest: compilation.artifacts.manifest.digest, profileDigest: compilation.profile.digest,
    accountingDigest: compilation.accounting.digest }));
}

// eslint-disable-next-line complexity -- Every signed compilation identity is checked before hydrated source reuse.
function validatedPreparedPlan(
  value: unknown, head: string, profile: ResolvedRepositoryReviewProfile,
): PreparedRepositoryReview {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new RepositoryAuditIntegrityError('prepared repository review is invalid');
  }
  const prepared = value as PreparedRepositoryReview;
  const expectedProfile = executionProfile(profile);
  if (prepared.schemaVersion !== 'repository-review-prepared-plan.v1' || prepared.head !== head
    || prepared.profileDigest !== expectedProfile.digest || !prepared.snapshot || !prepared.compilation
    || prepared.snapshot.head !== head || prepared.compilation.snapshotDigest !== prepared.snapshot.digest
    || prepared.compilation.profile.digest !== expectedProfile.digest
    || prepared.compilation.digest !== compilationDigest(prepared.compilation)) {
    throw new RepositoryAuditIntegrityError('prepared repository review proof is invalid');
  }
  return prepared;
}

// eslint-disable-next-line complexity -- Selection and storage proof validation intentionally share one fail-closed read boundary.
async function readPreparedPlan(
  head: string, profile: ResolvedRepositoryReviewProfile, context: PluginInvocationContext,
): Promise<{ readonly prepared: PreparedRepositoryReview; readonly artifact: ArtifactRef } | undefined> {
  const attempt = context.contract.lease?.attempt;
  if (!attempt) throw new RepositoryAuditIntegrityError('prepared repository review requires an attempt identity');
  const artifactId = preparedPlanId(head, profile);
  const candidates = (context.contract.artifacts ?? []).filter((artifact) => artifact.artifactId === artifactId
    && artifact.namespace === REVIEW_NAMESPACE && artifact.mediaType === 'application/json'
    && artifact.producer.runId === attempt.runId);
  if (candidates.length === 0) return undefined;
  const digests = new Set(candidates.map(({ digest }) => digest));
  if (digests.size !== 1) throw new RepositoryAuditIntegrityError('prepared repository review artifacts conflict');
  const artifact = candidates[0] as ArtifactRef;
  const raw = await context.invoke('artifacts.read', {
    operation: 'get_json', resource: { type: 'artifact.object', canonicalId: artifactId },
    payload: { namespace: REVIEW_NAMESPACE, digest: artifact.digest },
  });
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new RepositoryAuditIntegrityError('prepared repository review adapter response is invalid');
  }
  const response = raw as Readonly<Record<string, unknown>>, serialized = canonicalJson(response.value);
  if (response.digest !== artifact.digest || response.sizeBytes !== artifact.sizeBytes
    || sha256Text(serialized) !== artifact.digest || Buffer.byteLength(serialized) !== artifact.sizeBytes) {
    throw new RepositoryAuditIntegrityError('prepared repository review artifact proof is invalid');
  }
  return { prepared: validatedPreparedPlan(response.value, head, profile), artifact };
}

async function writePreparedPlan(
  revision: Awaited<ReturnType<typeof freezeReviewRevision>>,
  snapshot: ReturnType<typeof parseReviewSnapshotInventory>, compilation: ScalableReviewCompilation,
  profile: ResolvedRepositoryReviewProfile, context: PluginInvocationContext,
): Promise<ArtifactRef> {
  const value: PreparedRepositoryReview = Object.freeze({
    schemaVersion: 'repository-review-prepared-plan.v1', head: revision.head,
    profileDigest: executionProfile(profile).digest, snapshot, compilation,
  });
  const artifactId = preparedPlanId(revision.head, profile), serialized = canonicalJson(value);
  const stored = await context.invoke('artifacts.write', {
    operation: 'put_json', resource: { type: 'artifact.object', canonicalId: artifactId },
    payload: { namespace: REVIEW_NAMESPACE, mediaType: 'application/json', checkpoint: true, value },
  });
  const artifact = artifactRef(stored);
  if (artifact.artifactId !== artifactId || artifact.namespace !== REVIEW_NAMESPACE
    || artifact.mediaType !== 'application/json' || artifact.digest !== sha256Text(serialized)
    || artifact.sizeBytes !== Buffer.byteLength(serialized) || !exactArtifactProducer(artifact, context)) {
    throw new RepositoryAuditIntegrityError('prepared repository review artifact identity is invalid');
  }
  return artifact;
}

async function preparedRepositoryAudit(
  parsed: AuditInput, context: PluginInvocationContext,
): Promise<CompiledRepositoryAudit & { readonly artifact: ArtifactRef }> {
  const revision = await freezeReviewRevision(context);
  const available = await readPreparedPlan(revision.head, parsed.reviewProfile, context);
  if (available) return { revision, snapshot: available.prepared.snapshot,
    compilation: available.prepared.compilation, artifact: available.artifact };
  const compiled = await compileRepositoryAudit(parsed, context, revision);
  const artifact = await writePreparedPlan(compiled.revision, compiled.snapshot, compiled.compilation,
    parsed.reviewProfile, context);
  return { ...compiled, artifact };
}

// eslint-disable-next-line max-lines-per-function, complexity -- This is the fail-closed review and verification transaction.
async function verifiedReduction(
  prepared: CompiledRepositoryAudit, config: AuditConfig,
  policyDigest: `sha256:${string}`, context: PluginInvocationContext,
) {
  const { compilation, revision, snapshot } = prepared;
  const cache = new RepositoryAuditArtifactCache(context);
  const expectedRuntime: ReviewRuntimeIdentity = Object.freeze({ targetId: config.agent,
    runtime: config.reviewerRuntime, agentId: config.reviewerAgentId,
    model: config.reviewerModel, thinking: config.reviewerThinking });
  const reviewIdentity = cacheIdentity(policyDigest, expectedRuntime, 'kubeclaw.echo-review-scale.v1');
  const deadlineEpochMs = Date.now() + compilation.profile.maxWallTimeSeconds * 1_000;
  const dispatchBudget = new ReviewDispatchBudget(compilation.profile, deadlineEpochMs);
  const execution = (phase: ReviewDispatchPhase) => {
    const admission = new ReviewPhaseAdmission(compilation.profile.maxRetryAttemptsPerPhase);
    return {
    concurrency: compilation.profile.concurrency, maxRetries: compilation.profile.maxRetries,
    deadlineEpochMs,
    beforeDispatch: (payload: Readonly<Record<string, unknown>>) => dispatchBudget.reserve(payload, phase),
    beforeRetry: () => admission.retry(),
  }; };
  const runtime = { cache, agent: config.agent, context, execution: execution('initial'), expectedRuntime };
  const reviewRun = await cachedReviewJobs(compilation.jobs, reviewIdentity, runtime);
  const firstResults = compilation.jobs.map(({ id }) => reviewRun.values.get(id) as ScalableReviewJobResult);
  const completeSources = new Map<string, ScalableReviewSource>(compilation.jobs.filter(({ kind }) => kind === 'component')
    .flatMap(({ source }) => source.filter(({ complete }) => complete).map((value) => [value.path, value] as const)));
  const requestedPaths = [...new Set(compilation.jobs.flatMap((job, index) => {
    const request = firstResults[index]?.parsed.ok ? firstResults[index].parsed.value.contextRequest : undefined;
    return request?.paths ?? [];
  }))].sort(compareCodeUnits);
  const inventoryLookup = buildReviewInventoryLookup(snapshot.files);
  const resolvedRequests = new Map<string, readonly string[]>();
  for (const requestedPath of requestedPaths) {
    const files = inventoryLookup.resolve(requestedPath);
    if (files.length === 0 || files.some(({ mode, sizeBytes }) => !/^100[0-7]{3}$/u.test(mode)
      || sizeBytes > REVIEW_HARD_LIMITS.repositoryAuditFileBytes)) {
      throw new RepositoryAuditIntegrityError(`scalable review requested source is unavailable: ${requestedPath}`);
    }
    resolvedRequests.set(requestedPath, Object.freeze(files.map(({ path }) => path).sort(compareCodeUnits)));
    for (const file of files) {
      if (completeSources.has(file.path)) continue;
      const raw = await context.invoke('git.repository.read', {
        operation: 'read_revision_text', resource: { type: 'git.repository.path', canonicalId: file.path },
        payload: { head: revision.head, proof: revision.proof,
          allowedPrefixes: compilation.profile.allowedPrefixes, expectedObjectId: file.objectId,
          expectedSizeBytes: file.sizeBytes, maxBytes: REVIEW_HARD_LIMITS.repositoryAuditFileBytes },
      });
      const response = validatedSourceResponse(raw, file, revision.head);
      completeSources.set(file.path, Object.freeze({ path: file.path, content: response.content,
        digest: response.digest, complete: true,
        ranges: Object.freeze([{ startLine: 1, endLine: Math.max(1, response.content.split('\n').length) }]) }));
    }
  }
  const requestedExpansionJobs = compilation.jobs.flatMap((job, index) => {
    const request = firstResults[index]?.parsed.ok ? firstResults[index].parsed.value.contextRequest : undefined;
    return request ? [expandScalableReviewJob(job,
      request.paths.flatMap((requestedPath) => resolvedRequests.get(requestedPath) ?? []), completeSources)] : [];
  });
  const selectedExpansion = selectExpansionJobs(compilation, requestedExpansionJobs, dispatchBudget.snapshot());
  const expandedJobs = selectedExpansion.jobs;
  const selectedExpansionIds = new Set(expandedJobs.map(({ id }) => id));
  const deferredExpansionIds = new Set(requestedExpansionJobs.filter(({ id }) => !selectedExpansionIds.has(id)).map(({ id }) => id));
  const contextExpansionFollowUp = Object.freeze({ requested: requestedExpansionJobs.length,
    selected: expandedJobs.length, deferred: deferredExpansionIds.size,
    reservedInputTokens: selectedExpansion.accounting.inputTokens });
  const followUpArtifacts = [await storeFollowUpStatus(Object.freeze({
    schemaVersion: 'repository-review-follow-up-status.v1', phase: 'context-expansion',
    compilationDigest: compilation.digest, contextExpansion: contextExpansionFollowUp,
  }), context)];
  let finalJobs = compilation.jobs, reviewResults = firstResults, reviewRuns = [reviewRun];
  let expansionRun: ReviewCacheRun<ScalableReviewJobResult> | undefined;
  let expansionAccounting: Readonly<{ inputTokens: number; estimatedCostUsd: number; estimatedWallTimeSeconds: number }>
    = Object.freeze({ inputTokens: 0, estimatedCostUsd: 0, estimatedWallTimeSeconds: 0 });
  if (expandedJobs.length > 0) {
    expansionAccounting = selectedExpansion.accounting;
    const expandedRun = await cachedReviewJobs(expandedJobs, reviewIdentity,
      { ...runtime, execution: execution('context-expansion') }, false);
    expansionRun = expandedRun;
    const replacement = new Map(expandedJobs.map((job) => [job.id, job]));
    finalJobs = Object.freeze(compilation.jobs.map((job) => replacement.get(job.id) ?? job));
    reviewResults = finalJobs.map((job, index) => (
      replacement.has(job.id) ? expandedRun.values.get(job.id) : firstResults[index]
    ) as ScalableReviewJobResult);
    reviewRuns = [reviewRun, expandedRun];
  }
  const preflight = preflightScalableReviewResults(finalJobs, reviewResults, deferredExpansionIds);
  if (selectedReviewIncomplete(preflight, deferredExpansionIds)) {
    throw new RepositoryAuditIntegrityError(`repository audit review is incomplete: ${canonicalJson(preflight)}`);
  }
  const requestedVerificationJobs = buildScalableVerificationJobs(preflight, finalJobs, policyDigest, {
    tokenizerEncoding: compilation.profile.tokenizerEncoding,
    maxPromptBytes: compilation.profile.maxPromptBytesPerJob,
    maxInputTokens: Math.min(compilation.profile.maxInputTokensPerJob,
      compilation.profile.maxContextTokensPerJob - compilation.profile.maxOutputTokensPerJob),
  });
  const jobs = selectFittingCandidates(
    requestedVerificationJobs, compilation.profile.maxVerificationJobs,
    (selected) => verificationFitsBudget(compilation, dispatchBudget.snapshot(),
      expansionAccounting.estimatedWallTimeSeconds, verificationJobAccounting(compilation, selected)),
  );
  const verificationAccounting = verificationJobAccounting(compilation, jobs);
  const selectedVerificationIds = new Set(jobs.map(({ id }) => id));
  const deferredVerificationIds = requestedVerificationJobs.filter(({ id }) => !selectedVerificationIds.has(id))
    .map(({ proposal }) => proposal.id);
  const verificationFollowUp = Object.freeze({ requested: requestedVerificationJobs.length,
    selected: jobs.length, deferred: deferredVerificationIds.length,
    reservedInputTokens: verificationAccounting.inputTokens });
  followUpArtifacts.push(await storeFollowUpStatus(Object.freeze({
    schemaVersion: 'repository-review-follow-up-status.v1', phase: 'verification',
    compilationDigest: compilation.digest, contextExpansion: contextExpansionFollowUp,
    verification: verificationFollowUp,
  }), context));
  const verificationIdentity = cacheIdentity(policyDigest, expectedRuntime,
    'kubeclaw.echo-review-scale-verification.v1');
  const verificationRun = await cachedVerificationJobs(jobs, verificationIdentity,
    { ...runtime, execution: execution('verification') });
  const results = jobs.map(({ id }) => verificationRun.values.get(id) as ScalableVerificationJobResult);
  const completedReduction = reduceScalableReview(jobs, results);
  if (completedReduction.incompleteJobs.length > 0) {
    throw new RepositoryAuditIntegrityError(`repository audit verification is incomplete: ${completedReduction.incompleteJobs.join(', ')}`);
  }
  const reduction = reduceScalableReview(jobs, results, preflight.incompleteJobs, deferredVerificationIds);
  return { reduction, cache, verificationAccounting, dispatchAccounting: dispatchBudget.snapshot(),
    contextExpansions: expandedJobs.length,
    followUp: Object.freeze({ contextExpansion: contextExpansionFollowUp,
      verification: verificationFollowUp }), followUpArtifacts: Object.freeze(followUpArtifacts),
    summary: {
    review: combinedCacheSummary(reviewIdentity, reviewRuns),
    initialReview: cacheSummary(reviewIdentity, reviewRun),
    contextExpansion: expansionRun ? cacheSummary(reviewIdentity, expansionRun) : emptyCacheSummary(reviewIdentity),
    verification: cacheSummary(verificationIdentity, verificationRun),
  } satisfies AuditCacheSummary };
}

async function auditDispatch<T>(label: string, execute: () => Promise<T>): Promise<T> {
  try { return await execute(); } catch (error) {
    if (error instanceof Error && error.message.startsWith('EFFECT_OUTCOME_UNRESOLVED:')) throw error;
    if (error instanceof ReviewRuntimeAttestationError) {
      throw new RepositoryAuditIntegrityError(error.message);
    }
    // Runtime transport/session failures must reach core so its bounded stage-attempt
    // policy can retry from prepared-plan and per-job checkpoints.
    throw new RepositoryAuditInfrastructureError(
      `repository audit ${label} dispatch failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function enforceExpansionBudget(
  compilation: ReturnType<typeof compileScalableReview>, jobs: readonly ScalableReviewJob[],
  baseline: DispatchAccountingSnapshot,
): Readonly<{ inputTokens: number; estimatedCostUsd: number; estimatedWallTimeSeconds: number }> {
  if (jobs.length > compilation.profile.maxContextExpansionJobs) {
    throw new RepositoryAuditIntegrityError(
      `repository audit context expansion job budget exceeded: ${jobs.length}:${compilation.profile.maxContextExpansionJobs}`,
    );
  }
  const reservation = reserveReviewAttempts(jobs.map(buildScalableReviewDispatchPayload),
    compilation.profile.tokenizerEncoding, compilation.profile.maxRetries,
    compilation.profile.maxRetryAttemptsPerPhase);
  const inputTokens = reservation.inputTokens;
  const outputTokens = reservation.attempts * compilation.profile.maxOutputTokensPerJob;
  const cost = estimatedReviewCostUsd({ inputTokens, outputTokens,
    inputUsdPerMillionTokens: compilation.profile.inputUsdPerMillionTokens,
    outputUsdPerMillionTokens: compilation.profile.outputUsdPerMillionTokens });
  const wall = Math.ceil(reservation.attempts / compilation.profile.concurrency)
    * compilation.profile.estimatedSecondsPerJob;
  if (reservation.maximumBytes > compilation.profile.maxPromptBytesPerJob
    || reservation.maximumTokens > compilation.profile.maxInputTokensPerJob
    || reservation.maximumTokens + compilation.profile.maxOutputTokensPerJob
      > compilation.profile.maxContextTokensPerJob
    || inputTokens > compilation.profile.maxContextExpansionInputTokens
    || baseline.reservedInputTokens + inputTokens > compilation.profile.maxTotalInputTokens
    || baseline.reservedEstimatedCostUsd + cost > compilation.profile.maxEstimatedCostUsd
    || compilation.accounting.estimatedWallTimeSeconds + wall > compilation.profile.maxWallTimeSeconds) {
    throw new RepositoryAuditIntegrityError('repository audit context expansion exceeds the resolved operational budget');
  }
  return Object.freeze({ inputTokens, estimatedCostUsd: cost, estimatedWallTimeSeconds: wall });
}

function selectExpansionJobs(
  compilation: ReturnType<typeof compileScalableReview>, candidates: readonly ScalableReviewJob[],
  baseline: DispatchAccountingSnapshot,
): Readonly<{ jobs: readonly ScalableReviewJob[]; accounting: ReturnType<typeof enforceExpansionBudget> }> {
  const jobs = selectFittingCandidates(candidates, compilation.profile.maxContextExpansionJobs, (selected) => {
    try { enforceExpansionBudget(compilation, selected, baseline); return true; }
    catch (error) {
      if (!(error instanceof RepositoryAuditIntegrityError)) throw error;
      return false;
    }
  });
  return Object.freeze({ jobs, accounting: enforceExpansionBudget(compilation, jobs, baseline) });
}

function verificationJobAccounting(
  compilation: ReturnType<typeof compileScalableReview>, jobs: readonly ScalableVerificationJob[],
): VerificationAccounting {
  const metrics = jobs.map((job) => reserveReviewRuntimePrompt(
    buildScalableVerificationDispatchPayload(job), compilation.profile.tokenizerEncoding));
  const reservation = reserveReviewAttempts(jobs.map(buildScalableVerificationDispatchPayload),
    compilation.profile.tokenizerEncoding, compilation.profile.maxRetries,
    compilation.profile.maxRetryAttemptsPerPhase);
  const inputTokens = reservation.inputTokens;
  const reservedOutputTokens = reservation.attempts * compilation.profile.maxOutputTokensPerJob;
  return Object.freeze({ jobs: jobs.length,
    promptBytes: metrics.reduce((total, value) => total + value.bytes, 0), inputTokens,
    maximumJobBytes: reservation.maximumBytes,
    maximumJobTokens: reservation.maximumTokens, reservedOutputTokens,
    estimatedCostUsd: estimatedReviewCostUsd({ inputTokens, outputTokens: reservedOutputTokens,
      inputUsdPerMillionTokens: compilation.profile.inputUsdPerMillionTokens,
      outputUsdPerMillionTokens: compilation.profile.outputUsdPerMillionTokens }),
    estimatedWallTimeSeconds: Math.ceil(reservation.attempts / compilation.profile.concurrency)
      * compilation.profile.estimatedSecondsPerJob } as VerificationAccounting);
}

function verificationFitsBudget(
  compilation: ReturnType<typeof compileScalableReview>,
  baseline: DispatchAccountingSnapshot,
  expansionWallTimeSeconds: number,
  verification: VerificationAccounting,
): boolean {
  return verification.maximumJobBytes <= compilation.profile.maxPromptBytesPerJob
    && verification.maximumJobTokens <= compilation.profile.maxInputTokensPerJob
    && verification.maximumJobTokens + compilation.profile.maxOutputTokensPerJob <= compilation.profile.maxContextTokensPerJob
    && verification.inputTokens <= compilation.profile.maxVerificationInputTokens
    && baseline.reservedInputTokens + verification.inputTokens <= compilation.profile.maxTotalInputTokens
    && baseline.reservedEstimatedCostUsd + verification.estimatedCostUsd <= compilation.profile.maxEstimatedCostUsd
    && compilation.accounting.estimatedWallTimeSeconds + expansionWallTimeSeconds
      + verification.estimatedWallTimeSeconds <= compilation.profile.maxWallTimeSeconds;
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
  runtime: AuditRuntime, allowContextRequest = true,
): Promise<ReviewCacheRun<ScalableReviewJobResult>> {
  const run = await runWithReviewCache<ScalableReviewJobResult>(jobs, identity, runtime.cache, async (misses, checkpoint) => {
    const wanted = new Set(misses.map(({ id }) => id));
    const selected = jobs.filter(({ id }) => wanted.has(id));
    const results = await auditDispatch('review', () => executeScalableReviewJobs(
      selected, runtime.agent, runtime.context, runtime.execution, runtime.expectedRuntime,
      async (result) => checkpoint(result.jobId, result),
    ));
    return exactDispatchResults('review dispatch', selected, results);
  }, (unit, value) => {
    const job = jobs.find(({ id }) => id === unit.id);
    return job !== undefined && reusableReviewResult(job, value, allowContextRequest);
  }, runtime.cache.profile);
  run.values.forEach((value) => assertReviewRuntimeIdentity(value.runtime, runtime.expectedRuntime));
  return run;
}

async function cachedVerificationJobs(
  jobs: readonly ScalableVerificationJob[], identity: ReviewCacheIdentity,
  runtime: AuditRuntime,
): Promise<ReviewCacheRun<ScalableVerificationJobResult>> {
  const run = await runWithReviewCache<ScalableVerificationJobResult>(jobs, identity, runtime.cache, async (misses, checkpoint) => {
    const wanted = new Set(misses.map(({ id }) => id));
    const selected = jobs.filter(({ id }) => wanted.has(id));
    const results = await auditDispatch('verification', () => executeScalableVerificationJobs(
      selected, runtime.agent, runtime.context, runtime.execution, runtime.expectedRuntime,
      async (result) => checkpoint(result.jobId, result),
    ));
    return exactDispatchResults('verification dispatch', selected, results);
  }, (unit, value) => {
    const job = jobs.find(({ id }) => id === unit.id);
    return job !== undefined && reduceScalableReview([job], [value]).incompleteJobs.length === 0;
  }, runtime.cache.profile);
  run.values.forEach((value) => assertReviewRuntimeIdentity(value.runtime, runtime.expectedRuntime));
  return run;
}

function cacheIdentity(
  policyDigest: `sha256:${string}`, runtime: ReviewRuntimeIdentity, reviewerProtocol: string,
): ReviewCacheIdentity {
  return Object.freeze({ policyDigest, reviewerProtocol, reviewerModel: runtime.model,
    reviewerRuntimeIdentityDigest: reviewRuntimeIdentityDigest(runtime),
    evidenceVersion: 'repository-review-evidence.v2' });
}

function cacheSummary<T>(identity: ReviewCacheIdentity, run: ReviewCacheRun<T>): AuditCacheRunSummary {
  return Object.freeze({ identity, hits: run.hits, misses: run.misses,
    keySetDigest: sha256Text(canonicalJson([...run.cacheKeys.entries()]
      .sort(([left], [right]) => compareCodeUnits(left, right)))) });
}

function emptyCacheSummary(identity: ReviewCacheIdentity): AuditCacheRunSummary {
  return Object.freeze({ identity, hits: 0, misses: 0, keySetDigest: sha256Text(canonicalJson([])) });
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

async function storeFollowUpStatus(
  value: Readonly<Record<string, unknown>>, context: PluginInvocationContext,
): Promise<ArtifactRef> {
  const digest = sha256Text(canonicalJson(value));
  const expectedId = `repository-review-follow-up:${digest.slice(7)}`;
  const stored = await context.invoke('artifacts.write', {
    operation: 'put_json', resource: { type: 'artifact.object', canonicalId: expectedId },
    payload: { namespace: REVIEW_NAMESPACE, mediaType: 'application/json', checkpoint: true, value },
  });
  const artifact = artifactRef(stored);
  if (artifact.artifactId !== expectedId || artifact.namespace !== REVIEW_NAMESPACE
    || artifact.digest !== digest || !exactArtifactProducer(artifact, context)) {
    throw new RepositoryAuditIntegrityError('artifact adapter returned an invalid follow-up status reference');
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
    if (parsed.reviewProfile.enabledLenses.includes('simplification') && !policy.policy.simplification.enabled) {
      throw new RepositoryAuditIntegrityError('repository audit simplification lens requires an enabled simplification policy');
    }
    const { revision, snapshot, compilation, artifact: preparedArtifact } = await preparedRepositoryAudit(parsed, context);
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
      return { schemaVersion: 'stage-result.v2', outcome: 'passed', artifacts: [
        ...(exactArtifactProducer(preparedArtifact, context) ? [preparedArtifact] : []), artifact],
        facts: repositoryPlanFacts(revision.head, compilation, artifact.digest) };
    }
    const verified = await verifiedReduction({ revision, snapshot, compilation }, config, policy.digest, context);
    // The combined review summary includes both initial and context-expansion cache misses.
    const firstAttemptModelCalls = verified.summary.review.misses + verified.summary.verification.misses;
    const usage = repositoryUsageAccounting(verified.dispatchAccounting, firstAttemptModelCalls);
    // Selected follow-up failures cannot reach this report: review preflight and completedReduction fail closed above.
    const completeness = repositoryCompleteness({
      primary: { requested: compilation.accounting.primaryJobs,
        completed: compilation.accounting.primaryJobs, failed: 0 },
      contextExpansion: { ...verified.followUp.contextExpansion,
        completed: verified.followUp.contextExpansion.selected, failed: 0 },
      verification: { ...verified.followUp.verification,
        completed: verified.followUp.verification.selected, failed: 0 },
    });
    const report = Object.freeze({ schemaVersion: 'repository-review-report.v1', head: revision.head,
      snapshotDigest: snapshot.digest, compilationDigest: compilation.digest, map: compilation.artifacts,
      profile: parsed.reviewProfile, accounting: compilation.accounting,
      coverage: compilation.plan.coverage, cache: verified.summary,
      contextExpansions: verified.contextExpansions,
      followUp: verified.followUp,
      dispatchAccounting: verified.dispatchAccounting,
      usage, completeness,
      verificationAccounting: verified.verificationAccounting, reduction: verified.reduction });
    const identity = sha256Text(canonicalJson(report));
    const artifact = await storeRepositoryReport(report, identity, context);
    return { schemaVersion: 'stage-result.v2', outcome: 'passed', artifacts: [
      ...(exactArtifactProducer(preparedArtifact, context) ? [preparedArtifact] : []),
      ...verified.cache.artifacts(), ...verified.followUpArtifacts, artifact],
      facts: repositoryExecutionFacts({ head: revision.head, compilation, reportDigest: artifact.digest,
        confirmed: verified.reduction.confirmed.length, rejected: verified.reduction.rejected.length,
        confirmedSimplifications: verified.reduction.confirmed.filter(({ finding }) => finding.category === 'simplification').length,
        rejectedSimplifications: verified.reduction.rejected.filter(({ finding }) => finding.category === 'simplification').length,
        reviewCacheHits: verified.summary.review.hits, reviewCacheMisses: verified.summary.review.misses,
        initialReviewCacheHits: verified.summary.initialReview.hits,
        initialReviewCacheMisses: verified.summary.initialReview.misses,
        contextExpansionCacheHits: verified.summary.contextExpansion.hits,
        contextExpansionCacheMisses: verified.summary.contextExpansion.misses,
        verificationCacheHits: verified.summary.verification.hits,
        verificationCacheMisses: verified.summary.verification.misses,
        actualModelCalls: verified.dispatchAccounting.calls,
        retryModelCalls: Math.max(0, verified.dispatchAccounting.calls - firstAttemptModelCalls),
        reservedPromptBytes: verified.dispatchAccounting.reservedPromptBytes,
        reservedInputTokens: verified.dispatchAccounting.reservedInputTokens,
        reservedOutputTokens: verified.dispatchAccounting.reservedOutputTokens,
        reservedEstimatedCostUsd: verified.dispatchAccounting.reservedEstimatedCostUsd,
        contextExpansions: verified.contextExpansions,
        incompleteJobs: verified.reduction.incompleteJobs.length,
        unverifiedProposals: verified.reduction.unverifiedProposals.length,
        requestedContextExpansions: verified.followUp.contextExpansion.requested,
        deferredContextExpansions: verified.followUp.contextExpansion.deferred,
        requestedVerifications: verified.followUp.verification.requested,
        deferredVerifications: verified.followUp.verification.deferred }) };
}

export async function executeRepositoryAudit(input: unknown, context: PluginInvocationContext): Promise<StageResult> {
  try {
    return await runRepositoryAudit(input, context);
  } catch (error) {
    if (!(error instanceof RepositoryAuditIntegrityError
      || error instanceof RepositoryAuditCacheIntegrityError
      || error instanceof ReviewContentCacheIntegrityError)) throw error;
    return blockedReviewStage('kubeclaw.review.repository_audit_incomplete', error instanceof Error ? error.message : String(error));
  }
}
