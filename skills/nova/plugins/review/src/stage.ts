import { sha256Text, type PluginInvocationContext, type StageResult, type WaitRequest } from '@kubeclaw/plugin-sdk';

import { assertEchoContextRequestRequirements } from './echo-context-request-parser.ts';
import { parseEchoReviewDispatchResponse, type ParsedEchoReviewOutput } from './echo-review-parser.ts';
import { buildReviewDispatchRequest } from './protocol.ts';
import type { ReviewBundleSnapshot } from './review-bundle-snapshot.ts';
import { expandReviewContext, type ReviewContextSelectionResult } from './review-context-selection.ts';
import { getReviewPolicyProfile } from './review-policy-profiles.ts';
import {
  buildInvalidReviewGovernorSnapshot, buildReviewGovernorSnapshot,
  ReviewGovernorIntegrityError, type ReviewGovernorSnapshot,
} from './review-governor.ts';
import { readReviewGovernorBaseline } from './review-governor-history.ts';
import { resolveReviewPolicy, type ResolvedReviewPolicy } from './review-policy-resolver.ts';
import { ReviewRepositoryProofError, type FrozenReviewRevision } from './review-repository.ts';
import { reduceReviewDecision } from './review-reducer.ts';
import { REVIEW_ORCHESTRATOR_ISSUER_ID, certifyReviewReductionInput } from './review-reduction-state.ts';
import { parseReviewInput, preflightReviewInput, type ReviewStageInput } from './review-stage-input.ts';
import { verifyEchoReviewForReduction } from './review-stage-verification.ts';
import { ReviewVerificationRequestLimitError } from './review-verifier.ts';
import { ReviewSemanticFlowIntegrityError, runReviewSemanticFlow } from './review-semantic-flow.ts';
import { finalizeReview, persistReviewOutcome } from './review-report-flow.ts';
import { mergeSlicedEchoOutputs } from './review-slicing.ts';
import { buildReviewSnapshot, prepareReview, ReviewPreparationIntegrityError,
  ReviewPreparationLimitError, type PreparedReview } from './review-preparation.ts';
import { blockedReviewStage } from './review-stage-result.ts';

interface ReviewStageConfig { readonly agent: string; readonly profile: string; readonly policy?: unknown }
class ReviewStageIntegrityError extends Error {
  readonly snapshot: ReviewBundleSnapshot | undefined;
  constructor(message: string, snapshot?: ReviewBundleSnapshot) {
    super(message); this.snapshot = snapshot;
  }
}

function config(context: PluginInvocationContext): ReviewStageConfig {
  const value = context.contract.config;
  const agent = typeof value.agent === 'string' ? value.agent.trim() : '';
  if (!agent) throw new Error('review agent is not configured');
  const profile = value.profile === undefined ? 'gate' : value.profile;
  if (typeof profile !== 'string' || !profile.trim()) throw new Error('review profile is invalid');
  return { agent, profile, ...(value.policy === undefined ? {} : { policy: value.policy }) };
}

function reviewWait(context: PluginInvocationContext): WaitRequest | undefined {
  const attemptId = context.contract.lease?.attempt?.attemptId;
  if (typeof attemptId !== 'string' || !attemptId) return undefined;
  const suffix = sha256Text(attemptId).slice('sha256:'.length);
  return {
    schemaVersion: 'wait-request.v2', waitId: `review:${suffix}`, kind: 'orchestrator',
    signalType: 'kubeclaw.review.resolve',
    authorizedIssuer: { type: 'orchestrator', id: REVIEW_ORCHESTRATOR_ISSUER_ID }, expiresAt: null,
  };
}

function invalidInputResult(error: string, resolvedPolicy: ResolvedReviewPolicy): StageResult {
  return reduceReviewDecision(certifyReviewReductionInput({
    resolvedPolicy, integrityIssues: [`invalid review input: ${error}`],
    unverifiedRequirements: [], limitViolations: [], findings: [],
  }));
}

function bundleLimitResult(
  violation: string, resolvedPolicy: ResolvedReviewPolicy, orchestratorWait?: WaitRequest,
): StageResult {
  return reduceReviewDecision(certifyReviewReductionInput({
    resolvedPolicy, integrityIssues: [], unverifiedRequirements: [], findings: [],
    limitViolations: [violation], orchestratorWait,
  }));
}

async function dispatchEcho(
  agent: string, snapshot: ReviewBundleSnapshot, resolvedPolicy: ResolvedReviewPolicy,
  context: PluginInvocationContext,
): Promise<ParsedEchoReviewOutput> {
  const response = await context.invoke('runtime.dispatch', {
    operation: 'dispatch', resource: { type: 'runtime.agent', canonicalId: agent },
    payload: buildReviewDispatchRequest(agent, snapshot, context.contract.guidance?.helperPrompt, resolvedPolicy),
  });
  return parseEchoReviewDispatchResponse(response);
}

interface ExpansionDispatchInput {
  readonly first: Extract<ParsedEchoReviewOutput, { readonly ok: true }>;
  readonly input: ReviewStageInput;
  readonly scope: PreparedReview['repository']['scope'];
  readonly initial: ReviewContextSelectionResult;
  readonly candidates: readonly unknown[];
  readonly revision: FrozenReviewRevision;
  readonly manifestDigest: `sha256:${string}`;
  readonly policy: ResolvedReviewPolicy;
  readonly agent: string;
  readonly context: PluginInvocationContext;
}

async function expandedDispatch(
  values: ExpansionDispatchInput,
): Promise<{ readonly parsed: ParsedEchoReviewOutput; readonly snapshot: ReviewBundleSnapshot }> {
  const { first, input, scope, initial, candidates, revision, manifestDigest, policy, agent, context } = values;
  const request = first.value.contextRequest;
  if (!request) throw new Error('context expansion request is missing');
  let expanded: ReviewContextSelectionResult;
  try {
    assertEchoContextRequestRequirements(request, input.requirements.map(({ id }) => id));
    expanded = expandReviewContext(candidates, initial, request.paths, scope, policy);
  } catch (error) {
    throw new ReviewStageIntegrityError(error instanceof Error ? error.message : String(error));
  }
  const remaining = request.paths.filter((path) => !expanded.selected.some((item) => item.path === path));
  if (remaining.length > 0) throw new ReviewStageIntegrityError(`requested context exceeds policy limits: ${remaining.join(', ')}`);
  const snapshot = buildReviewSnapshot({ input, scope, manifestDigest, revision, selection: expanded, policy });
  const parsed = await dispatchEcho(agent, snapshot, policy, context);
  if (parsed.ok && parsed.value.contextRequest) {
    throw new ReviewStageIntegrityError('Echo requested more than one context expansion', snapshot);
  }
  return { parsed, snapshot };
}

function resolvedStagePolicy(stageConfig: ReviewStageConfig): ResolvedReviewPolicy | StageResult {
  try {
    return resolveReviewPolicy({
      builtIn: getReviewPolicyProfile(stageConfig.profile),
      ...(stageConfig.policy === undefined ? {} : { settingsFile: stageConfig.policy }),
    });
  } catch (error) {
    return blockedReviewStage('kubeclaw.review.invalid_policy', error instanceof Error ? error.message : String(error));
  }
}

async function reviewGovernor(
  prepared: PreparedReview, input: ReviewStageInput, snapshot: ReviewBundleSnapshot,
  policy: ResolvedReviewPolicy, context: PluginInvocationContext,
): Promise<ReviewGovernorSnapshot> {
  try {
    const baseline = await readReviewGovernorBaseline(context);
    return await buildReviewGovernorSnapshot({
      input, snapshot, revision: prepared.revision, policy, context,
      ...(baseline === undefined ? {} : { baseline }),
    });
  } catch (error) {
    if (error instanceof ReviewGovernorIntegrityError || error instanceof ReviewRepositoryProofError) {
      return buildInvalidReviewGovernorSnapshot({ input, snapshot, policy, context });
    }
    throw error;
  }
}

function knownFailureResult(
  error: unknown, policy: ResolvedReviewPolicy, wait: WaitRequest | undefined,
): StageResult | undefined {
  if (error instanceof ReviewPreparationLimitError) return bundleLimitResult(error.message, policy, wait);
  if (error instanceof ReviewVerificationRequestLimitError) return bundleLimitResult(error.message, policy, wait);
  if (error instanceof ReviewSemanticFlowIntegrityError && error.kind === 'limit') {
    return bundleLimitResult(error.message, policy, wait);
  }
  if (error instanceof ReviewRepositoryProofError || error instanceof ReviewStageIntegrityError
    || error instanceof ReviewPreparationIntegrityError
    || error instanceof ReviewSemanticFlowIntegrityError) {
    return invalidInputResult(error.message, policy);
  }
  return undefined;
}

async function dispatchWithOptionalExpansion(
  prepared: PreparedReview, input: ReviewStageInput, stageConfig: ReviewStageConfig,
  policy: ResolvedReviewPolicy, context: PluginInvocationContext,
): Promise<{ readonly echo: ParsedEchoReviewOutput; readonly snapshot: ReviewBundleSnapshot }> {
  if (prepared.sliceSnapshots.length > 1) {
    const outputs: ParsedEchoReviewOutput[] = [];
    for (const slice of prepared.sliceSnapshots) outputs.push(await dispatchEcho(stageConfig.agent, slice, policy, context));
    return { echo: mergeSlicedEchoOutputs(outputs), snapshot: prepared.snapshot };
  }
  const first = await dispatchEcho(stageConfig.agent, prepared.snapshot, policy, context);
  if (!first.ok || !first.value.contextRequest) return { echo: first, snapshot: prepared.snapshot };
  const expanded = await expandedDispatch({
    first, input, scope: prepared.repository.scope, initial: prepared.initial,
    candidates: prepared.candidates, revision: prepared.revision,
    manifestDigest: prepared.repository.manifestDigest, policy, agent: stageConfig.agent, context,
  });
  return { echo: expanded.parsed, snapshot: expanded.snapshot };
}

type Guarded<T> = { readonly value: T } | { readonly result: StageResult; readonly error: unknown };

async function guardKnownFailure<T>(
  operation: () => Promise<T>, policy: ResolvedReviewPolicy, wait: WaitRequest | undefined,
): Promise<Guarded<T>> {
  try { return { value: await operation() }; } catch (error) {
    const result = knownFailureResult(error, policy, wait);
    if (result) return { result, error };
    throw error;
  }
}

interface DispatchFailureInput {
  readonly failure: Extract<Guarded<never>, { readonly result: StageResult }>;
  readonly snapshot: ReviewBundleSnapshot; readonly policy: ResolvedReviewPolicy;
  readonly wait: WaitRequest | undefined; readonly context: PluginInvocationContext;
  readonly governor: ReviewGovernorSnapshot;
}

function persistDispatchFailure(values: DispatchFailureInput): Promise<StageResult> {
  const { failure, snapshot, policy, wait, context, governor } = values;
  return persistReviewOutcome({
    semantic: { findings: [] },
    parsed: { ok: false, error: failure.error instanceof Error ? failure.error.message : String(failure.error) },
    snapshot, policy, ...(wait === undefined ? {} : { wait }), context, result: failure.result, governor,
  });
}

async function runReview(
  parsedInput: ReviewStageInput, stageConfig: ReviewStageConfig, policy: ResolvedReviewPolicy,
  wait: WaitRequest | undefined, context: PluginInvocationContext,
): Promise<StageResult> {
  const preparation = await guardKnownFailure(() => prepareReview(parsedInput, policy, context), policy, wait);
  if ('result' in preparation) return preparation.result;
  const prepared = preparation.value;
  const dispatch = await guardKnownFailure(
    () => dispatchWithOptionalExpansion(prepared, parsedInput, stageConfig, policy, context), policy, wait,
  );
  if ('result' in dispatch) {
    const snapshot = dispatch.error instanceof ReviewStageIntegrityError && dispatch.error.snapshot
      ? dispatch.error.snapshot : prepared.snapshot;
    const governor = await reviewGovernor(prepared, parsedInput, snapshot, policy, context);
    return persistDispatchFailure({ failure: dispatch, snapshot, policy, wait, context, governor });
  }
  const dispatched = dispatch.value;
  const semantic = await guardKnownFailure(
    () => runReviewSemanticFlow({
      agent: stageConfig.agent, snapshot: dispatched.snapshot, echo: dispatched.echo,
      revision: prepared.revision, policy, context,
    }), policy, wait,
  );
  if ('result' in semantic) {
    const state = semantic.error instanceof ReviewSemanticFlowIntegrityError
      ? semantic.error.state : { findings: [] };
    const governor = await reviewGovernor(prepared, parsedInput, dispatched.snapshot, policy, context);
    return persistReviewOutcome({
      semantic: state, parsed: dispatched.echo, snapshot: dispatched.snapshot,
      policy, ...(wait === undefined ? {} : { wait }), context, result: semantic.result,
      governor,
    });
  }
  const governor = await reviewGovernor(prepared, parsedInput, dispatched.snapshot, policy, context);
  return finalizeReview({
    semantic: semantic.value, parsed: dispatched.echo, snapshot: dispatched.snapshot, policy,
    ...(wait === undefined ? {} : { wait }), context, governor,
  });
}

export async function execute(input: unknown, context: PluginInvocationContext): Promise<StageResult> {
  const stageConfig = config(context);
  const policy = resolvedStagePolicy(stageConfig);
  if ('outcome' in policy) return policy;
  const wait = reviewWait(context);
  const preflight = preflightReviewInput(input, policy.policy.limits.maxBundleBytes);
  if (preflight !== 'within_limit') return invalidInputResult(`review input preflight failed: ${preflight}`, policy);
  const parsedInput = parseReviewInput(input);
  if (!parsedInput.ok) return invalidInputResult(parsedInput.error, policy);
  return runReview(parsedInput.value, stageConfig, policy, wait, context);
}
