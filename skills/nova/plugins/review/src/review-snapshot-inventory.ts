import { canonicalJson, sha256Text } from '@kubeclaw/plugin-sdk';
import { compareCodeUnits } from './review-ordering.ts';

export type ReviewFileRole = 'source' | 'test' | 'contract' | 'configuration' | 'deployment'
  | 'documentation' | 'generated' | 'vendor' | 'binary' | 'symlink' | 'submodule';

export interface ReviewSnapshotFile {
  readonly path: string;
  readonly objectId: string;
  readonly mode: string;
  readonly sizeBytes: number;
  readonly role: ReviewFileRole;
  readonly included: boolean;
  readonly exclusionReason?: string;
}

export interface ReviewSnapshotInventory {
  readonly schemaVersion: 'review-source-snapshot.v1';
  readonly head: string;
  readonly files: readonly ReviewSnapshotFile[];
  readonly sourceInventoryDigest: string;
  readonly digest: string;
}

interface RepositoryInventoryProof {
  readonly head: unknown;
  readonly files: unknown;
  readonly inventoryDigest: unknown;
}

function specialRole(mode: string): { role: ReviewFileRole; exclusionReason: string } | undefined {
  if (mode === '120000') return { role: 'symlink', exclusionReason: 'symlink' };
  if (mode === '160000') return { role: 'submodule', exclusionReason: 'submodule' };
  return undefined;
}
function configurationFile(file: string): boolean {
  const basename = pathBasename(file);
  return basename === 'go.mod'
    || new Set(['.dockerignore', '.containerignore', '.gitignore', '.gitattributes', '.gitmodules',
      '.npmrc', '.editorconfig', '.prettierignore', '.eslintignore', '.helmignore', '.tool-versions']).has(basename)
    || /(?:^|\/)(?:package|plugin|tsconfig)\.json$|\.(?:ya?ml|toml)$/u.test(file);
}

function pathBasename(file: string): string { return file.slice(file.lastIndexOf('/') + 1); }

function knownBinaryFile(file: string): boolean {
  return /\.(?:7z|avi|avif|bmp|bz2|db|eot|gif|gz|ico|jpe?g|lockb|mov|mp3|mp4|ogg|otf|pdf|png|rar|sqlite3?|tar|tiff?|tgz|ttf|wasm|wav|webm|webp|woff2?|xz|zip)$/u.test(file);
}

function safePath(value: unknown): string {
  if (typeof value !== 'string' || !value || value.startsWith('/') || value.includes('\\')
    || value.includes(':') || value.split('/').some((part) => !part || part === '.' || part === '..')) {
    throw new Error('review snapshot path is invalid');
  }
  return value;
}

function roleFor(file: string, mode: string): { role: ReviewFileRole; exclusionReason?: string } {
  const lower = file.toLowerCase();
  const special = specialRole(mode); if (special) return special;
  if (/(?:^|\/)(?:vendor|third_party|node_modules)(?:\/|$)/u.test(lower)) {
    return { role: 'vendor', exclusionReason: 'vendored' };
  }
  if (/(?:^|\/)(?:dist|build|generated)(?:\/|$)|\.generated\.[^.]+$/u.test(lower)) return { role: 'generated' };
  if (knownBinaryFile(lower)) return { role: 'binary', exclusionReason: 'unsupported_or_binary' };
  if (/(?:^|\/)(?:test|tests|__tests__)(?:\/|$)|\.(?:test|spec)\.[^.]+$/u.test(lower)) return { role: 'test' };
  if (/(?:^|\/)(?:contract|contracts|schema|schemas)(?:\/|$)|\.schema\.json$/u.test(lower)) return { role: 'contract' };
  if (/(?:^|\/)(?:charts?|k8s|kubernetes|docker)(?:\/|$)|dockerfile/u.test(lower)) return { role: 'deployment' };
  if (/(?:^|\/)(?:docs?|examples)(?:\/|$)|\.(?:md|mdx|rst)$/u.test(lower)) return { role: 'documentation' };
  if (configurationFile(lower)) return { role: 'configuration' };
  if (!/\.(?:[cm]?[jt]sx?|go|rs|py|sh|bash|json|ya?ml|toml|sql|proto|html?|css|scss|sass|less|xml|svg|txt)$/u.test(lower)) {
    return { role: 'binary', exclusionReason: 'unsupported_or_binary' };
  }
  return { role: 'source' };
}

function validObjectId(value: unknown): value is string {
  return typeof value === 'string' && /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u.test(value);
}

function validMode(value: unknown): value is string {
  return typeof value === 'string' && /^\d{6}$/u.test(value);
}

function validSize(value: unknown): boolean {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

function parseFile(value: unknown): ReviewSnapshotFile {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('review snapshot file is invalid');
  const record = value as Readonly<Record<string, unknown>>;
  const path = safePath(record.path);
  if (![validObjectId(record.objectId), validMode(record.mode), validSize(record.sizeBytes)].every(Boolean)) {
    throw new Error(`review snapshot file proof is invalid: ${path}`);
  }
  const objectId = record.objectId as string, mode = record.mode as string;
  const classification = roleFor(path, mode);
  return Object.freeze({
    path, objectId, mode, sizeBytes: Number(record.sizeBytes),
    role: classification.role, included: classification.exclusionReason === undefined,
    ...(classification.exclusionReason === undefined ? {} : { exclusionReason: classification.exclusionReason }),
  });
}

export function parseReviewSnapshotInventory(value: RepositoryInventoryProof): ReviewSnapshotInventory {
  if (typeof value.head !== 'string' || !/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u.test(value.head)
    || !Array.isArray(value.files) || typeof value.inventoryDigest !== 'string') {
    throw new Error('review source snapshot proof is invalid');
  }
  if (value.inventoryDigest !== sha256Text(canonicalJson(value.files))) {
    throw new Error('review source snapshot inventory digest is invalid');
  }
  const files = value.files.map(parseFile).sort((left, right) => compareCodeUnits(left.path, right.path));
  if (new Set(files.map(({ path }) => path)).size !== files.length) throw new Error('review source snapshot paths are duplicated');
  const canonicalInventory = files.map(({ path, objectId, mode, sizeBytes }) => ({ path, objectId, mode, sizeBytes }));
  const unsigned = {
    schemaVersion: 'review-source-snapshot.v1' as const, head: value.head,
    files: Object.freeze(files), sourceInventoryDigest: sha256Text(canonicalJson(canonicalInventory)),
  };
  return Object.freeze({ ...unsigned, digest: sha256Text(canonicalJson(unsigned)) });
}
