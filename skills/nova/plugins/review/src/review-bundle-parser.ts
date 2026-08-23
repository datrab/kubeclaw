import { canonicalJson, sha256Text } from '@kubeclaw/plugin-sdk';

import {
  assertReviewBundleInputResourceBounds,
  assertReviewBundleResourceBounds,
  assertReviewBundleSerializedBounds,
} from './review-bundle-bounds.ts';
import {
  REVIEW_BUNDLE_SCHEMA_VERSION,
  REVIEW_CHANGE_STATUSES,
  REVIEW_CONTEXT_REASON_KINDS,
  REVIEW_CONTEXT_SELECTION_VERSION,
  type ReviewBundle,
  type ReviewBundleContextItem,
  type ReviewBundleEvidence,
  type ReviewBundleRequirement,
  type ReviewBundleScope,
  type ReviewBundleSelection,
  type ReviewChangedPath,
  type ReviewContextReason,
} from './review-bundle-contract.ts';
import { REVIEW_HARD_LIMITS } from './review-hard-limits.ts';
import {
  bundleArray,
  bundleCompare,
  bundleDeepFreeze,
  bundleDigest,
  bundleExact,
  bundleGitObject,
  bundleIdentifier,
  bundlePath,
  bundleRecord,
  bundleScopePrefix,
  bundleSelection,
  bundleText,
  bundleUnique,
} from './review-bundle-values.ts';

export type ParsedReviewBundle =
  | { readonly ok: true; readonly value: ReviewBundle }
  | { readonly ok: false; readonly error: string };

function parseRequirement(value: unknown, index: number): ReviewBundleRequirement {
  const label = `requirements[${index}]`;
  const item = bundleRecord(value, label);
  bundleExact(item, ['id', 'statement'], [], label);
  return {
    id: bundleIdentifier(item.id, `${label}.id`),
    statement: bundleText(item.statement, `${label}.statement`, REVIEW_HARD_LIMITS.explanationCharacters),
  };
}

function parseEvidence(value: unknown, index: number): ReviewBundleEvidence {
  const label = `evidence[${index}]`;
  const item = bundleRecord(value, label);
  bundleExact(item, ['kind', 'digest', 'content'], [], label);
  if (typeof item.content !== 'string') throw new Error(`${label}.content must be a string`);
  const content = item.content;
  if (sha256Text(content) !== item.digest) throw new Error(`${label}.digest does not match content`);
  return {
    kind: bundleIdentifier(item.kind, `${label}.kind`),
    digest: bundleDigest(item.digest, `${label}.digest`),
    content,
  };
}

function parseChangedPath(value: unknown, index: number): ReviewChangedPath {
  const label = `scope.changedPaths[${index}]`;
  const item = bundleRecord(value, label);
  bundleExact(item, ['path', 'status'], ['previousPath'], label);
  const status = bundleSelection(item.status, REVIEW_CHANGE_STATUSES, `${label}.status`);
  const previousPath = item.previousPath === undefined
    ? undefined : bundlePath(item.previousPath, `${label}.previousPath`);
  if (['renamed', 'copied'].includes(status) !== Boolean(previousPath)) {
    throw new Error(`${label}.previousPath must exist only for renamed or copied paths`);
  }
  const path = bundlePath(item.path, `${label}.path`);
  if (previousPath === path) throw new Error(`${label}.previousPath must differ from path`);
  return {
    path, status,
    ...(previousPath === undefined ? {} : { previousPath }),
  };
}

function parseReason(value: unknown, label: string): ReviewContextReason {
  const item = bundleRecord(value, label);
  bundleExact(item, ['kind'], ['sourcePath'], label);
  const kind = bundleSelection(item.kind, REVIEW_CONTEXT_REASON_KINDS, `${label}.kind`);
  const sourcePath = item.sourcePath === undefined
    ? undefined : bundlePath(item.sourcePath, `${label}.sourcePath`);
  const relational = !['changed', 'context_expansion'].includes(kind);
  if (relational !== Boolean(sourcePath)) {
    throw new Error(`${label}.sourcePath must exist only for relational reasons`);
  }
  return { kind, ...(sourcePath === undefined ? {} : { sourcePath }) };
}

function parseContext(value: unknown, index: number): ReviewBundleContextItem {
  const label = `context[${index}]`;
  const item = bundleRecord(value, label);
  bundleExact(item, ['path', 'digest', 'content', 'reasons'], [], label);
  if (typeof item.content !== 'string') throw new Error(`${label}.content must be a string`);
  const content = item.content;
  if (sha256Text(content) !== item.digest) throw new Error(`${label}.digest does not match content`);
  const reasons = bundleArray(
    item.reasons, `${label}.reasons`, 1, REVIEW_HARD_LIMITS.contextReasonsPerFile,
  ).map((entry, reasonIndex) => parseReason(entry, `${label}.reasons[${reasonIndex}]`));
  bundleUnique(reasons.map((reason) => `${reason.kind}\0${reason.sourcePath ?? ''}`), `${label}.reasons`);
  return {
    path: bundlePath(item.path, `${label}.path`),
    digest: bundleDigest(item.digest, `${label}.digest`), content,
    reasons: [...reasons].sort((left, right) => (
      bundleCompare(`${left.kind}\0${left.sourcePath ?? ''}`, `${right.kind}\0${right.sourcePath ?? ''}`)
    )),
  };
}

function inScope(path: string, prefixes: readonly string[]): boolean {
  return prefixes.some((prefix) => prefix === '.' || path === prefix || path.startsWith(`${prefix}/`));
}

function parseScope(value: unknown): ReviewBundleScope {
  const scope = bundleRecord(value, 'scope');
  bundleExact(scope, ['changedPaths', 'allowedPrefixes'], [], 'scope');
  const changedPaths = bundleArray(scope.changedPaths, 'scope.changedPaths', 1, REVIEW_HARD_LIMITS.changedPaths)
    .map(parseChangedPath);
  const allowedPrefixes = bundleArray(scope.allowedPrefixes, 'scope.allowedPrefixes', 1, REVIEW_HARD_LIMITS.scopePrefixes)
    .map((entry, index) => bundleScopePrefix(entry, `scope.allowedPrefixes[${index}]`));
  bundleUnique(changedPaths.map(({ path }) => path), 'scope.changedPaths paths');
  bundleUnique(allowedPrefixes, 'scope.allowedPrefixes');
  const scopedPaths = changedPaths.flatMap(({ path, previousPath }) => [path, ...(previousPath ? [previousPath] : [])]);
  if (scopedPaths.some((path) => !inScope(path, allowedPrefixes))) {
    throw new Error('changed path is outside allowed scope');
  }
  return {
    changedPaths: [...changedPaths].sort((left, right) => bundleCompare(left.path, right.path)),
    allowedPrefixes: [...allowedPrefixes].sort(),
  };
}

function parseCollections(input: Readonly<Record<string, unknown>>, scope: ReviewBundleScope) {
  const requirements = bundleArray(input.requirements, 'requirements', 1, REVIEW_HARD_LIMITS.requirementAssessments)
    .map(parseRequirement);
  const evidence = bundleArray(input.evidence, 'evidence', 1, REVIEW_HARD_LIMITS.inspectedEvidence)
    .map(parseEvidence);
  const context = bundleArray(input.context, 'context', 0, REVIEW_HARD_LIMITS.contextFiles).map(parseContext);
  bundleUnique(requirements.map(({ id }) => id), 'requirements');
  bundleUnique(evidence.map(({ kind, digest }) => `${kind}\0${digest}`), 'evidence');
  bundleUnique(context.map(({ path }) => path), 'context paths');
  if (context.some(({ path }) => !inScope(path, scope.allowedPrefixes))) throw new Error('context path is outside allowed scope');
  if (context.flatMap(({ reasons }) => reasons).some(({ sourcePath }) => sourcePath && !inScope(sourcePath, scope.allowedPrefixes))) {
    throw new Error('context reason source path is outside allowed scope');
  }
  return {
    requirements: [...requirements].sort((left, right) => bundleCompare(left.id, right.id)),
    evidence: [...evidence].sort((left, right) => bundleCompare(`${left.kind}\0${left.digest}`, `${right.kind}\0${right.digest}`)),
    context: [...context].sort((left, right) => bundleCompare(left.path, right.path)),
  };
}

function parseSelection(value: unknown): ReviewBundleSelection {
  const selection = bundleRecord(value, 'selection');
  bundleExact(selection, ['version', 'candidateManifestDigest', 'expansionRound'], [], 'selection');
  if (selection.version !== REVIEW_CONTEXT_SELECTION_VERSION) throw new Error('selection version is invalid');
  if (selection.expansionRound !== 0 && selection.expansionRound !== 1) throw new Error('selection expansionRound is invalid');
  return {
    version: REVIEW_CONTEXT_SELECTION_VERSION,
    candidateManifestDigest: bundleDigest(selection.candidateManifestDigest, 'selection.candidateManifestDigest'),
    expansionRound: selection.expansionRound,
  };
}

function parseBundle(value: unknown): ReviewBundle {
  const input = bundleRecord(value, 'review bundle');
  bundleExact(input, [
    'schemaVersion', 'task', 'revisions', 'scope', 'requirements',
    'evidence', 'context', 'selection', 'policyDigest',
  ], [], 'review bundle');
  if (input.schemaVersion !== REVIEW_BUNDLE_SCHEMA_VERSION) throw new Error('review bundle schemaVersion is invalid');
  assertReviewBundleInputResourceBounds(input);
  const task = bundleRecord(input.task, 'task');
  bundleExact(task, ['id', 'statement'], [], 'task');
  const revisions = bundleRecord(input.revisions, 'revisions');
  bundleExact(revisions, ['base', 'head', 'changedManifestDigest'], [], 'revisions');
  const scope = parseScope(input.scope);
  const changedManifestDigest = bundleDigest(
    revisions.changedManifestDigest, 'revisions.changedManifestDigest',
  );
  if (changedManifestDigest !== sha256Text(canonicalJson(scope.changedPaths))) {
    throw new Error('revisions.changedManifestDigest does not match scope.changedPaths');
  }
  const collections = parseCollections(input, scope);
  const bundle = {
    schemaVersion: REVIEW_BUNDLE_SCHEMA_VERSION,
    task: {
      id: bundleIdentifier(task.id, 'task.id'),
      statement: bundleText(task.statement, 'task.statement', 16_384),
    },
    revisions: {
      base: bundleGitObject(revisions.base, 'revisions.base'),
      head: bundleGitObject(revisions.head, 'revisions.head'),
      changedManifestDigest,
    },
    scope,
    ...collections,
    selection: parseSelection(input.selection),
    policyDigest: bundleDigest(input.policyDigest, 'policyDigest'),
  } as const satisfies ReviewBundle;
  assertReviewBundleResourceBounds(bundle);
  assertReviewBundleSerializedBounds(bundle);
  return bundleDeepFreeze(bundle);
}

export function parseReviewBundle(value: unknown): ParsedReviewBundle {
  try { return { ok: true, value: parseBundle(value) }; } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
