import { getReviewDefaultsConfig } from '../services/runtime-defaults.ts';
import { selectTruthyValue } from '../optional-absence.ts';

type AnyRecord = Record<string, any>;

function positiveNumber(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function nonNegativeNumber(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function reviewer(value: unknown): AnyRecord {
  return typeof value === 'string' ? { label: value } : value as AnyRecord;
}

export function reviewReviewerLabel(value: unknown): string | null {
  if (typeof value === 'string') return value;
  const candidate = value as AnyRecord | null;
  if (candidate?.label) return candidate.label;
  if (candidate?.id) return candidate.id;
  return candidate?.name ?? null;
}

function configuredReviewers(gate: AnyRecord, defaults: AnyRecord) {
  if (Array.isArray(gate?.reviewers)) return { reviewers: gate.reviewers.map(reviewer), source: 'gate.reviewers' };
  if (Array.isArray(defaults?.reviewers)) return { reviewers: defaults.reviewers.map(reviewer), source: 'progress.defaults.reviewers' };
  return { reviewers: [], source: 'none' };
}

function primaryReviewer(gate: AnyRecord, defaults: AnyRecord, reviewers: AnyRecord[], source: string) {
  const explicit = gate?.primary_reviewer !== undefined ? gate.primary_reviewer : defaults?.primary_reviewer;
  const label = reviewReviewerLabel(explicit);
  if (label) {
    const matched = reviewers.find((candidate) => reviewReviewerLabel(candidate) === label) ?? null;
    return { reviewer: matched, policy: matched ? 'explicit_primary_reviewer' : 'primary_reviewer_not_configured', source: matched ? source : 'primary_reviewer' };
  }
  if (reviewers.length === 1) return { reviewer: reviewers[0], policy: 'single_configured_reviewer', source };
  return { reviewer: null, policy: reviewers.length > 1 ? 'missing_primary_reviewer' : 'none', source };
}

function lintPolicy(gate: AnyRecord, defaults: AnyRecord, tier: string | null) {
  const required = gate?.lint_required ?? defaults?.lint_required;
  if (required === false) return { lintRequired: false, source: 'explicit_optional_review_lint' };
  if (required === true) return { lintRequired: true, source: 'explicit_required_review_lint' };
  return { lintRequired: Boolean(tier), source: 'configured_review_lint_required' };
}

export function resolveReviewGateConfig(config: AnyRecord, progress: AnyRecord, gate: AnyRecord) {
  const defaults = getReviewDefaultsConfig(config);
  const projectDefaults = progress?.defaults && typeof progress.defaults === 'object' && !Array.isArray(progress.defaults)
    ? progress.defaults : {};
  const configured = configuredReviewers(gate, projectDefaults);
  const primary = primaryReviewer(gate, projectDefaults, configured.reviewers, configured.source);
  const tier = gate.lint_tier;
  const lint = lintPolicy(gate, defaults, tier);
  return {
    reviewers: configured.reviewers, reviewersSource: configured.source,
    primaryReviewer: primary.reviewer, primaryReviewerPolicy: primary.policy, primaryReviewerSource: primary.source,
    timeout: positiveNumber(gate.timeout_minutes),
    timeoutPolicySource: gate.timeout_minutes !== undefined ? 'gate.timeout_minutes' : 'config.review_defaults.timeout_minutes',
    maxFixCycles: nonNegativeNumber(gate.max_fix_cycles ?? 0),
    maxFixCyclesPolicySource: gate.max_fix_cycles !== undefined ? 'gate.max_fix_cycles' : 'config.review_defaults.max_fix_cycles',
    lintTier: tier, lintRequired: lint.lintRequired, lintPolicySource: lint.source,
  };
}

export function reviewGateConfigErrors(gateId: string, config: AnyRecord): string[] {
  const errors: string[] = [];
  if (selectTruthyValue(() => !Array.isArray(config.reviewers), () => config.reviewers.length === 0)) errors.push(`No reviewers configured for gate '${gateId}'`);
  if (!config.primaryReviewer) errors.push(`Review gate '${gateId}' requires an explicit primary reviewer policy`);
  if (selectTruthyValue(() => !Number.isFinite(config.timeout), () => config.timeout <= 0)) errors.push(`Review gate '${gateId}' requires typed review timeout policy`);
  if (!config.lintTier) errors.push(`Review gate '${gateId}' requires typed review lint tier policy`);
  return errors;
}
