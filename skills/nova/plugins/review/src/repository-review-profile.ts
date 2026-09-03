/* eslint-disable max-lines -- Review grades, validation, and resolution stay together as one profile authority. */
import { canonicalJson, sha256Text } from '@kubeclaw/plugin-sdk';

import type { ReviewSliceBudget } from './review-scale-slicing.ts';
import type { ReviewTokenizerEncoding } from './review-prompt-budget.ts';

export type RepositoryReviewGrade = 'fast' | 'standard' | 'deep';
export type RepositoryReviewMode = 'plan' | 'execute' | 'resume';
export type RepositoryReviewScope =
  | { readonly kind: 'repository' }
  | { readonly kind: 'plugin'; readonly names: readonly string[]; readonly dependencyRadius?: 0 | 1 }
  | { readonly kind: 'path'; readonly prefixes: readonly string[] };

export interface RepositoryReviewProfileOverrides {
  readonly tokenizerEncoding?: ReviewTokenizerEncoding;
  readonly componentBudget?: Partial<ReviewSliceBudget>;
  readonly boundaryBudget?: Partial<ReviewSliceBudget> & { readonly maxRelations?: number; readonly maxSlices?: number };
  readonly maxPrimaryJobs?: number;
  readonly maxContextExpansionJobs?: number;
  readonly maxVerificationJobs?: number;
  readonly maxInputTokensPerJob?: number;
  readonly maxPromptTokensPerJob?: number;
  readonly maxContextTokensPerJob?: number;
  readonly maxPromptBytesPerJob?: number;
  readonly maxInitialInputTokens?: number;
  readonly maxContextExpansionInputTokens?: number;
  readonly maxVerificationInputTokens?: number;
  readonly maxTotalInputTokens?: number;
  readonly maxInputTokens?: number;
  readonly maxOutputTokensPerJob?: number;
  readonly maxEstimatedCostUsd?: number;
  readonly maxWallTimeSeconds?: number;
  readonly estimatedSecondsPerJob?: number;
  readonly inputUsdPerMillionTokens?: number;
  readonly outputUsdPerMillionTokens?: number;
  readonly concurrency?: number;
  readonly maxRetries?: number;
  readonly maxRetryAttemptsPerPhase?: number;
  readonly enabledLenses?: readonly RepositoryReviewLens[];
}

export type RepositoryReviewLens =
  | 'architecture' | 'contracts' | 'security' | 'lifecycle' | 'resilience' | 'deployment' | 'simplification';

export interface ResolvedRepositoryReviewProfile {
  readonly schemaVersion: 'repository-review-profile.v1';
  readonly grade: RepositoryReviewGrade;
  readonly mode: RepositoryReviewMode;
  readonly scope: RepositoryReviewScope;
  readonly allowedPrefixes: readonly string[];
  readonly tokenizerEncoding: ReviewTokenizerEncoding;
  readonly componentBudget: ReviewSliceBudget;
  readonly boundaryBudget: ReviewSliceBudget & { readonly maxRelations: number; readonly maxSlices: number };
  readonly maxPrimaryJobs: number;
  readonly maxContextExpansionJobs: number;
  readonly maxVerificationJobs: number;
  readonly maxInputTokensPerJob: number;
  readonly maxContextTokensPerJob: number;
  readonly maxPromptBytesPerJob: number;
  readonly maxInitialInputTokens: number;
  readonly maxContextExpansionInputTokens: number;
  readonly maxVerificationInputTokens: number;
  readonly maxTotalInputTokens: number;
  readonly maxOutputTokensPerJob: number;
  readonly maxEstimatedCostUsd: number;
  readonly maxWallTimeSeconds: number;
  readonly estimatedSecondsPerJob: number;
  readonly inputUsdPerMillionTokens: number;
  readonly outputUsdPerMillionTokens: number;
  readonly concurrency: number;
  readonly maxRetries: number;
  readonly maxRetryAttemptsPerPhase: number;
  readonly enabledLenses: readonly RepositoryReviewLens[];
  readonly digest: `sha256:${string}`;
}

interface GradeDefaults extends RepositoryReviewProfileOverrides {
  readonly tokenizerEncoding: ReviewTokenizerEncoding;
  readonly componentBudget: ReviewSliceBudget;
  readonly boundaryBudget: ReviewSliceBudget & { readonly maxRelations: number; readonly maxSlices: number };
  readonly maxPrimaryJobs: number;
  readonly maxContextExpansionJobs: number;
  readonly maxVerificationJobs: number;
  readonly maxInputTokensPerJob: number;
  readonly maxContextTokensPerJob: number;
  readonly maxPromptBytesPerJob: number;
  readonly maxInitialInputTokens: number;
  readonly maxContextExpansionInputTokens: number;
  readonly maxVerificationInputTokens: number;
  readonly maxTotalInputTokens: number;
  readonly maxOutputTokensPerJob: number;
  readonly maxEstimatedCostUsd: number;
  readonly maxWallTimeSeconds: number;
  readonly estimatedSecondsPerJob: number;
  readonly inputUsdPerMillionTokens: number;
  readonly outputUsdPerMillionTokens: number;
  readonly concurrency: number;
  readonly maxRetries: number;
  readonly maxRetryAttemptsPerPhase: number;
  readonly enabledLenses: readonly RepositoryReviewLens[];
}

const ALL_LENSES = Object.freeze<RepositoryReviewLens[]>([
  'architecture', 'contracts', 'security', 'lifecycle', 'resilience', 'deployment', 'simplification',
]);
const DEFAULTS: Readonly<Record<RepositoryReviewGrade, GradeDefaults>> = Object.freeze({
  fast: Object.freeze({
    tokenizerEncoding: 'o200k_base',
    componentBudget: Object.freeze({ maxFiles: 60, maxBytes: 400_000, maxTokens: 86_000 }),
    boundaryBudget: Object.freeze({ maxFiles: 400, maxBytes: 900_000, maxTokens: 80_000, maxRelations: 600, maxSlices: 200 }),
    maxPrimaryJobs: 75, maxContextExpansionJobs: 12, maxVerificationJobs: 8, maxInputTokensPerJob: 120_000,
    maxContextTokensPerJob: 128_000, maxPromptBytesPerJob: 900_000,
    maxInitialInputTokens: 6_500_000, maxContextExpansionInputTokens: 750_000,
    maxVerificationInputTokens: 750_000, maxTotalInputTokens: 8_000_000,
    maxOutputTokensPerJob: 6_000, maxEstimatedCostUsd: 100,
    maxWallTimeSeconds: 3_600, estimatedSecondsPerJob: 120,
    inputUsdPerMillionTokens: 10, outputUsdPerMillionTokens: 30, concurrency: 8, maxRetries: 1,
    maxRetryAttemptsPerPhase: 4,
    enabledLenses: Object.freeze<RepositoryReviewLens[]>(['contracts', 'security', 'lifecycle']),
  }),
  standard: Object.freeze({
    tokenizerEncoding: 'o200k_base',
    componentBudget: Object.freeze({ maxFiles: 60, maxBytes: 400_000, maxTokens: 86_000 }),
    boundaryBudget: Object.freeze({ maxFiles: 400, maxBytes: 900_000, maxTokens: 80_000, maxRelations: 600, maxSlices: 200 }),
    maxPrimaryJobs: 500, maxContextExpansionJobs: 100, maxVerificationJobs: 100, maxInputTokensPerJob: 120_000,
    maxContextTokensPerJob: 128_000, maxPromptBytesPerJob: 900_000,
    maxInitialInputTokens: 25_000_000, maxContextExpansionInputTokens: 50_000_000,
    maxVerificationInputTokens: 50_000_000, maxTotalInputTokens: 50_000_000,
    maxOutputTokensPerJob: 6_000, maxEstimatedCostUsd: 650,
    maxWallTimeSeconds: 28_800, estimatedSecondsPerJob: 120,
    inputUsdPerMillionTokens: 10, outputUsdPerMillionTokens: 30, concurrency: 10, maxRetries: 2,
    maxRetryAttemptsPerPhase: 20,
    enabledLenses: ALL_LENSES,
  }),
  deep: Object.freeze({
    tokenizerEncoding: 'o200k_base',
    componentBudget: Object.freeze({ maxFiles: 30, maxBytes: 220_000, maxTokens: 90_000 }),
    boundaryBudget: Object.freeze({ maxFiles: 100, maxBytes: 480_000, maxTokens: 110_000, maxRelations: 100, maxSlices: 32 }),
    maxPrimaryJobs: 2_000, maxContextExpansionJobs: 250, maxVerificationJobs: 250, maxInputTokensPerJob: 120_000,
    maxContextTokensPerJob: 128_000, maxPromptBytesPerJob: 900_000,
    maxInitialInputTokens: 50_000_000, maxContextExpansionInputTokens: 100_000_000,
    maxVerificationInputTokens: 100_000_000, maxTotalInputTokens: 100_000_000,
    maxOutputTokensPerJob: 6_000, maxEstimatedCostUsd: 1_300,
    maxWallTimeSeconds: 86_400, estimatedSecondsPerJob: 150,
    inputUsdPerMillionTokens: 10, outputUsdPerMillionTokens: 30, concurrency: 4, maxRetries: 2,
    maxRetryAttemptsPerPhase: 40,
    enabledLenses: ALL_LENSES,
  }),
});

function positive(value: unknown, fallback: number, label: string, maximum: number): number {
  const resolved = value === undefined ? fallback : value;
  if (!Number.isSafeInteger(resolved) || Number(resolved) < 1 || Number(resolved) > maximum) {
    throw new Error(`repository review profile ${label} is invalid`);
  }
  return Number(resolved);
}
function nonNegative(value: unknown, fallback: number, label: string, maximum: number): number {
  const resolved = value === undefined ? fallback : value;
  if (!Number.isSafeInteger(resolved) || Number(resolved) < 0 || Number(resolved) > maximum) {
    throw new Error(`repository review profile ${label} is invalid`);
  }
  return Number(resolved);
}

function positiveNumber(value: unknown, fallback: number, label: string, maximum: number): number {
  const resolved = value === undefined ? fallback : value;
  if (typeof resolved !== 'number' || !Number.isFinite(resolved) || resolved <= 0 || resolved > maximum) {
    throw new Error(`repository review profile ${label} is invalid`);
  }
  return resolved;
}

function budget(
  override: RepositoryReviewProfileOverrides['componentBudget'] | undefined,
  fallback: ReviewSliceBudget,
): ReviewSliceBudget {
  if (override !== undefined && (!override || typeof override !== 'object' || Array.isArray(override))) {
    throw new Error('repository review profile slice budget is invalid');
  }
  return Object.freeze({
    maxFiles: positive(override?.maxFiles, fallback.maxFiles, 'file budget', 10_000),
    maxBytes: positive(override?.maxBytes, fallback.maxBytes, 'byte budget', 100_000_000),
    maxTokens: positive(override?.maxTokens, fallback.maxTokens, 'token budget', 100_000_000),
  });
}

function checkedPrefixes(raw: unknown): readonly string[] {
  if (!Array.isArray(raw) || raw.some((value) => typeof value !== 'string')) {
    throw new Error('repository review profile scope is invalid');
  }
  if (raw.length < 1 || raw.length > 64 || raw.some((value) => !value || value.startsWith('/') || value.includes('..'))) {
    throw new Error('repository review profile scope is invalid');
  }
  return raw;
}
function pluginPrefixes(scope: Extract<RepositoryReviewScope, { readonly kind: 'plugin' }>): readonly string[] {
  const names = checkedPrefixes(scope.names), radius = scope.dependencyRadius ?? 1;
  if (![0, 1].includes(radius)) throw new Error('repository review profile dependency radius is invalid');
  if (names.some((name) => !/^[a-z0-9][a-z0-9-]*$/u.test(name)))
    throw new Error('repository review profile plugin name is invalid');
  const dependencies = radius === 1
    ? ['skills/common/plugin-runtime/', 'skills/common/plugins/runtime-dispatch/', 'contracts/'] : [];
  return Object.freeze([...new Set([...names.map((name) => `skills/nova/plugins/${name}/`), ...dependencies])].sort());
}
function prefixes(scope: RepositoryReviewScope): readonly string[] {
  if (scope.kind === 'repository') return Object.freeze(['.']);
  if (scope.kind === 'plugin') return pluginPrefixes(scope);
  return Object.freeze([...new Set(checkedPrefixes(scope.prefixes))].sort());
}

function reviewGrade(value: RepositoryReviewGrade | undefined): RepositoryReviewGrade {
  const grade = value ?? 'standard';
  if (!DEFAULTS[grade]) throw new Error('repository review grade is invalid');
  return grade;
}
function reviewMode(value: RepositoryReviewMode | undefined): RepositoryReviewMode {
  const mode = value ?? 'execute';
  if (!['plan', 'execute', 'resume'].includes(mode)) throw new Error('repository review mode is invalid');
  return mode;
}
function reviewScope(value: RepositoryReviewScope | undefined): RepositoryReviewScope {
  const scope = value ?? { kind: 'repository' };
  if (!scope || typeof scope !== 'object' || !['repository', 'plugin', 'path'].includes(scope.kind)) {
    throw new Error('repository review profile scope is invalid');
  }
  return scope;
}
function reviewLenses(
  overrides: RepositoryReviewProfileOverrides, defaults: GradeDefaults,
): readonly RepositoryReviewLens[] {
  const selected = overrides.enabledLenses ?? defaults.enabledLenses;
  if (!Array.isArray(selected)) throw new Error('repository review profile lenses are invalid');
  const lenses = Object.freeze([...selected]);
  if (new Set(lenses).size !== lenses.length || lenses.some((lens) => !ALL_LENSES.includes(lens))) {
    throw new Error('repository review profile lenses are invalid');
  }
  return lenses;
}
function reviewOverrides(value: RepositoryReviewProfileOverrides | undefined): RepositoryReviewProfileOverrides {
  if (value === undefined) return {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('repository review profile overrides are invalid');
  }
  return value;
}

function tokenizerEncoding(value: ReviewTokenizerEncoding | undefined, fallback: ReviewTokenizerEncoding): ReviewTokenizerEncoding {
  const resolved = value ?? fallback;
  if (!['o200k_base', 'cl100k_base'].includes(resolved)) {
    throw new Error('repository review profile tokenizer encoding is invalid');
  }
  if (resolved !== 'o200k_base') {
    throw new Error('repository review profile tokenizer encoding conflicts with the review runtime target');
  }
  return resolved;
}

function runtimeOutputTokens(value: number | undefined, fallback: number): number {
  const resolved = positive(value, fallback, 'output token reserve', 1_000_000);
  if (resolved !== 6_000) {
    throw new Error('repository review profile output token reserve conflicts with the review runtime target');
  }
  return resolved;
}

function runtimeMaximum(value: number | undefined, fallback: number, label: string, maximum: number): number {
  const resolved = positive(value, fallback, label, 100_000_000);
  if (resolved > maximum) throw new Error(`repository review profile ${label} exceeds the review runtime target`);
  return resolved;
}

function operationalLimits(
  overrides: RepositoryReviewProfileOverrides, defaults: GradeDefaults,
): Omit<GradeDefaults, 'tokenizerEncoding' | 'componentBudget' | 'boundaryBudget' | 'enabledLenses'> {
  const totalInputOverride = overrides.maxTotalInputTokens ?? overrides.maxInputTokens;
  const limits = {
    maxPrimaryJobs: positive(overrides.maxPrimaryJobs, defaults.maxPrimaryJobs, 'primary job limit', 10_000),
    maxContextExpansionJobs: positive(overrides.maxContextExpansionJobs,
      defaults.maxContextExpansionJobs, 'context expansion job limit', 10_000),
    maxVerificationJobs: positive(overrides.maxVerificationJobs, defaults.maxVerificationJobs, 'verification job limit', 10_000),
    maxInputTokensPerJob: runtimeMaximum(overrides.maxInputTokensPerJob ?? overrides.maxPromptTokensPerJob,
      defaults.maxInputTokensPerJob, 'per-job input token limit', 120_000),
    maxContextTokensPerJob: runtimeMaximum(overrides.maxContextTokensPerJob,
      defaults.maxContextTokensPerJob, 'per-job context token limit', 128_000),
    maxPromptBytesPerJob: runtimeMaximum(overrides.maxPromptBytesPerJob,
      defaults.maxPromptBytesPerJob, 'per-job byte limit', 900_000),
    maxInitialInputTokens: positive(overrides.maxInitialInputTokens, defaults.maxInitialInputTokens,
      'initial input token limit', 1_000_000_000),
    maxContextExpansionInputTokens: positive(overrides.maxContextExpansionInputTokens,
      defaults.maxContextExpansionInputTokens, 'context expansion input token limit', 1_000_000_000),
    maxVerificationInputTokens: positive(overrides.maxVerificationInputTokens,
      defaults.maxVerificationInputTokens, 'verification input token limit', 1_000_000_000),
    maxTotalInputTokens: positive(totalInputOverride, defaults.maxTotalInputTokens, 'total input token limit', 1_000_000_000),
    maxOutputTokensPerJob: runtimeOutputTokens(overrides.maxOutputTokensPerJob, defaults.maxOutputTokensPerJob),
    maxEstimatedCostUsd: positiveNumber(overrides.maxEstimatedCostUsd, defaults.maxEstimatedCostUsd, 'cost limit', 1_000_000),
    maxWallTimeSeconds: positive(overrides.maxWallTimeSeconds, defaults.maxWallTimeSeconds, 'wall time limit', 604_800),
    estimatedSecondsPerJob: positive(overrides.estimatedSecondsPerJob, defaults.estimatedSecondsPerJob, 'job duration estimate', 86_400),
    inputUsdPerMillionTokens: positiveNumber(overrides.inputUsdPerMillionTokens, defaults.inputUsdPerMillionTokens, 'input price', 10_000),
    outputUsdPerMillionTokens: positiveNumber(overrides.outputUsdPerMillionTokens, defaults.outputUsdPerMillionTokens, 'output price', 10_000),
    concurrency: positive(overrides.concurrency, defaults.concurrency, 'concurrency', 32),
    maxRetries: nonNegative(overrides.maxRetries, defaults.maxRetries, 'retry limit', 10),
    maxRetryAttemptsPerPhase: nonNegative(overrides.maxRetryAttemptsPerPhase,
      defaults.maxRetryAttemptsPerPhase, 'shared retry-attempt limit', 10_000),
  };
  if (limits.maxInputTokensPerJob + limits.maxOutputTokensPerJob > limits.maxContextTokensPerJob) {
    throw new Error('repository review profile per-job token limits exceed the context limit');
  }
  if ([limits.maxInitialInputTokens, limits.maxContextExpansionInputTokens,
    limits.maxVerificationInputTokens].some((value) => value > limits.maxTotalInputTokens)) {
    throw new Error('repository review profile phase token limit exceeds the combined input limit');
  }
  return limits;
}

export function resolveRepositoryReviewProfile(values: {
  readonly grade?: RepositoryReviewGrade;
  readonly mode?: RepositoryReviewMode;
  readonly scope?: RepositoryReviewScope;
  readonly overrides?: RepositoryReviewProfileOverrides;
}): ResolvedRepositoryReviewProfile {
  const grade = reviewGrade(values.grade), defaults = DEFAULTS[grade];
  const mode = reviewMode(values.mode), scope = reviewScope(values.scope), overrides = reviewOverrides(values.overrides);
  const componentBudget = budget(overrides.componentBudget, defaults.componentBudget);
  const baseBoundary = budget(overrides.boundaryBudget, defaults.boundaryBudget);
  const boundaryBudget = Object.freeze({ ...baseBoundary,
    maxRelations: positive(overrides.boundaryBudget?.maxRelations, defaults.boundaryBudget.maxRelations, 'boundary relation budget', 100_000),
    maxSlices: positive(overrides.boundaryBudget?.maxSlices, defaults.boundaryBudget.maxSlices, 'boundary slice budget', 10_000),
  });
  const enabledLenses = reviewLenses(overrides, defaults);
  const unsigned = {
    schemaVersion: 'repository-review-profile.v1' as const, grade, mode, scope,
    allowedPrefixes: prefixes(scope), tokenizerEncoding: tokenizerEncoding(overrides.tokenizerEncoding, defaults.tokenizerEncoding),
    componentBudget, boundaryBudget, ...operationalLimits(overrides, defaults), enabledLenses,
  };
  return Object.freeze({ ...unsigned, digest: sha256Text(canonicalJson(unsigned)) });
}

export function parseRepositoryReviewInput(value: unknown): ResolvedRepositoryReviewProfile {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('repository audit input is invalid');
  const record = value as Readonly<Record<string, unknown>>;
  const allowed = new Set(['allowedPrefixes', 'grade', 'mode', 'scope', 'overrides']);
  if (Object.keys(record).some((key) => !allowed.has(key))) throw new Error('repository audit input has unknown fields');
  const legacy = record.allowedPrefixes;
  const scope = record.scope ?? (legacy === undefined ? { kind: 'repository' } : { kind: 'path', prefixes: legacy });
  const settings: { grade?: RepositoryReviewGrade; mode?: RepositoryReviewMode; scope: RepositoryReviewScope;
    overrides?: RepositoryReviewProfileOverrides } = { scope: scope as RepositoryReviewScope };
  if (record.grade !== undefined) settings.grade = record.grade as RepositoryReviewGrade;
  if (record.mode !== undefined) settings.mode = record.mode as RepositoryReviewMode;
  if (record.overrides !== undefined) settings.overrides = record.overrides as RepositoryReviewProfileOverrides;
  return resolveRepositoryReviewProfile(settings);
}
