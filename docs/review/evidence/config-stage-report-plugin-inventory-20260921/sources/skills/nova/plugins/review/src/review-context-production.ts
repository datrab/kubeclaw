import { canonicalJson, sha256Text, type PluginInvocationContext } from '@kubeclaw/plugin-sdk';
import path from 'node:path';
import type { ReviewBundleScope, ReviewContextReason } from './review-bundle-contract.ts';
import type { ReviewContextCandidate } from './review-context-selection.ts';
import { REVIEW_HARD_LIMITS } from './review-hard-limits.ts';
import { ReviewRepositoryProofError, type FrozenReviewRevision } from './review-repository.ts';
import { compareCodeUnits } from './review-ordering.ts';
import { importSpecifierRecordsFromScan } from './review-import-syntax.ts';
import { importScanSource } from './review-import-scanner.ts';

export interface ProductionContextDescriptor { readonly path: string; readonly reasons: readonly ReviewContextReason[]; readonly dependencyDepth: number }
export interface ReviewImportReference {
  readonly specifier: string; readonly unresolvedPath: string; readonly resolvedPath?: string; readonly line: number;
}
export interface ReviewImportSpecifier { readonly specifier: string; readonly line: number }
const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs', '.go'] as const;

function inScope(file: string, prefixes: readonly string[]): boolean {
  return prefixes.some((prefix) => prefix === '.' || file === prefix || file.startsWith(`${prefix}/`));
}
function canHaveSourceCallers(file: string): boolean {
  const lower = file.toLowerCase();
  return SOURCE_EXTENSIONS.some((extension) => lower.endsWith(extension))
    && !/(?:^|\/)(?:test|tests|__tests__)(?:\/|$)|\.(?:test|spec)\.[^.]+$/u.test(lower);
}

function relatedReason(candidate: string): ReviewContextReason['kind'] | undefined {
  const lower = candidate.toLowerCase();
  if (/(?:^|\/)(?:test|tests|__tests__)(?:\/|$)|\.(?:test|spec)\.[^.]+$/u.test(lower)) return 'test';
  if (/(?:^|\/)(?:contract|contracts)(?:\/|$)|\.contract\.[^.]+$/u.test(lower)) return 'contract';
  if (/(?:^|\/)(?:schema|schemas)(?:\/|$)|\.schema\.[^.]+$/u.test(lower)) return 'schema';
  if (/(?:^|\/)(?:config|configuration)(?:\/|$)|(?:^|\/)(?:package|plugin|tsconfig)\.json$/u.test(lower)) return 'configuration';
  if (/(?:^|\/)(?:owners?|ownership)(?:\/|$)|(?:^|\/)codeowners$/u.test(lower)) return 'ownership';
  if (/(?:^|\/)index\.(?:ts|tsx|mts|cts|js|jsx|mjs|cjs)$/u.test(lower)) return 'public_export';
  return undefined;
}

function ancestorDirectory(source: string, candidate: string): boolean {
  const directory = path.posix.dirname(candidate);
  return source.startsWith(`${directory}/`);
}

function componentRoot(file: string): string {
  const marker = file.match(/^(.*?)(?:\/(?:src|tests?|__tests__)\/)/u);
  return marker?.[1] ?? path.posix.dirname(file);
}

function structurallyRelated(
  source: string, candidate: string, kind: ReviewContextReason['kind'], sourceStem: string,
): boolean {
  const basename = path.posix.basename(candidate);
  if (kind === 'test') return componentRoot(source) === componentRoot(candidate) && basename.includes(sourceStem);
  if (kind === 'contract' || kind === 'schema') return basename.includes(sourceStem);
  if (kind === 'configuration' || kind === 'ownership' || kind === 'public_export') {
    return ancestorDirectory(source, candidate);
  }
  return false;
}

export function reviewImportReferences(
  sourcePath: string, content: string, tracked: ReadonlySet<string>,
): readonly ReviewImportReference[] {
  const found = new Map<string, ReviewImportReference>();
  for (const { specifier, line } of reviewImportSpecifiersWithLines(content)) {
    if (!specifier.startsWith('.')) continue;
    const base = path.posix.normalize(path.posix.join(path.posix.dirname(sourcePath), specifier));
    const suppliedExtension = path.posix.extname(base);
    const sourceStem = SOURCE_EXTENSIONS.includes(suppliedExtension as typeof SOURCE_EXTENSIONS[number])
      ? base.slice(0, -suppliedExtension.length) : base;
    const options = [base, ...SOURCE_EXTENSIONS.map((extension) => `${sourceStem}${extension}`),
      ...SOURCE_EXTENSIONS.map((extension) => `${base}/index${extension}`)];
    const resolved = options.find((candidate) => tracked.has(candidate));
    const value = { specifier, unresolvedPath: base, ...(resolved ? { resolvedPath: resolved } : {}), line };
    found.set(`${specifier}\0${resolved ?? base}`, value);
  }
  return [...found.values()].sort((left, right) => (
    compareCodeUnits(`${left.specifier}\0${left.resolvedPath ?? left.unresolvedPath}`,
      `${right.specifier}\0${right.resolvedPath ?? right.unresolvedPath}`)
  ));
}

export function reviewImportSpecifiersWithLines(content: string): readonly ReviewImportSpecifier[] {
  const scanned = importScanSource(content);
  const records = importSpecifierRecordsFromScan(scanned), lines = new Map<number, number>();
  let cursor = 0, line = 1;
  for (const { index } of [...records].sort((left, right) => left.index - right.index)) {
    for (let newline = scanned.indexOf('\n', cursor); newline >= 0 && newline < index;
      newline = scanned.indexOf('\n', cursor)) {
      line += 1; cursor = newline + 1;
    }
    lines.set(index, line);
  }
  return records.map(({ specifier, index }) => Object.freeze({ specifier, line: lines.get(index) as number }));
}

export function reviewImportCandidates(sourcePath: string, content: string, tracked: ReadonlySet<string>): readonly string[] {
  return reviewImportReferences(sourcePath, content, tracked)
    .flatMap(({ resolvedPath }) => resolvedPath ? [resolvedPath] : []);
}
function parsePaths(value: unknown, revision: FrozenReviewRevision): readonly string[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ReviewRepositoryProofError('revision path list is invalid');
  const record = value as Readonly<Record<string, unknown>>;
  if (record.head !== revision.head || !Array.isArray(record.paths)
    || !record.paths.every((entry) => typeof entry === 'string')
    || record.pathsDigest !== sha256Text(canonicalJson(record.paths))) {
    throw new ReviewRepositoryProofError('revision path list proof is invalid');
  }
  return record.paths as readonly string[];
}
function parseReferences(value: unknown, revision: FrozenReviewRevision): readonly { path: string; sourcePath: string }[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ReviewRepositoryProofError('revision references are invalid');
  const record = value as Readonly<Record<string, unknown>>;
  if (record.head !== revision.head || !Array.isArray(record.references)
    || record.referencesDigest !== sha256Text(canonicalJson(record.references))) {
    throw new ReviewRepositoryProofError('revision reference proof is invalid');
  }
  const references = record.references as readonly unknown[];
  if (!references.every((entry) => entry && typeof entry === 'object' && !Array.isArray(entry)
    && typeof (entry as Readonly<Record<string, unknown>>).path === 'string'
    && typeof (entry as Readonly<Record<string, unknown>>).sourcePath === 'string')) {
    throw new ReviewRepositoryProofError('revision reference records are invalid');
  }
  return references as readonly { path: string; sourcePath: string }[];
}

function add(
  output: Map<string, { reasons: ReviewContextReason[]; depth: number }>,
  path: string, reason: ReviewContextReason, depth: number,
): void {
  const current = output.get(path) ?? { reasons: [], depth };
  if (!current.reasons.some(({ kind, sourcePath }) => kind === reason.kind && sourcePath === reason.sourcePath)) {
    current.reasons.push(reason);
  }
  current.depth = Math.min(current.depth, depth);
  output.set(path, current);
}

const REASON_PRIORITY: Readonly<Partial<Record<ReviewContextReason['kind'], number>>> = {
  contract: 1, schema: 2, configuration: 3, ownership: 4, public_export: 5,
  direct_import: 6, direct_caller: 7, test: 8,
};

function compareReasons(left: ReviewContextReason, right: ReviewContextReason): number {
  const rank = (REASON_PRIORITY[left.kind] ?? 99) - (REASON_PRIORITY[right.kind] ?? 99);
  return rank || compareCodeUnits(`${left.kind}\0${left.sourcePath ?? ''}`, `${right.kind}\0${right.sourcePath ?? ''}`);
}

async function revisionPaths(
  scope: ReviewBundleScope, revision: FrozenReviewRevision, context: PluginInvocationContext,
): Promise<readonly string[]> {
  const response = await context.invoke('git.repository.read', {
    operation: 'list_revision_paths',
    resource: { type: 'git.repository.path', canonicalId: scope.allowedPrefixes[0] as string },
    payload: { head: revision.head, proof: revision.proof, allowedPrefixes: scope.allowedPrefixes,
      maxPaths: REVIEW_HARD_LIMITS.repositoryPaths },
  });
  return parsePaths(response, revision).filter((candidate) => inScope(candidate, scope.allowedPrefixes));
}

async function revisionReferences(
  seed: readonly ReviewContextCandidate[], scope: ReviewBundleScope, revision: FrozenReviewRevision,
  context: PluginInvocationContext,
): Promise<readonly { path: string; sourcePath: string }[]> {
  const sourcePaths = seed.filter(({ path: file, reasons }) => (
    canHaveSourceCallers(file) && reasons.some(({ kind }) => kind === 'changed')
  )).map(({ path: file }) => file);
  if (sourcePaths.length === 0) return [];
  const response = await context.invoke('git.repository.read', {
    operation: 'find_revision_references',
    resource: { type: 'git.repository.path', canonicalId: scope.allowedPrefixes[0] as string },
    payload: { head: revision.head, proof: revision.proof, allowedPrefixes: scope.allowedPrefixes,
      sourcePaths, maxPaths: REVIEW_HARD_LIMITS.contextCandidates },
  });
  return parseReferences(response, revision);
}

function addRelationalCandidates(
  output: Map<string, { reasons: ReviewContextReason[]; depth: number }>, source: ReviewContextCandidate,
  structural: readonly { path: string; kind: ReviewContextReason['kind'] }[], tracked: ReadonlySet<string>,
): void {
  const nextDepth = source.dependencyDepth + 1;
  for (const candidate of reviewImportCandidates(source.path, source.content, tracked)) {
    add(output, candidate, { kind: 'direct_import', sourcePath: source.path }, nextDepth);
  }
  const sourceStem = path.posix.basename(source.path).replace(/\.(?:test\.|spec\.)?[^.]+$/u, '');
  for (const { path: candidate, kind } of structural) {
    if (candidate === source.path) continue;
    if (structurallyRelated(source.path, candidate, kind, sourceStem)) {
      add(output, candidate, { kind, sourcePath: source.path }, nextDepth);
    }
  }
}

function productionDescriptors(
  output: ReadonlyMap<string, { reasons: ReviewContextReason[]; depth: number }>,
  seed: readonly ReviewContextCandidate[],
): readonly ProductionContextDescriptor[] {
  const depthByPath = new Map(seed.map(({ path: file, dependencyDepth }) => [file, dependencyDepth]));
  return [...output.entries()].sort(([left], [right]) => compareCodeUnits(left, right)).map(([file, value]) => ({
    path: file, dependencyDepth: value.depth,
    reasons: value.reasons.filter(({ sourcePath }) => sourcePath !== undefined
      && (depthByPath.get(sourcePath) ?? Number.POSITIVE_INFINITY) < value.depth)
      .sort(compareReasons).slice(0, REVIEW_HARD_LIMITS.contextCandidateReasonsPerFile),
  })).filter(({ reasons }) => reasons.length > 0);
}

export async function produceReviewContextCandidates(
  seed: readonly ReviewContextCandidate[], scope: ReviewBundleScope, revision: FrozenReviewRevision,
  context: PluginInvocationContext,
): Promise<readonly ProductionContextDescriptor[]> {
  const paths = await revisionPaths(scope, revision, context);
  const tracked = new Set(paths);
  const structural = paths.flatMap((file) => {
    const kind = relatedReason(file); return kind ? [{ path: file, kind }] : [];
  });
  const output = new Map<string, { reasons: ReviewContextReason[]; depth: number }>();
  const seedByPath = new Map(seed.map((item) => [item.path, item]));
  for (const reference of await revisionReferences(seed, scope, revision, context)) {
    const source = seedByPath.get(reference.sourcePath);
    if (source) add(output, reference.path, { kind: 'direct_caller', sourcePath: source.path }, source.dependencyDepth + 1);
  }
  for (const source of seed) addRelationalCandidates(output, source, structural, tracked);
  return productionDescriptors(output, seed);
}
