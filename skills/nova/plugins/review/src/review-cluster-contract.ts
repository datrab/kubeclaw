import type { ReviewCategory } from './echo-review-contract.ts';

export const REVIEW_CLUSTER_SCHEMA_VERSION = 'review-finding-cluster.v1' as const;
export const REVIEW_REPAIR_CLASSES = [
  'delete', 'replace', 'validate', 'guard', 'configure', 'synchronize', 'refactor', 'other',
] as const;

export type ReviewRepairClass = typeof REVIEW_REPAIR_CLASSES[number];

export interface VerifiedRootCause {
  readonly category: ReviewCategory;
  readonly sharedHint?: string;
  readonly primaryPath: string;
  readonly primarySymbol?: string;
  readonly repairClass: ReviewRepairClass;
}

const STABLE_HINT = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;

export function sharedRootCauseHint(value: string | undefined): string | undefined {
  return value && value.length <= 96 && STABLE_HINT.test(value) ? value : undefined;
}

export function classifyRepair(recommendation: string): ReviewRepairClass {
  const first = recommendation.trim().toLowerCase().split(/[^a-z]+/u)[0] ?? '';
  if (['delete', 'remove', 'drop'].includes(first)) return 'delete';
  if (['replace', 'use', 'adopt'].includes(first)) return 'replace';
  if (['validate', 'check', 'verify'].includes(first)) return 'validate';
  if (['guard', 'prevent', 'reject', 'block'].includes(first)) return 'guard';
  if (['configure', 'set', 'enable', 'disable'].includes(first)) return 'configure';
  if (['synchronize', 'lock', 'serialize'].includes(first)) return 'synchronize';
  if (['refactor', 'extract', 'move', 'split'].includes(first)) return 'refactor';
  return 'other';
}
