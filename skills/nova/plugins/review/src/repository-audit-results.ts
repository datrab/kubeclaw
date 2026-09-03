import type { ScalableReviewCompilation } from './scalable-review-compiler.ts';

export function repositoryPlanFacts(
  head: string, compilation: ScalableReviewCompilation, reportDigest: string,
): Readonly<Record<string, string | number>> {
  return Object.freeze({
    'review.repository_head': head,
    'review.repository_mode': 'plan',
    'review.repository_grade': compilation.profile.grade,
    'review.repository_simplification_enabled': Number(compilation.profile.enabledLenses.includes('simplification')),
    'review.repository_files': compilation.plan.coverage.filesIncluded,
    'review.repository_component_jobs': compilation.accounting.componentJobs,
    'review.repository_boundary_records': compilation.accounting.boundaryRecords,
    'review.repository_boundary_relations': compilation.accounting.boundaryRelations,
    'review.repository_boundary_jobs': compilation.accounting.boundaryJobs,
    'review.repository_system_path_jobs': compilation.accounting.systemPathJobs,
    'review.repository_system_lens_jobs': compilation.accounting.systemLensJobs,
    'review.repository_jobs': compilation.accounting.primaryJobs,
    'review.repository_serialized_prompt_bytes': compilation.accounting.serializedPromptBytes,
    'review.repository_estimated_input_tokens': compilation.accounting.estimatedInputTokens,
    'review.repository_maximum_job_tokens': compilation.accounting.maximumJobTokens,
    'review.repository_p95_job_tokens': compilation.accounting.p95JobTokens,
    'review.repository_source_assignments': compilation.accounting.sourceAssignments,
    'review.repository_unique_source_payloads': compilation.accounting.uniqueSourcePayloads,
    'review.repository_repeated_source_assignments': compilation.accounting.repeatedSourceAssignments,
    'review.repository_source_payload_tokens': compilation.accounting.sourcePayloadTokens,
    'review.repository_unique_source_payload_tokens': compilation.accounting.uniqueSourcePayloadTokens,
    'review.repository_direct_relation_assignments': compilation.accounting.directRelationAssignments,
    'review.repository_compact_topology_relation_assignments': compilation.accounting.compactTopologyRelationAssignments,
    'review.repository_aggregate_path_relation_assignments': compilation.accounting.aggregatePathRelationAssignments,
    'review.repository_relation_assignments': compilation.accounting.relationAssignments,
    'review.repository_unique_relation_assignments': compilation.accounting.uniqueRelationAssignments,
    'review.repository_repeated_relation_assignments': compilation.accounting.repeatedRelationAssignments,
    'review.repository_relations_without_line_provenance': compilation.accounting.relationsWithoutLineProvenance,
    'review.repository_estimated_cost_usd': compilation.accounting.estimatedCostUsd,
    'review.repository_estimated_wall_time_seconds': compilation.accounting.estimatedWallTimeSeconds,
    'review.repository_report_digest': reportDigest,
  });
}

export function repositoryExecutionFacts(values: {
  readonly head: string; readonly compilation: ScalableReviewCompilation; readonly reportDigest: string;
  readonly confirmed: number; readonly rejected: number;
  readonly confirmedSimplifications: number; readonly rejectedSimplifications: number;
  readonly reviewCacheHits: number; readonly reviewCacheMisses: number;
  readonly verificationCacheHits: number; readonly verificationCacheMisses: number;
  readonly actualModelCalls: number; readonly reservedInputTokens: number;
  readonly reservedOutputTokens: number; readonly reservedEstimatedCostUsd: number;
  readonly contextExpansions: number;
  readonly incompleteJobs: number; readonly unverifiedProposals: number;
  readonly requestedContextExpansions: number; readonly deferredContextExpansions: number;
  readonly requestedVerifications: number; readonly deferredVerifications: number;
}): Readonly<Record<string, string | number>> {
  const { head, compilation, reportDigest } = values;
  return Object.freeze({
    ...repositoryPlanFacts(head, compilation, reportDigest),
    'review.repository_mode': compilation.profile.mode,
    'review.repository_slices': compilation.plan.slices.length,
    'review.repository_confirmed': values.confirmed,
    'review.repository_rejected': values.rejected,
    'review.repository_confirmed_simplifications': values.confirmedSimplifications,
    'review.repository_rejected_simplifications': values.rejectedSimplifications,
    'review.repository_review_cache_hits': values.reviewCacheHits,
    'review.repository_review_cache_misses': values.reviewCacheMisses,
    'review.repository_verification_cache_hits': values.verificationCacheHits,
    'review.repository_verification_cache_misses': values.verificationCacheMisses,
    'review.repository_actual_model_calls': values.actualModelCalls,
    'review.repository_reserved_input_tokens': values.reservedInputTokens,
    'review.repository_reserved_output_tokens': values.reservedOutputTokens,
    'review.repository_reserved_estimated_cost_usd': values.reservedEstimatedCostUsd,
    'review.repository_context_expansions': values.contextExpansions,
    'review.repository_incomplete_jobs': values.incompleteJobs,
    'review.repository_unverified_proposals': values.unverifiedProposals,
    'review.repository_requested_context_expansions': values.requestedContextExpansions,
    'review.repository_deferred_context_expansions': values.deferredContextExpansions,
    'review.repository_requested_verifications': values.requestedVerifications,
    'review.repository_deferred_verifications': values.deferredVerifications,
  });
}
