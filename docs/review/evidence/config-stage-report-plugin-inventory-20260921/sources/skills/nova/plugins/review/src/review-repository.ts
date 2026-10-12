import { canonicalJson, sha256Text, type PluginInvocationContext } from '@kubeclaw/plugin-sdk';

import type {
  ReviewBundleScope,
  ReviewChangedPath,
} from './review-bundle-contract.ts';
import { REVIEW_CHANGE_STATUSES } from './review-bundle-contract.ts';
import { REVIEW_HARD_LIMITS } from './review-hard-limits.ts';

export class ReviewRepositoryProofError extends Error {}

export interface FrozenReviewRevision {
  readonly head: string;
  readonly proof: string;
}

export interface ReviewChangedLineRange { readonly start: number; readonly end: number }

function record(value: unknown, label: string): Readonly<Record<string, unknown>> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value as Readonly<Record<string, unknown>>;
}

function exact(value: Readonly<Record<string, unknown>>, fields: readonly string[], label: string): void {
  const actual = Object.keys(value);
  if (actual.length !== fields.length || actual.some((field) => !fields.includes(field))) {
    throw new Error(`${label} fields are invalid`);
  }
}

function path(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value || value.startsWith('/') || value.includes(':')
    || value.includes('\\') || /[\u0000-\u001F\u007F]/u.test(value)
    || value.split('/').some((part) => !part || part === '.' || part === '..')) {
    throw new Error(`${label} is invalid`);
  }
  return value;
}

function fullObject(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u.test(value)) {
    throw new Error(`${label} is invalid`);
  }
  return value;
}

function proof(value: unknown): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{64}$/u.test(value)) {
    throw new Error('repository revision proof is invalid');
  }
  return value;
}

function changedPath(value: unknown, index: number): ReviewChangedPath {
  const item = record(value, `changedPaths[${index}]`);
  const status = item.status;
  const renamed = status === 'renamed' || status === 'copied';
  exact(item, renamed ? ['path', 'status', 'previousPath'] : ['path', 'status'], `changedPaths[${index}]`);
  if (typeof status !== 'string' || !REVIEW_CHANGE_STATUSES.includes(status as never)) {
    throw new Error(`changedPaths[${index}].status is invalid`);
  }
  return {
    path: path(item.path, `changedPaths[${index}].path`),
    status: status as ReviewChangedPath['status'],
    ...(renamed ? { previousPath: path(item.previousPath, `changedPaths[${index}].previousPath`) } : {}),
  };
}

function changedLineRange(value: unknown, path: string, index: number): ReviewChangedLineRange {
  const item = record(value, `changed line ranges for ${path}[${index}]`);
  exact(item, ['start', 'end'], `changed line ranges for ${path}[${index}]`);
  if (!Number.isSafeInteger(item.start) || Number(item.start) < 1
    || !Number.isSafeInteger(item.end) || Number(item.end) < Number(item.start)) {
    throw new Error(`changed line ranges for ${path}[${index}] are invalid`);
  }
  return { start: Number(item.start), end: Number(item.end) };
}

function assertCanonicalRanges(path: string, ranges: readonly ReviewChangedLineRange[]): void {
  for (let index = 1; index < ranges.length; index += 1) {
    const current = ranges[index] as ReviewChangedLineRange;
    const previous = ranges[index - 1] as ReviewChangedLineRange;
    if (current.start <= previous.end) {
      throw new Error(`changed line response for ${path} has noncanonical ranges`);
    }
  }
}

function parsedChangedLineRanges(
  rawResponse: unknown,
  base: string,
  revision: FrozenReviewRevision,
  path: string,
): readonly ReviewChangedLineRange[] {
  const label = `changed line response for ${path}`;
  try {
    const response = record(rawResponse, label);
    exact(response, ['base', 'head', 'path', 'ranges', 'rangesDigest'], label);
    if (response.base !== base || response.head !== revision.head || response.path !== path) {
      throw new Error(`${label} has invalid revision identity`);
    }
    if (!Array.isArray(response.ranges) || response.ranges.length > REVIEW_HARD_LIMITS.changedLineRangesPerFile) {
      throw new Error(`${label} has invalid ranges`);
    }
    const ranges = response.ranges.map((entry, index) => changedLineRange(entry, path, index));
    assertCanonicalRanges(path, ranges);
    if (response.rangesDigest !== sha256Text(canonicalJson(ranges))) {
      throw new Error(`${label} has invalid digest`);
    }
    return Object.freeze(ranges);
  } catch (error) {
    throw new ReviewRepositoryProofError(error instanceof Error ? error.message : String(error));
  }
}

export async function freezeReviewRevision(context: PluginInvocationContext): Promise<FrozenReviewRevision> {
  const rawResponse = await context.invoke('git.repository.read', {
    operation: 'freeze_head',
    resource: { type: 'git.repository.path', canonicalId: '.' },
    payload: {},
  });
  try {
    const response = record(rawResponse, 'freeze head response');
    exact(response, ['head', 'proof'], 'freeze head response');
    return { head: fullObject(response.head, 'freeze head response.head'), proof: proof(response.proof) };
  } catch (error) {
    throw new ReviewRepositoryProofError(error instanceof Error ? error.message : String(error));
  }
}

export async function readChangedScope(
  base: string,
  revision: FrozenReviewRevision,
  allowedPrefixes: readonly string[],
  context: PluginInvocationContext,
): Promise<{ readonly scope: ReviewBundleScope; readonly manifestDigest: `sha256:${string}` }> {
  const revisions = { base, head: revision.head };
  const rawResponse = await context.invoke('git.repository.read', {
    operation: 'changed_manifest',
    resource: { type: 'git.repository.path', canonicalId: '.' },
    payload: { ...revisions, proof: revision.proof, allowedPrefixes },
  });
  try {
    const response = record(rawResponse, 'changed manifest response');
    exact(response, ['base', 'head', 'changedPaths', 'manifestDigest'], 'changed manifest response');
    if (response.base !== revisions.base || response.head !== revisions.head) throw new Error('repository revision proof is invalid');
    if (!Array.isArray(response.changedPaths) || response.changedPaths.length < 1
      || response.changedPaths.length > REVIEW_HARD_LIMITS.changedPaths) throw new Error('changed path manifest is invalid');
    const changedPaths = response.changedPaths.map(changedPath);
    const expected = sha256Text(canonicalJson(changedPaths));
    if (response.manifestDigest !== expected) throw new Error('changed path manifest digest is invalid');
    return { scope: { changedPaths, allowedPrefixes }, manifestDigest: expected };
  } catch (error) {
    throw new ReviewRepositoryProofError(error instanceof Error ? error.message : String(error));
  }
}

export async function readChangedLineRanges(
  base: string,
  revision: FrozenReviewRevision,
  paths: readonly string[],
  context: PluginInvocationContext,
): Promise<ReadonlyMap<string, readonly ReviewChangedLineRange[]>> {
  const result = new Map<string, readonly ReviewChangedLineRange[]>();
  for (const path of [...new Set(paths)].sort()) {
    // Invocation failures belong to core retry policy. Only a completed but
    // malformed repository response is normalized as an immutable-proof error.
    const rawResponse = await context.invoke('git.repository.read', {
      operation: 'changed_line_ranges',
      resource: { type: 'git.repository.path', canonicalId: path },
      payload: { base, head: revision.head, proof: revision.proof },
    });
    result.set(path, parsedChangedLineRanges(rawResponse, base, revision, path));
  }
  return result;
}
