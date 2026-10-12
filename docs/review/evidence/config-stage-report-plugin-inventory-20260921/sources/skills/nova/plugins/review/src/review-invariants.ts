import type { ReviewCategory, ReviewPriority } from './echo-review-contract.ts';

export const REQUIRED_BLOCKING_PRIORITIES = [
  'P0',
] as const satisfies readonly ReviewPriority[];

export const REQUIRED_BLOCKING_CATEGORIES = [
  'correctness',
  'security',
  'contract',
] as const satisfies readonly ReviewCategory[];

/** Stable identifiers allow ClawDeck and evaluation data to track invariants. */
export const REVIEW_TRUST_INVARIANTS = Object.freeze({
  'RI-001': 'Echo output is a structured closed object, never raw control text.',
  'RI-002': 'Evidence identity is content addressed and undeclared evidence is rejected.',
  'RI-003': 'Every declared requirement receives exactly one assessment.',
  'RI-004': 'Only the review plugin creates the review StageResult.',
  'RI-005': 'Core alone owns retry, remediation, recovery, and lifecycle transition.',
  'RI-006': 'Required P0 correctness, security, and contract coverage cannot be disabled.',
  'RI-007': 'Invalid, incomplete, or insufficient review state cannot pass.',
  'RI-008': 'Review output is never silently truncated.',
  'RI-009': 'Repository locations are normalized and cannot escape the frozen scope.',
  'RI-010': 'One immutable resolved policy and digest govern one review attempt.',
} as const);
