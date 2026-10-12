import { remotePlanDigest } from './digest.ts';
export { remotePlanDigest } from './digest.ts';
import crypto from 'node:crypto';
import { canonicalJson } from '@kubeclaw/pipeline-observability-contract/canonical-json';
import type {
  AttemptResultV1,
  NodeResultV1,
  RemotePlanJobV1,
  RemotePlanResultV1,
  RepositoryArchiveV1,
  ResolvedTestPlanV1,
  SourceSnapshotV1,
} from './types.ts';


export function remotePlanJobId(idempotencyKey: string): string {
  return `job:${crypto.createHash('sha256').update(idempotencyKey).digest('hex')}`;
}

export function resolvedTestPlanDigest(
  value: Omit<ResolvedTestPlanV1, 'planDigest'> | ResolvedTestPlanV1,
): string {
  const { planDigest: _ignored, ...unsigned } = value as ResolvedTestPlanV1;
  return remotePlanDigest(unsigned);
}

export function stableTestIdentity(value: {
  project: string;
  moduleId: string | null;
  gateId: string | null;
  suiteInstanceId: string | null;
  nodeId: string;
  variation: Readonly<Record<string, unknown>>;
}): string {
  return `test:${crypto.createHash('sha256').update(canonicalJson(value)).digest('hex')}`;
}

export function repositoryArchive(content: Uint8Array): RepositoryArchiveV1 {
  const bytes = Buffer.from(content);
  return Object.freeze({
    schemaVersion: 'repository-archive.v1',
    encoding: 'base64',
    contentDigest: `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`,
    sizeBytes: bytes.byteLength,
    data: bytes.toString('base64'),
  });
}

export function repositoryArchiveBytes(value: RepositoryArchiveV1): Buffer {
  const bytes = Buffer.from(value.data, 'base64');
  if (
    value.schemaVersion !== 'repository-archive.v1'
    || value.encoding !== 'base64'
    || bytes.toString('base64') !== value.data
    || bytes.byteLength !== value.sizeBytes
    || `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}` !== value.contentDigest
  ) throw new Error('REMOTE_PLAN_ARCHIVE_INVALID');
  return bytes;
}

function unsignedSourceSnapshot(value: Omit<SourceSnapshotV1, 'attestation'> | SourceSnapshotV1) {
  const { attestation: _ignored, ...unsigned } = value as SourceSnapshotV1;
  return unsigned;
}

function sourceSnapshotAttestationMessage(
  value: Omit<SourceSnapshotV1, 'attestation'> | SourceSnapshotV1,
): Buffer {
  return Buffer.from(`kubeclaw-source-snapshot-v1\0${canonicalJson(unsignedSourceSnapshot(value))}`, 'utf8');
}

export function attestSourceSnapshot(
  value: Omit<SourceSnapshotV1, 'attestation'>,
  privateKey: string | Buffer,
): SourceSnapshotV1 {
  let key: crypto.KeyObject;
  try { key = crypto.createPrivateKey(privateKey); }
  catch (error) { throw new Error('SOURCE_SNAPSHOT_PRIVATE_KEY_INVALID', { cause: error }); }
  if (key.asymmetricKeyType !== 'ed25519') throw new Error('SOURCE_SNAPSHOT_PRIVATE_KEY_INVALID');
  return Object.freeze({ ...value, attestation: Object.freeze({
    schemaVersion: 'source-snapshot-attestation.v1', algorithm: 'ed25519',
    authority: value.creatorAuthority,
    signature: crypto.sign(null, sourceSnapshotAttestationMessage(value), key).toString('base64'),
  }) });
}

export function verifySourceSnapshotAttestation(
  value: SourceSnapshotV1,
  expectedAuthority: string,
  publicKey: string | Buffer,
): boolean {
  if (
    value.creatorAuthority !== expectedAuthority
    || value.attestation.authority !== expectedAuthority
    || value.attestation.schemaVersion !== 'source-snapshot-attestation.v1'
    || value.attestation.algorithm !== 'ed25519'
  ) return false;
  try {
    const key = crypto.createPublicKey(publicKey);
    return key.asymmetricKeyType === 'ed25519'
      && crypto.verify(null, sourceSnapshotAttestationMessage(value), key,
        Buffer.from(value.attestation.signature, 'base64'));
  } catch { return false; }
}

export function remotePlanJobDigest(value: Omit<RemotePlanJobV1, 'requestDigest'> | RemotePlanJobV1): string {
  const { requestDigest: _ignored, ...unsigned } = value as RemotePlanJobV1;
  return remotePlanDigest(unsigned);
}

export function remotePlanResultDigest(
  value: Omit<RemotePlanResultV1, 'resultDigest' | 'receipt'> | RemotePlanResultV1,
): string {
  const { resultDigest: _digest, receipt: _receipt, ...unsigned } = value as RemotePlanResultV1;
  return remotePlanDigest(unsigned);
}

export function attemptResultDigest(
  value: Omit<AttemptResultV1, 'resultDigest' | 'receipt'> | AttemptResultV1,
): string {
  const { resultDigest: _digest, receipt: _receipt, ...unsigned } = value as AttemptResultV1;
  return remotePlanDigest(unsigned);
}

export function nodeResultDigest(
  value: Omit<NodeResultV1, 'resultDigest' | 'receipt'> | NodeResultV1,
): string {
  const { resultDigest: _digest, receipt: _receipt, ...unsigned } = value as NodeResultV1;
  return remotePlanDigest(unsigned);
}

export function remotePlanResultReceipt(jobId: string, resultDigest: string) {
  const receiptId = `receipt:${crypto.createHash('sha256').update(`${jobId}:${resultDigest}`).digest('hex')}`;
  return Object.freeze({
    receiptId,
    receiptDigest: remotePlanDigest({ authority: 'buster-plan-service.v1', receiptId, resultDigest }),
  });
}
