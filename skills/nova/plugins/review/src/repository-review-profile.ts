import validateGrades from './repository-grade-validator.generated.mjs';
/* eslint-disable max-lines -- Review grades, validation, and resolution stay together as one profile authority. */
import {resolveRepositoryReviewProfile as resolveLegacyProfile, parseRepositoryReviewInput as parseLegacyInput} from './legacy-repository-review-profile.ts';
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
  readonly schemaVersion: 'repository-review-profile.v1' | 'repository-review-profile.v2';
  readonly promptTokenBoundaryReserve?: number | undefined;
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
  if (raw.length < 1 || raw.length > 64) throw new Error('repository review profile scope is invalid');
  return raw.map((value: string) => {
    const normalized = value.replace(/\/+$/u, '');
    if (value === '.') return value;
    if (!normalized || normalized.startsWith('/') || normalized.includes(':') || /[\\\u0000-\u001f\u007f]/u.test(normalized)
      || normalized.split('/').some((part) => !part || part === '.' || part === '..')) {
      throw new Error('repository review profile scope is invalid');
    }
    return normalized;
  });
}
function pluginPrefixes(scope: Extract<RepositoryReviewScope, { readonly kind: 'plugin' }>): readonly string[] {
  const names = checkedPrefixes(scope.names), radius = scope.dependencyRadius ?? 1;
  if (![0, 1].includes(radius)) throw new Error('repository review profile dependency radius is invalid');
  if (names.some((name) => !/^[a-z0-9][a-z0-9-]*$/u.test(name)))
    throw new Error('repository review profile plugin name is invalid');
  const dependencies = radius === 1
    ? ['skills/common/plugin-runtime', 'skills/common/plugins/runtime-dispatch', 'contracts'] : [];
  return Object.freeze([...new Set([...names.map((name) => `skills/nova/plugins/${name}`), ...dependencies])].sort());
}
function prefixes(scope: RepositoryReviewScope): readonly string[] {
  if (scope.kind === 'repository') return Object.freeze(['.']);
  if (scope.kind === 'plugin') return pluginPrefixes(scope);
  return Object.freeze([...new Set(checkedPrefixes(scope.prefixes))].sort());
}

function reviewGrade(value: RepositoryReviewGrade | undefined): RepositoryReviewGrade {
  const grade = value ?? 'standard';
  if (!['fast','standard','deep'].includes(grade)) throw new Error('repository review grade is invalid');
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

function tokenizerEncoding(value: ReviewTokenizerEncoding | undefined, fallback: ReviewTokenizerEncoding, target: RepositoryRuntimeTarget): ReviewTokenizerEncoding {
  const resolved = value ?? fallback;
  if (!['o200k_base', 'cl100k_base'].includes(resolved)) {
    throw new Error('repository review profile tokenizer encoding is invalid');
  }
  if (resolved !== target.tokenizerEncoding) {
    throw new Error('repository review profile tokenizer encoding conflicts with the review runtime target');
  }
  return resolved;
}

function runtimeOutputTokens(value: number | undefined, fallback: number, target: RepositoryRuntimeTarget): number {
  const resolved = positive(value, fallback, 'output token reserve', 1_000_000);
  if (resolved !== target.maxOutputTokens) {
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
  overrides: RepositoryReviewProfileOverrides, defaults: GradeDefaults, target: RepositoryRuntimeTarget,
): Omit<GradeDefaults, 'tokenizerEncoding' | 'componentBudget' | 'boundaryBudget' | 'enabledLenses'> {
  const totalInputOverride = overrides.maxTotalInputTokens ?? overrides.maxInputTokens;
  const limits = {
    maxPrimaryJobs: positive(overrides.maxPrimaryJobs, defaults.maxPrimaryJobs, 'primary job limit', 10_000),
    maxContextExpansionJobs: positive(overrides.maxContextExpansionJobs,
      defaults.maxContextExpansionJobs, 'context expansion job limit', 10_000),
    maxVerificationJobs: positive(overrides.maxVerificationJobs, defaults.maxVerificationJobs, 'verification job limit', 10_000),
    maxInputTokensPerJob: runtimeMaximum(overrides.maxInputTokensPerJob ?? overrides.maxPromptTokensPerJob,
      defaults.maxInputTokensPerJob, 'per-job input token limit', target.maxInputTokens),
    maxContextTokensPerJob: runtimeMaximum(overrides.maxContextTokensPerJob,
      defaults.maxContextTokensPerJob, 'per-job context token limit', target.maxContextTokens),
    maxPromptBytesPerJob: runtimeMaximum(overrides.maxPromptBytesPerJob,
      defaults.maxPromptBytesPerJob, 'per-job byte limit', target.maxPromptBytes),
    maxInitialInputTokens: positive(overrides.maxInitialInputTokens, defaults.maxInitialInputTokens,
      'initial input token limit', 1_000_000_000),
    maxContextExpansionInputTokens: positive(overrides.maxContextExpansionInputTokens,
      defaults.maxContextExpansionInputTokens, 'context expansion input token limit', 1_000_000_000),
    maxVerificationInputTokens: positive(overrides.maxVerificationInputTokens,
      defaults.maxVerificationInputTokens, 'verification input token limit', 1_000_000_000),
    maxTotalInputTokens: positive(totalInputOverride, defaults.maxTotalInputTokens, 'total input token limit', 1_000_000_000),
    maxOutputTokensPerJob: runtimeOutputTokens(overrides.maxOutputTokensPerJob, defaults.maxOutputTokensPerJob, target),
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
}, selected?: {readonly grades: unknown; readonly target: RepositoryRuntimeTarget; readonly promptTokenBoundaryReserve?: number | undefined}): ResolvedRepositoryReviewProfile {
  if (selected === undefined) return resolveLegacyProfile(values);
  if (Object.hasOwn(values,'overrides')) throw new Error('REPOSITORY_GRADE_COMPETING_AUTHOR');
  const grade = reviewGrade(values.grade), target = selected.target;
  if(!target || !['o200k_base','cl100k_base'].includes(target.tokenizerEncoding) || !['maxInputTokens','maxOutputTokens','maxContextTokens','maxPromptBytes'].every(k=>Number.isSafeInteger(target[k as keyof RepositoryRuntimeTarget]) && Number(target[k as keyof RepositoryRuntimeTarget])>0))throw new Error('REPOSITORY_RUNTIME_TARGET_INVALID');
  const grades = validateOwnedRepositoryGrades(selected.grades);
  const defaults = {...grades[grade],tokenizerEncoding:target.tokenizerEncoding,maxOutputTokensPerJob:target.maxOutputTokens} as GradeDefaults;
  const mode = reviewMode(values.mode), scope = reviewScope(values.scope), overrides = reviewOverrides(values.overrides);
  const componentBudget = budget(overrides.componentBudget, defaults.componentBudget);
  const baseBoundary = budget(overrides.boundaryBudget, defaults.boundaryBudget);
  const boundaryBudget = Object.freeze({ ...baseBoundary,
    maxRelations: positive(overrides.boundaryBudget?.maxRelations, defaults.boundaryBudget.maxRelations, 'boundary relation budget', 100_000),
    maxSlices: positive(overrides.boundaryBudget?.maxSlices, defaults.boundaryBudget.maxSlices, 'boundary slice budget', 10_000),
  });
  const enabledLenses = reviewLenses(overrides, defaults);
  const unsigned = {
    schemaVersion: selected.promptTokenBoundaryReserve === undefined ? 'repository-review-profile.v1' as const : 'repository-review-profile.v2' as const,
    ...(selected.promptTokenBoundaryReserve === undefined ? {} : {promptTokenBoundaryReserve: nonNegative(selected.promptTokenBoundaryReserve, 0, 'prompt token boundary reserve', 1_000_000)}), grade, mode, scope,
    allowedPrefixes: prefixes(scope), tokenizerEncoding: tokenizerEncoding(overrides.tokenizerEncoding, defaults.tokenizerEncoding, target),
    componentBudget, boundaryBudget, ...operationalLimits(overrides, defaults, target), enabledLenses,
  };
  return Object.freeze({ ...unsigned, digest: sha256Text(canonicalJson(unsigned)) });
}

export function parseRepositoryReviewInput(value: unknown, selected?: {readonly grades:unknown;readonly target:RepositoryRuntimeTarget;readonly promptTokenBoundaryReserve?:number|undefined}): ResolvedRepositoryReviewProfile {
  // Retained v1 input uses its original parser, not a current-policy projection.
  if (selected === undefined) return parseLegacyInput(value);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('repository audit input is invalid');
  const record = value as Readonly<Record<string, unknown>>;
  const allowed = new Set(['allowedPrefixes', 'grade', 'mode', 'scope', 'overrides']);
  if (Object.keys(record).some((key) => !allowed.has(key))) throw new Error('repository audit input has unknown fields');
  // Presence itself is a second author, including an explicit undefined.
  if (Object.hasOwn(record, 'overrides')) throw new Error('REPOSITORY_GRADE_COMPETING_AUTHOR');
  const legacy = record.allowedPrefixes;
  const scope = record.scope ?? (legacy === undefined ? { kind: 'repository' } : { kind: 'path', prefixes: legacy });
  const settings: { grade?: RepositoryReviewGrade; mode?: RepositoryReviewMode; scope: RepositoryReviewScope;
    overrides?: RepositoryReviewProfileOverrides } = { scope: scope as RepositoryReviewScope };
  if (record.grade !== undefined) settings.grade = record.grade as RepositoryReviewGrade;
  if (record.mode !== undefined) settings.mode = record.mode as RepositoryReviewMode;
  if (record.overrides !== undefined) settings.overrides = record.overrides as RepositoryReviewProfileOverrides;
  return resolveRepositoryReviewProfile(settings, selected);
}

export interface RepositoryRuntimeTarget {
 readonly tokenizerEncoding: ReviewTokenizerEncoding;
 readonly maxInputTokens:number;readonly maxOutputTokens:number;readonly maxContextTokens:number;readonly maxPromptBytes:number;
}
export function validateOwnedRepositoryGrades(value:unknown):Readonly<Record<RepositoryReviewGrade,Omit<GradeDefaults,'tokenizerEncoding'|'maxOutputTokensPerJob'>>> {
 if(!validateGrades(value))throw new Error('REPOSITORY_GRADES_INVALID');
 return value as ReturnType<typeof validateOwnedRepositoryGrades>;
}


export function selectedRepositoryGrades(config:Readonly<Record<string,unknown>>):{readonly grades:unknown;readonly target:RepositoryRuntimeTarget;readonly promptTokenBoundaryReserve?:number|undefined}|undefined {
 const owned=config.ownedPolicyProfiles as Record<string,unknown>|undefined;
 if(!['review-owned-decision-profiles.v2','review-owned-decision-profiles.v3','review-owned-decision-profiles.v4'].includes(String(owned?.schemaVersion))) {
  if(Object.hasOwn(config,'repositoryRuntimeTarget'))throw new Error('REPOSITORY_RUNTIME_TARGET_UNEXPECTED');
  return undefined;
 }
 const v3=['review-owned-decision-profiles.v3','review-owned-decision-profiles.v4'].includes(String(owned!.schemaVersion));
 if(owned!.schemaVersion==='review-owned-decision-profiles.v4' && (!Number.isSafeInteger(owned!.cacheReadConcurrency) || Number(owned!.cacheReadConcurrency)<1 || Number(owned!.cacheReadConcurrency)>1024))throw new Error('REVIEW_CACHE_CONCURRENCY_INVALID');
 if(v3 && (!Object.hasOwn(owned!,'promptTokenBoundaryReserve') || !Number.isSafeInteger(owned!.promptTokenBoundaryReserve) || Number(owned!.promptTokenBoundaryReserve)<0 || Number(owned!.promptTokenBoundaryReserve)>1_000_000))throw new Error('REVIEW_PROMPT_RESERVE_INVALID');
 const selected={grades:owned!.repositoryGrades,target:config.repositoryRuntimeTarget as RepositoryRuntimeTarget,
  ...(v3?{promptTokenBoundaryReserve:Number(owned!.promptTokenBoundaryReserve)}:{})};
 for(const grade of ['fast','standard','deep'] as const)resolveRepositoryReviewProfile({grade},selected);
 return selected;
}
