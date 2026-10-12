import type { ScalableReviewCompilation } from './scalable-review-compiler.ts';

interface FollowUpCounts {
  readonly requested: number;
  readonly selected: number;
  readonly deferred: number;
  readonly completed: number;
  readonly failed: number;
}

interface DispatchUsage {
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

export function repositoryUsageAccounting(
  dispatch: DispatchUsage, firstAttemptModelCalls: number,
): Readonly<Record<string, unknown>> {
  return Object.freeze({
    schemaVersion: 'repository-review-usage.v1',
    novaReservations: Object.freeze({
      reservedPromptBytes: dispatch.reservedPromptBytes,
      modelPayloadBytes: dispatch.modelPayloadBytes,
      inputTokens: dispatch.reservedInputTokens,
      outputTokens: dispatch.reservedOutputTokens,
      estimatedCostUsd: dispatch.reservedEstimatedCostUsd,
      byPhase: Object.freeze({
        initial: Object.freeze({ calls: dispatch.initialCalls, reservedPromptBytes: dispatch.initialPromptBytes,
          modelPayloadBytes: dispatch.initialPayloadBytes, inputTokens: dispatch.initialInputTokens }),
        contextExpansion: Object.freeze({ calls: dispatch.contextExpansionCalls,
          reservedPromptBytes: dispatch.contextExpansionPromptBytes,
          modelPayloadBytes: dispatch.contextExpansionPayloadBytes,
          inputTokens: dispatch.contextExpansionInputTokens }),
        verification: Object.freeze({ calls: dispatch.verificationCalls,
          reservedPromptBytes: dispatch.verificationPromptBytes,
          modelPayloadBytes: dispatch.verificationPayloadBytes,
          inputTokens: dispatch.verificationInputTokens }),
      }),
    }),
    execution: Object.freeze({ modelCalls: dispatch.calls,
      retryCalls: Math.max(0, dispatch.calls - firstAttemptModelCalls), preflightModelCalls: 0 }),
    provider: Object.freeze({ status: 'unavailable', freshInputTokens: null, cachedInputTokens: null,
      outputTokens: null,
      reason: 'runtime.dispatch does not expose provider token accounting to the review stage' }),
  });
}

export function repositoryCompleteness(values: {
  readonly primary: { readonly requested: number; readonly completed: number; readonly failed: number };
  readonly contextExpansion: FollowUpCounts;
  readonly verification: FollowUpCounts;
}): Readonly<Record<string, unknown>> {
  const allRequestedContextReviewed = values.contextExpansion.deferred === 0;
  const executionFailures = values.primary.failed + values.contextExpansion.failed + values.verification.failed;
  const allRequestedWorkCompleted = allRequestedContextReviewed && values.verification.deferred === 0
    && executionFailures === 0;
  return Object.freeze({
    schemaVersion: 'repository-review-completeness.v1',
    state: executionFailures > 0 ? 'execution-incomplete'
      : allRequestedWorkCompleted ? 'all-requested-work-completed' : 'policy-complete',
    allRequestedContextReviewed,
    allRequestedWorkCompleted,
    primary: Object.freeze({ requested: values.primary.requested, selected: values.primary.requested,
      completed: values.primary.completed, policyDeferred: 0, failed: values.primary.failed }),
    contextExpansion: Object.freeze({ requested: values.contextExpansion.requested,
      selected: values.contextExpansion.selected, completed: values.contextExpansion.completed,
      policyDeferred: values.contextExpansion.deferred, failed: values.contextExpansion.failed }),
    verification: Object.freeze({ requested: values.verification.requested,
      selected: values.verification.selected, completed: values.verification.completed,
      policyDeferred: values.verification.deferred, failed: values.verification.failed }),
  });
}

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
  readonly initialReviewCacheHits: number; readonly initialReviewCacheMisses: number;
  readonly contextExpansionCacheHits: number; readonly contextExpansionCacheMisses: number;
  readonly verificationCacheHits: number; readonly verificationCacheMisses: number;
  readonly actualModelCalls: number; readonly reservedInputTokens: number;
  readonly reservedPromptBytes: number; readonly retryModelCalls: number;
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
    'review.repository_initial_review_cache_hits': values.initialReviewCacheHits,
    'review.repository_initial_review_cache_misses': values.initialReviewCacheMisses,
    'review.repository_context_expansion_cache_hits': values.contextExpansionCacheHits,
    'review.repository_context_expansion_cache_misses': values.contextExpansionCacheMisses,
    'review.repository_verification_cache_hits': values.verificationCacheHits,
    'review.repository_verification_cache_misses': values.verificationCacheMisses,
    'review.repository_actual_model_calls': values.actualModelCalls,
    'review.repository_retry_model_calls': values.retryModelCalls,
    'review.repository_reserved_prompt_bytes': values.reservedPromptBytes,
    'review.repository_reserved_input_tokens': values.reservedInputTokens,
    'review.repository_reserved_output_tokens': values.reservedOutputTokens,
    'review.repository_reserved_estimated_cost_usd': values.reservedEstimatedCostUsd,
    'review.repository_context_expansions': values.contextExpansions,
    'review.repository_incomplete_jobs': values.incompleteJobs,
    'review.repository_unverified_proposals': values.unverifiedProposals,
    'review.repository_requested_context_expansions': values.requestedContextExpansions,
    'review.repository_deferred_context_expansions': values.deferredContextExpansions,
    'review.repository_selected_context_expansions': values.contextExpansions,
    'review.repository_completed_context_expansions': values.contextExpansions,
    'review.repository_failed_context_expansions': 0,
    'review.repository_requested_verifications': values.requestedVerifications,
    'review.repository_deferred_verifications': values.deferredVerifications,
    'review.repository_completed_verifications': values.requestedVerifications - values.deferredVerifications,
    'review.repository_failed_verifications': 0,
    'review.repository_completeness_state': values.deferredContextExpansions === 0
      && values.deferredVerifications === 0 ? 'all-requested-work-completed' : 'policy-complete',
    'review.repository_provider_usage_available': 0,
  });
}
