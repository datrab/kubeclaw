import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { open, realpath } from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';

export interface TrivyDatabasePolicy {
  readonly maximumVulnerabilityAgeMs: number;
  readonly maximumJavaAgeMs: number;
  readonly maximumDatabaseBytes: number;
}
export const DEFAULT_TRIVY_DATABASE_POLICY: TrivyDatabasePolicy = Object.freeze({
  maximumVulnerabilityAgeMs: 48 * 60 * 60 * 1000,
  maximumJavaAgeMs: 7 * 24 * 60 * 60 * 1000,
  maximumDatabaseBytes: 8 * 1024 * 1024 * 1024,
});
const DATABASES = [
  { kind: 'vulnerability', directory: 'db', file: 'trivy.db', version: 2 },
  { kind: 'java', directory: 'java-db', file: 'trivy-java.db', version: 1 },
] as const;
interface DatabaseIdentity {
  readonly kind: 'vulnerability' | 'java';
  readonly schemaVersion: number;
  readonly updatedAt: string;
  readonly nextUpdate: string;
  readonly sourceAgeMs: number;
  readonly maximumAgeMs: number;
  readonly databaseDigest: string;
  readonly metadataDigest: string;
  readonly databaseBytes: number;
}
export interface TrivyDatabaseEvidence {
  readonly schemaVersion: 'trivy-database-evidence.v1';
  readonly evaluatedAt: string;
  readonly databases: readonly DatabaseIdentity[];
}

export function databasePolicy(value: TrivyDatabasePolicy = DEFAULT_TRIVY_DATABASE_POLICY): TrivyDatabasePolicy {
  for (const age of [value.maximumVulnerabilityAgeMs, value.maximumJavaAgeMs]) {
    if (!Number.isSafeInteger(age) || age < 1 || age > 30 * 24 * 60 * 60 * 1000) throw new Error('SECURITY_SCAN_DATABASE_POLICY_INVALID');
  }
  if (!Number.isSafeInteger(value.maximumDatabaseBytes) || value.maximumDatabaseBytes < 1
    || value.maximumDatabaseBytes > 32 * 1024 * 1024 * 1024) throw new Error('SECURITY_SCAN_DATABASE_POLICY_INVALID');
  return Object.freeze({ ...value });
}

function validCalendar(value: string): boolean {
  const year = Number(value.slice(0, 4)), month = Number(value.slice(5, 7)), day = Number(value.slice(8, 10));
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return month >= 1 && month <= 12 && day >= 1 && day <= days
    && Number(value.slice(11, 13)) < 24 && Number(value.slice(14, 16)) < 60 && Number(value.slice(17, 19)) < 60;
}
function timestamp(value: unknown): number {
  if (typeof value !== 'string' || value.length > 64
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/u.test(value)) {
    throw new Error('SECURITY_SCAN_DATABASE_METADATA_INVALID');
  }
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || parsed <= 0 || !validCalendar(value)) throw new Error('SECURITY_SCAN_DATABASE_METADATA_INVALID');
  return parsed;
}
function metadata(bytes: Buffer, expectedVersion: number) {
  const value: unknown = JSON.parse(bytes.toString('utf8'));
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || !('Version' in value) || value.Version !== expectedVersion || !('UpdatedAt' in value) || !('NextUpdate' in value)) {
    throw new Error('SECURITY_SCAN_DATABASE_METADATA_INVALID');
  }
  const updated = timestamp(value.UpdatedAt), next = timestamp(value.NextUpdate);
  if (next <= updated) throw new Error('SECURITY_SCAN_DATABASE_METADATA_INVALID');
  return { updatedAt: new Date(updated).toISOString(), nextUpdate: new Date(next).toISOString() };
}

async function fingerprint(file: string, maximum: number, signal: AbortSignal, retain = false) {
  signal.throwIfAborted();
  const handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const before = await handle.stat({ bigint: true });
    if (!before.isFile() || before.size <= 0n || before.size > BigInt(maximum)) throw new Error('SECURITY_SCAN_DATABASE_BYTES_INVALID');
    const hash = createHash('sha256'), chunks: Buffer[] = [];
    let bytes = 0;
    await pipeline(handle.createReadStream({ autoClose: false }), async source => {
      for await (const part of source) {
        const chunk = Buffer.from(part); bytes += chunk.byteLength;
        if (bytes > maximum) throw new Error('SECURITY_SCAN_DATABASE_BYTES_INVALID');
        hash.update(chunk); if (retain) chunks.push(chunk);
      }
    }, { signal });
    const after = await handle.stat({ bigint: true });
    if (before.size !== after.size || before.mtimeNs !== after.mtimeNs || before.ctimeNs !== after.ctimeNs
      || BigInt(bytes) !== before.size) throw new Error('SECURITY_SCAN_DATABASE_CHANGED');
    signal.throwIfAborted();
    return { digest: `sha256:${hash.digest('hex')}`, bytes, content: Buffer.concat(chunks) };
  } finally { await handle.close(); }
}

function sourceAge(kind: string, updatedAt: string, maximumAgeMs: number, evaluated: number): number {
  const age = evaluated - Date.parse(updatedAt);
  if (age < 0) throw new Error(`SECURITY_SCAN_DATABASE_FUTURE:${kind}:${updatedAt}`);
  if (age > maximumAgeMs) throw new Error(`SECURITY_SCAN_DATABASE_STALE:${kind}:updatedAt=${updatedAt}:maximumAgeMs=${maximumAgeMs}`);
  return age;
}

/** Actual cache bytes, not scan time, DownloadedAt, or filesystem mtime, define the source snapshot. */
export async function inspectTrivyDatabases(cache: string, policy: TrivyDatabasePolicy,
  signal: AbortSignal): Promise<TrivyDatabaseEvidence> {
  const items = [];
  for (const database of DATABASES) {
    try {
      const directory = path.join(cache, database.directory);
      if (await realpath(directory) !== directory) throw new Error('SECURITY_SCAN_DATABASE_PATH_DENIED');
      const meta = await fingerprint(path.join(directory, 'metadata.json'), 16 * 1024, signal, true);
      const parsed = metadata(meta.content, database.version);
      const maximumAgeMs = database.kind === 'vulnerability' ? policy.maximumVulnerabilityAgeMs : policy.maximumJavaAgeMs;
      sourceAge(database.kind, parsed.updatedAt, maximumAgeMs, Date.now());
      const data = await fingerprint(path.join(directory, database.file), policy.maximumDatabaseBytes, signal);
      items.push({ kind: database.kind, schemaVersion: database.version, ...parsed,
        databaseDigest: data.digest, metadataDigest: meta.digest, databaseBytes: data.bytes,
        maximumAgeMs });
    } catch (error) {
      signal.throwIfAborted();
      throw new Error(`SECURITY_SCAN_DATABASE_INVALID:${database.kind}:${error instanceof Error ? error.message : String(error)}`, { cause: error });
    }
  }
  const evaluated = Date.now();
  const databases = items.map(item => {
    const sourceAgeMs = sourceAge(item.kind, item.updatedAt, item.maximumAgeMs, evaluated);
    return Object.freeze({ ...item, sourceAgeMs });
  });
  signal.throwIfAborted();
  return Object.freeze({ schemaVersion: 'trivy-database-evidence.v1', evaluatedAt: new Date(evaluated).toISOString(), databases: Object.freeze(databases) });
}

export function assertStableDatabases(before: TrivyDatabaseEvidence, after: TrivyDatabaseEvidence): void {
  if (before.databases.length !== after.databases.length || before.databases.some((item, index) => {
    const current = after.databases[index];
    return current?.kind !== item.kind || current.databaseDigest !== item.databaseDigest || current.metadataDigest !== item.metadataDigest;
  })) throw new Error('SECURITY_SCAN_DATABASE_CHANGED');
}
