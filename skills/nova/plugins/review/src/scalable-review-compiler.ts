import { canonicalJson, sha256Text } from '@kubeclaw/plugin-sdk';

import { extractReviewRelations, type ReviewSourceDocument } from './review-fact-extractors.ts';
import { buildReviewGraph, type ReviewGraph } from './review-graph.ts';
import { buildReviewMapArtifacts, validateReviewMapArtifacts, type ReviewMapArtifacts,
  type ReviewMapRelation } from './review-map-artifacts.ts';
import { buildScalableReviewPlan, type ReviewSliceBudget, type ScalableReviewPlan } from './review-scale-slicing.ts';
import type { ReviewSnapshotInventory } from './review-snapshot-inventory.ts';
import { buildScalableReviewDispatchPayload, buildScalableReviewJobs, type ScalableReviewJob } from './scalable-review-jobs.ts';
import { compactRegionTopologyAssignmentCount, compactReviewTopologyRelationKeys, type CompactRegionTopology,
  type CompactReviewTopology } from './scalable-review-topology.ts';
import { countReviewTextTokens, estimatedReviewCostUsd, reserveReviewRuntimePrompt } from './review-prompt-budget.ts';
import { resolveRepositoryReviewProfile, type ResolvedRepositoryReviewProfile } from './repository-review-profile.ts';

export interface ScalableReviewJobAccounting {
  readonly schemaVersion: 'scalable-review-job-accounting.v1';
  readonly componentRecords: number;
  readonly boundaryRecords: number;
  readonly boundaryRelations: number;
  readonly sourceAssignments: number;
  readonly uniqueSourcePayloads: number;
  readonly repeatedSourceAssignments: number;
  readonly sourcePayloadTokens: number;
  readonly uniqueSourcePayloadTokens: number;
  readonly directRelationAssignments: number;
  readonly compactTopologyRelationAssignments: number;
  readonly aggregatePathRelationAssignments: number;
  readonly relationAssignments: number;
  readonly uniqueRelationAssignments: number;
  readonly repeatedRelationAssignments: number;
  readonly relationsWithoutLineProvenance: number;
  readonly componentJobs: number;
  readonly boundaryJobs: number;
  readonly systemPathJobs: number;
  readonly systemLensJobs: number;
  readonly primaryJobs: number;
  readonly serializedPromptBytes: number;
  readonly serializedPayloadTokens: number;
  readonly reservedPromptBytes: number;
  readonly estimatedInputTokens: number;
  readonly maximumJobBytes: number;
  readonly maximumJobTokens: number;
  readonly medianJobTokens: number;
  readonly p95JobTokens: number;
  readonly reservedOutputTokens: number;
  readonly estimatedCostUsd: number;
  readonly estimatedWallTimeSeconds: number;
  readonly byKind: Readonly<Record<ScalableReviewJob['kind'], Readonly<{
    jobs: number; bytes: number; tokens: number; maximumTokens: number;
  }>>>;
  readonly digest: `sha256:${string}`;
}

export interface ScalableReviewCompilation {
  readonly schemaVersion: 'scalable-review-compilation.v1';
  readonly snapshotDigest: string;
  readonly graph: ReviewGraph;
  readonly plan: ScalableReviewPlan;
  readonly jobs: readonly ScalableReviewJob[];
  readonly profile: ResolvedRepositoryReviewProfile;
  readonly accounting: ScalableReviewJobAccounting;
  readonly artifacts: ReviewMapArtifacts;
  readonly digest: `sha256:${string}`;
}

function verifySourceAuthority(
  snapshot: ReviewSnapshotInventory, documents: readonly ReviewSourceDocument[],
  sourceDigests: ReadonlyMap<string, string>,
): void {
  const files = new Map(snapshot.files.filter(({ included }) => included).map((file) => [file.path, file]));
  for (const document of documents) {
    const file = files.get(document.path);
    if (!file || sourceDigests.get(document.path) !== sha256Text(document.content)) {
      throw new Error(`scalable review source does not match frozen source proof: ${document.path}`);
    }
  }
}

type ReviewJobMetric = ReturnType<typeof reserveReviewRuntimePrompt> & { readonly job: ScalableReviewJob };

function accountingByKind(metrics: readonly ReviewJobMetric[]): ScalableReviewJobAccounting['byKind'] {
  return Object.fromEntries((['component', 'boundary', 'system-path', 'system-lens'] as const).map((kind) => {
    const selected = metrics.filter(({ job }) => job.kind === kind);
    return [kind, Object.freeze({ jobs: selected.length,
      bytes: selected.reduce((total, value) => total + value.bytes, 0),
      tokens: selected.reduce((total, value) => total + value.tokens, 0),
      maximumTokens: Math.max(0, ...selected.map(({ tokens }) => tokens)),
    })];
  })) as ScalableReviewJobAccounting['byKind'];
}

function tokenPercentile(sortedTokens: readonly number[], ratio: number): number {
  return sortedTokens[Math.max(0, Math.ceil(sortedTokens.length * ratio) - 1)] ?? 0;
}

function compactTopologyRelations(job: ScalableReviewJob): readonly string[] {
  if (job.kind !== 'system-lens') return [];
  const topology = job.systemContext?.topology;
  if (!topology || typeof topology !== 'object' || Array.isArray(topology)) {
    throw new Error(`scalable review holistic topology is missing: ${job.id}`);
  }
  return compactReviewTopologyRelationKeys(topology as CompactReviewTopology);
}

function aggregatePathRelationAssignments(job: ScalableReviewJob): number {
  if (job.kind !== 'system-path') return 0;
  const topology = job.systemContext?.topology as CompactRegionTopology | undefined;
  if (!topology || typeof topology.portRows !== 'string') throw new Error(`scalable review path topology is missing: ${job.id}`);
  return compactRegionTopologyAssignmentCount(topology);
}

// eslint-disable-next-line max-lines-per-function -- The signed accounting record is built in one visible, auditable block.
function jobAccounting(
  graph: ReviewGraph, plan: ScalableReviewPlan, jobs: readonly ScalableReviewJob[],
  profile: ResolvedRepositoryReviewProfile,
): ScalableReviewJobAccounting {
  const metrics = jobs.map((job) => ({ job,
    ...reserveReviewRuntimePrompt(buildScalableReviewDispatchPayload(job), profile.tokenizerEncoding) }));
  const sortedTokens = metrics.map(({ tokens }) => tokens).sort((left, right) => left - right);
  const inputTokens = metrics.reduce((total, value) => total + value.tokens, 0);
  const outputTokens = jobs.length * profile.maxOutputTokensPerJob;
  const sources = jobs.flatMap(({ source }) => source);
  const sourcePayloads = sources.map((source) => canonicalJson(source));
  const sourcePayloadCounts = new Map<string, number>();
  for (const payload of sourcePayloads) sourcePayloadCounts.set(payload, (sourcePayloadCounts.get(payload) ?? 0) + 1);
  const sourcePayloadTokenCounts = new Map([...sourcePayloadCounts.keys()].map((payload) => (
    [payload, countReviewTextTokens(payload, profile.tokenizerEncoding)]
  )));
  const directRelationAssignments = jobs.flatMap(({ relationKeys }) => relationKeys);
  const compactRelationAssignments = jobs.flatMap(compactTopologyRelations);
  const aggregateRelationAssignments = jobs.reduce((total, value) => total + aggregatePathRelationAssignments(value), 0);
  const relationAssignments = [...directRelationAssignments, ...compactRelationAssignments];
  const unsigned = {
    schemaVersion: 'scalable-review-job-accounting.v1' as const,
    componentRecords: graph.components.length, boundaryRecords: plan.boundaries.length,
    boundaryRelations: new Set(plan.boundaries.flatMap(({ relationKeys }) => relationKeys)).size,
    sourceAssignments: sources.length, uniqueSourcePayloads: sourcePayloadCounts.size,
    repeatedSourceAssignments: sources.length - sourcePayloadCounts.size,
    sourcePayloadTokens: [...sourcePayloadCounts].reduce((total, [payload, count]) => (
      total + (sourcePayloadTokenCounts.get(payload) as number) * count
    ), 0),
    uniqueSourcePayloadTokens: [...sourcePayloadTokenCounts.values()].reduce((total, value) => total + value, 0),
    directRelationAssignments: directRelationAssignments.length,
    compactTopologyRelationAssignments: compactRelationAssignments.length,
    aggregatePathRelationAssignments: aggregateRelationAssignments,
    relationAssignments: relationAssignments.length + aggregateRelationAssignments,
    uniqueRelationAssignments: new Set(relationAssignments).size,
    repeatedRelationAssignments: relationAssignments.length + aggregateRelationAssignments
      - new Set(relationAssignments).size,
    relationsWithoutLineProvenance: graph.relations.filter(({ provenance }) => (
      !/:\d+(?::\d+)?$/u.test(provenance)
    )).length,
    componentJobs: jobs.filter(({ kind }) => kind === 'component').length,
    boundaryJobs: jobs.filter(({ kind }) => kind === 'boundary').length,
    systemPathJobs: jobs.filter(({ kind }) => kind === 'system-path').length,
    systemLensJobs: jobs.filter(({ kind }) => kind === 'system-lens').length,
    primaryJobs: jobs.length,
    serializedPromptBytes: metrics.reduce((total, value) => total + value.payloadBytes, 0),
    serializedPayloadTokens: metrics.reduce((total, value) => total + value.payloadTokens, 0),
    reservedPromptBytes: metrics.reduce((total, value) => total + value.bytes, 0),
    estimatedInputTokens: inputTokens,
    maximumJobBytes: Math.max(0, ...metrics.map(({ bytes }) => bytes)),
    maximumJobTokens: Math.max(0, ...metrics.map(({ tokens }) => tokens)),
    medianJobTokens: tokenPercentile(sortedTokens, 0.5), p95JobTokens: tokenPercentile(sortedTokens, 0.95),
    reservedOutputTokens: outputTokens,
    estimatedCostUsd: estimatedReviewCostUsd({ inputTokens, outputTokens,
      inputUsdPerMillionTokens: profile.inputUsdPerMillionTokens,
      outputUsdPerMillionTokens: profile.outputUsdPerMillionTokens }),
    estimatedWallTimeSeconds: Math.ceil(jobs.length / profile.concurrency) * profile.estimatedSecondsPerJob,
    byKind: accountingByKind(metrics),
  };
  return Object.freeze({ ...unsigned, digest: sha256Text(canonicalJson(unsigned)) });
}

function enforceProfileBudgets(
  accounting: ScalableReviewJobAccounting, profile: ResolvedRepositoryReviewProfile,
): void {
  if (accounting.primaryJobs > profile.maxPrimaryJobs) {
    throw new Error(`scalable review primary job budget exceeded: ${accounting.primaryJobs}:${profile.maxPrimaryJobs}`);
  }
  if (accounting.maximumJobBytes > profile.maxPromptBytesPerJob) {
    throw new Error(`scalable review per-job byte budget exceeded: ${accounting.maximumJobBytes}:${profile.maxPromptBytesPerJob}`);
  }
  if (accounting.maximumJobTokens > profile.maxInputTokensPerJob
    || accounting.maximumJobTokens + profile.maxOutputTokensPerJob > profile.maxContextTokensPerJob) {
    throw new Error(`scalable review per-job token budget exceeded: ${accounting.maximumJobTokens}:${profile.maxInputTokensPerJob}:${canonicalJson(accounting.byKind)}`);
  }
  if (accounting.estimatedInputTokens > profile.maxInitialInputTokens) {
    throw new Error(`scalable review initial input token budget exceeded: ${accounting.estimatedInputTokens}:${profile.maxInitialInputTokens}`);
  }
  if (accounting.estimatedCostUsd > profile.maxEstimatedCostUsd) {
    throw new Error(`scalable review estimated cost budget exceeded: ${accounting.estimatedCostUsd}:${profile.maxEstimatedCostUsd}`);
  }
  if (accounting.estimatedWallTimeSeconds > profile.maxWallTimeSeconds) {
    throw new Error(`scalable review wall time budget exceeded: ${accounting.estimatedWallTimeSeconds}:${profile.maxWallTimeSeconds}`);
  }
}

function scopedRelations(
  relations: readonly ReviewMapRelation[], snapshot: ReviewSnapshotInventory,
  profile: ResolvedRepositoryReviewProfile,
): readonly ReviewMapRelation[] {
  if (profile.scope.kind === 'repository') return relations;
  const tracked = new Set(snapshot.files.filter(({ included }) => included).map(({ path }) => path));
  const inside = (path: string): boolean => profile.allowedPrefixes.some((prefix) => {
    const root = prefix.replace(/\/+$/u, '');
    return root === '.' || path === root || path.startsWith(`${root}/`);
  });
  return Object.freeze(relations.map((relation) => {
    if (tracked.has(relation.to) || relation.to.startsWith('resource:') || inside(relation.to)) return relation;
    return Object.freeze({ ...relation, to: `resource:external-file:${relation.to}` });
  }));
}

export function compileScalableReview(values: {
  readonly snapshot: ReviewSnapshotInventory;
  readonly documents: readonly ReviewSourceDocument[];
  readonly sourceDigests: ReadonlyMap<string, string>;
  readonly budget: ReviewSliceBudget;
  readonly profile?: ResolvedRepositoryReviewProfile;
}): ScalableReviewCompilation {
  const { snapshot, documents, sourceDigests } = values;
  const profile = values.profile ?? resolveRepositoryReviewProfile({ grade: 'standard' });
  const tokenCounts = new Map(documents.map(({ path, content }) => [path,
    countReviewTextTokens(content, profile.tokenizerEncoding)]));
  const budget = values.profile ? profile.componentBudget : values.budget;
  const included = snapshot.files.filter(({ included: value }) => value).map(({ path }) => path).sort();
  const supplied = [...documents].map(({ path }) => path).sort();
  if (canonicalJson(included) !== canonicalJson(supplied)) throw new Error('scalable review documents do not match snapshot coverage');
  verifySourceAuthority(snapshot, documents, sourceDigests);
  const relations = scopedRelations(extractReviewRelations(documents), snapshot, profile);
  const graph = buildReviewGraph(snapshot, relations);
  const plan = buildScalableReviewPlan(snapshot, graph, tokenCounts, budget);
  if (!plan.coverage.complete) throw new Error(`scalable review compilation coverage is incomplete: ${canonicalJson({
    uncoveredFiles: plan.coverage.uncoveredFiles.slice(0, 10),
    unresolvedRelations: graph.unresolvedRelations.slice(0, 10), overflows: plan.coverage.overflows.slice(0, 10),
  })}`);
  const jobs = buildScalableReviewJobs({ plan, graph, documents, tokenCounts, budget,
    ...(values.profile === undefined ? {} : { profile: values.profile }) });
  const accounting = jobAccounting(graph, plan, jobs, profile);
  if (values.profile) enforceProfileBudgets(accounting, profile);
  const artifacts = buildReviewMapArtifacts(snapshot, { relations, slices: plan.slices, boundaries: plan.boundaries });
  validateReviewMapArtifacts(artifacts);
  const unsigned = {
    schemaVersion: 'scalable-review-compilation.v1' as const,
    snapshotDigest: snapshot.digest, graphDigest: graph.digest,
    coverageDigest: plan.coverage.digest, jobDigests: jobs.map(({ digest }) => digest),
    mapDigest: artifacts.manifest.digest, profileDigest: profile.digest, accountingDigest: accounting.digest,
  };
  return Object.freeze({ ...unsigned, graph, plan, jobs, profile, accounting, artifacts,
    digest: sha256Text(canonicalJson(unsigned)) });
}
