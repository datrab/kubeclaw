import { execFileSync, spawnSync } from 'node:child_process';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { canonicalJson, sha256Text } from '@kubeclaw/plugin-sdk';

import { compareCodeUnits, directlyReferences, fullObjectId, regularFileMode, parseRevisionInventory, referenceNeedle,
  type RevisionInventoryRecord } from './revision-parsers.ts';

export type { RevisionInventoryRecord } from './revision-parsers.ts';

export interface ChangedPathRecord {
  readonly path: string;
  readonly status: 'added' | 'modified' | 'deleted' | 'renamed' | 'copied' | 'type_changed';
  readonly previousPath?: string;
}

export interface ChangedLineRange { readonly start: number; readonly end: number }
export interface RevisionReferenceRecord { readonly path: string; readonly sourcePath: string }

function assertExpected(payload: Readonly<Record<string, unknown>>, key: string, actual: unknown, code: string): void {
  if (payload[key] !== undefined && payload[key] !== actual) throw new Error(code);
}

export function repositoryRelativePath(value: unknown): string {
  if (typeof value !== 'string' || !value || value.startsWith('/') || value.includes(':')
    || value.includes('\\') || /[\u0000-\u001F\u007F]/u.test(value)
    || value.split('/').some((part) => !part || part === '.' || part === '..')) {
    throw new Error('REPOSITORY_PATH_FORBIDDEN');
  }
  return value;
}

function git(root: string, args: readonly string[], maxBuffer = 1024 * 1024): Buffer {
  return execFileSync('git', ['-C', root, ...args], {
    encoding: 'buffer', maxBuffer, stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function resolveHead(root: string): string {
  return git(root, ['rev-parse', '--verify', 'HEAD^{commit}']).toString('utf8').trim();
}

function statusName(status: string): ChangedPathRecord['status'] {
  if (status === 'A') return 'added';
  if (status === 'M') return 'modified';
  if (status === 'D') return 'deleted';
  if (status === 'T') return 'type_changed';
  if (status.startsWith('R')) return 'renamed';
  if (status.startsWith('C')) return 'copied';
  throw new Error(`REPOSITORY_CHANGE_STATUS_UNSUPPORTED:${status}`);
}

function parseChangedManifest(output: Buffer): readonly ChangedPathRecord[] {
  const fields = new TextDecoder('utf-8', { fatal: true }).decode(output).split('\0');
  if (fields.at(-1) === '') fields.pop();
  const records: ChangedPathRecord[] = [];
  for (let index = 0; index < fields.length;) {
    const statusToken = fields[index++];
    if (!statusToken) throw new Error('REPOSITORY_CHANGE_MANIFEST_INVALID');
    const status = statusName(statusToken);
    const firstPath = repositoryRelativePath(fields[index++]);
    if (status === 'renamed' || status === 'copied') {
      const path = repositoryRelativePath(fields[index++]);
      records.push({ path, status, previousPath: firstPath });
    } else records.push({ path: firstPath, status });
  }
  return records.sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0);
}

function scopePrefix(value: unknown): string {
  if (value === '.') return '.';
  return repositoryRelativePath(value);
}

function inScope(path: string, prefixes: readonly string[]): boolean {
  return prefixes.some((prefix) => prefix === '.' || path === prefix || path.startsWith(`${prefix}/`));
}

function allowedScopePrefixes(value: unknown): readonly string[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 128) {
    throw new Error('REPOSITORY_SCOPE_INVALID');
  }
  const prefixes = value.map(scopePrefix);
  if (new Set(prefixes).size !== prefixes.length) throw new Error('REPOSITORY_SCOPE_INVALID');
  return prefixes;
}

function scopedChange(record: ChangedPathRecord, prefixes: readonly string[]): ChangedPathRecord | undefined {
  const current = inScope(record.path, prefixes);
  if (record.status !== 'renamed' && record.status !== 'copied') return current ? record : undefined;
  const previous = inScope(record.previousPath ?? '', prefixes);
  if (current && previous) return record;
  if (current) return { path: record.path, status: 'added' };
  if (previous && record.status === 'renamed') {
    return { path: record.previousPath as string, status: 'deleted' };
  }
  return undefined;
}

function verifiedAncestor(root: string, base: string, head: string): true {
  const result = spawnSync('git', ['-C', root, 'merge-base', '--is-ancestor', base, head], {
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.status === 1) throw new Error('REPOSITORY_BASE_NOT_ANCESTOR');
  if (result.status !== 0) throw new Error('REPOSITORY_REVISION_INVALID');
  return true;
}

function changedLineRanges(output: Buffer): readonly ChangedLineRange[] {
  const patch = output.toString('latin1');
  const ranges: ChangedLineRange[] = [];
  const header = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/gmu;
  for (const match of patch.matchAll(header)) {
    const start = Number(match[1]);
    const count = match[2] === undefined ? 1 : Number(match[2]);
    if (!Number.isSafeInteger(start) || start < 0 || !Number.isSafeInteger(count) || count < 0) {
      throw new Error('REPOSITORY_DIFF_INVALID');
    }
    if (count > 0) ranges.push({ start, end: start + count - 1 });
  }
  return ranges;
}

function sourcePaths(value: unknown): readonly string[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 256) {
    throw new Error('REPOSITORY_REFERENCE_SOURCE_INVALID');
  }
  const paths = value.map(repositoryRelativePath);
  if (new Set(paths).size !== paths.length) throw new Error('REPOSITORY_REFERENCE_SOURCE_INVALID');
  return paths.sort();
}

function referenceSearchCandidates(
  root: string, head: string, sources: readonly string[], allowedPrefixes: readonly string[], maximum: number,
): readonly RevisionReferenceRecord[] {
  const candidates = new Map<string, RevisionReferenceRecord>();
  for (const sourcePath of sources) {
    for (const candidate of grepReferencePaths(root, head, referenceNeedle(sourcePath))) {
      if (candidate === sourcePath || !inScope(candidate, allowedPrefixes)) continue;
      candidates.set(`${candidate}\0${sourcePath}`, { path: candidate, sourcePath });
      if (candidates.size > maximum) throw new Error(`REPOSITORY_REFERENCE_SEARCH_LIMIT_EXCEEDED:${maximum}`);
    }
  }
  return [...candidates.values()].sort((left, right) => compareCodeUnits(
    `${left.path}\0${left.sourcePath}`, `${right.path}\0${right.sourcePath}`,
  ));
}

const REFERENCE_SCAN_CEILING = 32_768;

function provenReferences(
  root: string, head: string, candidates: readonly RevisionReferenceRecord[],
): readonly RevisionReferenceRecord[] {
  return candidates.filter(({ path: candidate, sourcePath }) => {
    const content = git(root, ['show', `${head}:${candidate}`], 2 * 1024 * 1024).toString('utf8');
    return directlyReferences(candidate, sourcePath, content);
  });
}

function grepReferencePaths(root: string, head: string, needle: string): readonly string[] {
  const result = spawnSync('git', ['-C', root, 'grep', '-l', '-z', '-F', '-e', needle, head, '--'], {
    encoding: 'buffer', maxBuffer: 32 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.status === 1) return [];
  if (result.status !== 0 || !Buffer.isBuffer(result.stdout)) throw new Error('REPOSITORY_REFERENCE_SEARCH_FAILED');
  const prefix = `${head}:`;
  const fields = new TextDecoder('utf-8', { fatal: true }).decode(result.stdout).split('\0');
  if (fields.at(-1) === '') fields.pop();
  return fields.map((field) => repositoryRelativePath(field.startsWith(prefix) ? field.slice(prefix.length) : field));
}

export class RevisionReader {
  readonly #root: string;
  readonly #maxFileBytes: number;
  readonly #maxChangedPaths: number;
  readonly #expectedHead: string | undefined;
  readonly #proofKey = randomBytes(32);

  constructor(root: string, maxFileBytes: number, maxChangedPaths: number, expectedHead?: string) {
    this.#root = root;
    this.#maxFileBytes = maxFileBytes;
    this.#maxChangedPaths = maxChangedPaths;
    this.#expectedHead = expectedHead === undefined ? undefined : fullObjectId(expectedHead, 'expected_head');
  }

  #proof(head: string, attemptId: string): string {
    return createHmac('sha256', this.#proofKey).update(`${attemptId}\0${head}`).digest('hex');
  }

  #assertProof(payload: Readonly<Record<string, unknown>>, attemptId: string): string {
    const head = fullObjectId(payload.head, 'head');
    if (typeof payload.proof !== 'string' || !/^[0-9a-f]{64}$/u.test(payload.proof)) {
      throw new Error('REPOSITORY_REVISION_PROOF_INVALID');
    }
    const supplied = Buffer.from(payload.proof, 'hex');
    const expected = Buffer.from(this.#proof(head, attemptId), 'hex');
    if (!timingSafeEqual(supplied, expected)) throw new Error('REPOSITORY_REVISION_PROOF_INVALID');
    return head;
  }

  freezeHead(attemptId: string, payload: Readonly<Record<string, unknown>> = {}) {
    if (payload.repositoryRoot !== undefined && payload.repositoryRoot !== this.#root) throw new Error('REVIEW_REPOSITORY_IDENTITY_INVALID');
    const ref = payload.ref ?? 'HEAD';
    if (typeof ref !== 'string' || !ref || ref.startsWith('-') || /[\0\r\n]/u.test(ref)) throw new Error('REPOSITORY_REF_INVALID');
    const head = ref === 'HEAD' ? resolveHead(this.#root) : fullObjectId(git(this.#root, ['rev-parse', '--verify', `${ref}^{commit}`]).toString('utf8').trim(), 'ref');
    if (payload.requireClean === true && git(this.#root, ['status', '--porcelain=v1', '--untracked-files=all']).length) throw new Error('REVIEW_SOURCE_DIRTY');
    if (this.#expectedHead !== undefined && head !== this.#expectedHead) throw new Error('REPOSITORY_HEAD_MISMATCH');
    return { head, proof: this.#proof(head, attemptId), ...(payload.repositoryRoot === undefined ? {} : { repositoryRoot: this.#root }) };
  }

  verifyAncestry(payload: Readonly<Record<string, unknown>>, attemptId: string) {
    const base = fullObjectId(payload.base, 'base');
    const head = this.#assertProof(payload, attemptId);
    return { base, head, ancestryVerified: verifiedAncestor(this.#root, base, head) };
  }

  changedManifest(payload: Readonly<Record<string, unknown>>, attemptId: string) {
    const base = fullObjectId(payload.base, 'base');
    const head = this.#assertProof(payload, attemptId);
    verifiedAncestor(this.#root, base, head);
    const allowedPrefixes = allowedScopePrefixes(payload.allowedPrefixes);
    const changedPaths = parseChangedManifest(git(
      this.#root,
      ['diff', '--name-status', '-z', '--find-renames', '--find-copies', base, head, '--'],
      16 * 1024 * 1024,
    )).map((record) => scopedChange(record, allowedPrefixes)).filter(
      (record): record is ChangedPathRecord => record !== undefined,
    );
    if (changedPaths.length > this.#maxChangedPaths) {
      throw new Error(`REPOSITORY_CHANGE_LIMIT_EXCEEDED:${changedPaths.length}:${this.#maxChangedPaths}`);
    }
    return {
      base, head, changedPaths,
      manifestDigest: sha256Text(canonicalJson(changedPaths)),
    };
  }

  listRevisionPaths(payload: Readonly<Record<string, unknown>>, attemptId: string) {
    const head = this.#assertProof(payload, attemptId);
    const allowedPrefixes = allowedScopePrefixes(payload.allowedPrefixes);
    const requestedMaximum = payload.maxPaths ?? this.#maxChangedPaths * 8;
    if (!Number.isSafeInteger(requestedMaximum) || Number(requestedMaximum) < 1
      || Number(requestedMaximum) > 65_536) throw new Error('REPOSITORY_PATH_LIMIT_INVALID');
    const fields = new TextDecoder('utf-8', { fatal: true }).decode(git(
      this.#root, ['ls-tree', '-r', '--name-only', '-z', head], 64 * 1024 * 1024,
    )).split('\0');
    if (fields.at(-1) === '') fields.pop();
    const paths = fields.map(repositoryRelativePath).filter((path) => inScope(path, allowedPrefixes)).sort();
    if (paths.length > Number(requestedMaximum)) {
      throw new Error(`REPOSITORY_PATH_LIMIT_EXCEEDED:${paths.length}:${requestedMaximum}`);
    }
    return { head, paths, pathsDigest: sha256Text(canonicalJson(paths)) };
  }

  inventoryRevision(payload: Readonly<Record<string, unknown>>, attemptId: string) {
    const head = this.#assertProof(payload, attemptId);
    const allowedPrefixes = allowedScopePrefixes(payload.allowedPrefixes);
    const requestedMaximum = payload.maxPaths ?? this.#maxChangedPaths * 8;
    if (!Number.isSafeInteger(requestedMaximum) || Number(requestedMaximum) < 1
      || Number(requestedMaximum) > 1_000_000) throw new Error('REPOSITORY_PATH_LIMIT_INVALID');
    const files = parseRevisionInventory(git(
      this.#root, ['ls-tree', '-r', '-l', '-z', head], 256 * 1024 * 1024,
    ), repositoryRelativePath).filter(({ path }) => inScope(path, allowedPrefixes));
    if (files.length > Number(requestedMaximum)) {
      throw new Error(`REPOSITORY_PATH_LIMIT_EXCEEDED:${files.length}:${requestedMaximum}`);
    }
    return { head, files, inventoryDigest: sha256Text(canonicalJson(files)) };
  }

  findRevisionReferences(payload: Readonly<Record<string, unknown>>, attemptId: string) {
    const head = this.#assertProof(payload, attemptId);
    const allowedPrefixes = allowedScopePrefixes(payload.allowedPrefixes);
    const sources = sourcePaths(payload.sourcePaths);
    const requestedMaximum = payload.maxPaths ?? 256;
    if (!Number.isSafeInteger(requestedMaximum) || Number(requestedMaximum) < 1
      || Number(requestedMaximum) > 4096) throw new Error('REPOSITORY_REFERENCE_LIMIT_INVALID');
    const scanMaximum = REFERENCE_SCAN_CEILING;
    const candidates = referenceSearchCandidates(this.#root, head, sources, allowedPrefixes, scanMaximum);
    const records = provenReferences(this.#root, head, candidates);
    const unique = [...new Map(records.map((record) => [`${record.path}\0${record.sourcePath}`, record])).values()]
      .sort((left, right) => compareCodeUnits(
        `${left.path}\0${left.sourcePath}`, `${right.path}\0${right.sourcePath}`,
      ));
    if (unique.length > Number(requestedMaximum)) {
      throw new Error(`REPOSITORY_REFERENCE_LIMIT_EXCEEDED:${unique.length}:${requestedMaximum}`);
    }
    return { head, references: unique, referencesDigest: sha256Text(canonicalJson(unique)) };
  }

  readRevisionText(pathInput: unknown, payload: Readonly<Record<string, unknown>>, attemptId: string) {
    const path = repositoryRelativePath(pathInput);
    const head = this.#assertProof(payload, attemptId);
    // Core authorization has already constrained request.resource.canonicalId
    // against the capability grant. This payload check is defense-in-depth and
    // cannot expand the authority established by that grant.
    const allowedPrefixes = allowedScopePrefixes(payload.allowedPrefixes);
    if (!inScope(path, allowedPrefixes)) throw new Error(`REPOSITORY_PATH_OUT_OF_SCOPE:${path}`);
    const object = `${head}:${path}`;
    const mode = payload.requireRegularFile === true ? regularFileMode(git(this.#root, ['--literal-pathspecs', 'ls-tree', '-z', head, '--', path]).toString('utf8'), path) : undefined;
    const requestedMaximum = payload.maxBytes === undefined ? this.#maxFileBytes : payload.maxBytes;
    if (!Number.isSafeInteger(requestedMaximum) || Number(requestedMaximum) < 1
      || Number(requestedMaximum) > this.#maxFileBytes) throw new Error('REPOSITORY_FILE_LIMIT_INVALID');
    const maximum = Number(requestedMaximum);
    const type = git(this.#root, ['cat-file', '-t', object]).toString('utf8').trim();
    if (type !== 'blob') throw new Error('REPOSITORY_NOT_A_FILE');
    const objectId = fullObjectId(git(this.#root, ['rev-parse', '--verify', object]).toString('utf8').trim(), 'object');
    assertExpected(payload, 'expectedObjectId', objectId, 'REPOSITORY_OBJECT_ID_MISMATCH');
    const size = Number(git(this.#root, ['cat-file', '-s', object]).toString('utf8').trim());
    if (!Number.isSafeInteger(size) || size < 0) throw new Error('REPOSITORY_FILE_SIZE_INVALID');
    assertExpected(payload, 'expectedSizeBytes', size, 'REPOSITORY_FILE_SIZE_MISMATCH');
    if (size > maximum) throw new Error(`REPOSITORY_FILE_TOO_LARGE:${size}:${maximum}`);
    const bytes = git(this.#root, ['show', object], maximum + 1);
    const content = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return { path, head, objectId, content, sizeBytes: bytes.length, digest: sha256Text(content), ...(mode ? { mode } : {}) };
  }

  changedLineRanges(pathInput: unknown, payload: Readonly<Record<string, unknown>>, attemptId: string) {
    const path = repositoryRelativePath(pathInput);
    const base = fullObjectId(payload.base, 'base');
    const head = this.#assertProof(payload, attemptId);
    verifiedAncestor(this.#root, base, head);
    const ranges = changedLineRanges(git(
      this.#root,
      [
        'diff', '--unified=0', '--no-color', '--no-ext-diff', '--no-textconv', '--text',
        '--diff-algorithm=myers', '--find-renames', '--find-copies', base, head, '--', path,
      ],
      16 * 1024 * 1024,
    ));
    return { base, head, path, ranges, rangesDigest: sha256Text(canonicalJson(ranges)) };
  }
}
