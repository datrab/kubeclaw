import { captureBusterPreparationV10 } from '@kubeclaw/plugin-foundation/config/buster-preparation-v10';
import { validateBusterPreparationSettings } from '@kubeclaw/plugin-foundation/config/swarm';
import { assertPreparationSlot } from './preparation-slots.ts';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  remotePlanJobDigest, remotePlanJobId, repositoryArchiveBytes, resolvedTestPlanDigest,
  validatePipelineTestGateContract, verifySourceSnapshotAttestation, type RemotePlanJobV1,
} from '@kubeclaw/pipeline-test-gate-contract';
import type { BusterPreparationSettings } from '@kubeclaw/plugin-foundation/config/swarm';
import { ensureDirectoryDurable } from '@kubeclaw/plugin-foundation/observability/durable-delivery';
import {
  preparedPlanHeader, preparationDigest, assertPreparedSource,
  type PreparedPlanJob, type PreparedSourceReference,
} from './preparation-header.ts';
import { safeExtract } from './preparation-archive.ts';

export interface PreparationAuthority {
  readonly trustedSourceAuthority: string;
  readonly sourceAttestationPublicKey: string;
}
export interface PreparedSource {
  readonly job: PreparedPlanJob;
  readonly source: PreparedSourceReference;
}

/** Called inside the owned host. The caller streams chunks, never a decoded job. */
export async function readPreparationInput(input: AsyncIterable<Uint8Array>,
  settings: BusterPreparationSettings, authority: PreparationAuthority, signal: AbortSignal): Promise<{ readonly job: RemotePlanJobV1; readonly wire: Buffer }> {
  const chunks: Buffer[] = [];
  let count = 0;
  for await (const bytes of input) {
    signal.throwIfAborted();
    count += bytes.byteLength;
    if (count > settings.maximumRequestBytes) throw new Error('BUSTER_REMOTE_REQUEST_SIZE_EXCEEDED');
    chunks.push(Buffer.from(bytes));
  }
  signal.throwIfAborted();
  const wire = Buffer.concat(chunks, count);
  let value: unknown;
  try { value = JSON.parse(wire.toString('utf8')); }
  catch (error) { throw new Error('BUSTER_REMOTE_REQUEST_INVALID', { cause: error }); }
  // Contract validation performs the original canonical base64 and archive digest checks.
  validatePipelineTestGateContract('remotePlanJob', value);
  const job = value as RemotePlanJobV1;
  if (job.repositoryArchive.sizeBytes > settings.maximumArchiveBytes
    || job.repositoryArchive.data.length > Math.ceil(settings.maximumArchiveBytes / 3) * 4) {
    throw new Error('BUSTER_REMOTE_ARCHIVE_SIZE_EXCEEDED');
  }
  if (!verifySourceSnapshotAttestation(job.sourceSnapshot,
    authority.trustedSourceAuthority, authority.sourceAttestationPublicKey)) throw new Error('BUSTER_SOURCE_ATTESTATION_INVALID');
  if (remotePlanJobId(job.idempotencyKey) !== job.jobId) throw new Error('BUSTER_REMOTE_JOB_ID_INVALID');
  if (resolvedTestPlanDigest(job.plan) !== job.plan.planDigest) throw new Error('BUSTER_REMOTE_PLAN_DIGEST_MISMATCH');
  if (remotePlanJobDigest(job) !== job.requestDigest) throw new Error('BUSTER_REMOTE_REQUEST_DIGEST_MISMATCH');
  return { job, wire };
}

export function preparationSourceDirectory(root: string, admissionId: string): string {
  if (typeof admissionId !== 'string' || !/^[a-f0-9]{32}$/u.test(admissionId) || !path.isAbsolute(root) || path.resolve(root) !== root || root === '/') {
    throw new Error('BUSTER_PREPARATION_PATH_INVALID');
  }
  return path.join(root, admissionId, 'data');
}

async function writeExclusive(file: string, bytes: Uint8Array): Promise<void> {
  const handle = await fs.open(file, 'wx', 0o600);
  try { await handle.writeFile(bytes); await handle.chmod(0o640); await handle.sync(); }
  finally { await handle.close(); }
}

/** Bounded preview before any source directory allocation. */
export function preparedSourceMetadata(job: RemotePlanJobV1, admissionId: string,
  attemptSpecDigest: string, settings: BusterPreparationSettings, version: 'legacy' | 'v10' = 'legacy'): PreparedSource {
  if (!['legacy', 'v10'].includes(version)) throw new Error('BUSTER_PREPARATION_VERSION_INVALID');
  const v10 = version === 'v10' ? captureBusterPreparationV10(settings) : null;
  if (!v10) validateBusterPreparationSettings(settings);
  const reserveMultiplier = v10 ? v10.resultInputReserveMultiplier : 4;
  const header = preparedPlanHeader(job);
  if (Buffer.byteLength(JSON.stringify(header)) > settings.maximumHeaderBytes) throw new Error('BUSTER_PREPARATION_HEADER_LIMIT');
  const preparationUid = process.getuid?.();
  assertPreparationSlot(preparationUid);
  if (process.getgid?.() !== preparationUid) throw new Error('BUSTER_PREPARATION_SLOT_INVALID');
  const source: PreparedSourceReference = {
    schemaVersion: 'buster-prepared-source.v1', admissionId, preparationUid, jobId: header.jobId,
    requestDigest: header.requestDigest, headerDigest: preparationDigest(header),
    archiveDigest: header.repositoryArchive.contentDigest, archiveBytes: header.repositoryArchive.sizeBytes,
    attemptSpecDigest,
  };
  assertPreparedSource(source, header);
  const prepared = { job: header, source };
  if (Buffer.byteLength(JSON.stringify(prepared)) + reserveMultiplier * settings.maximumInputBytes > settings.maximumResultBytes) {
    throw new Error('BUSTER_PREPARATION_RESULT_CAPACITY');
  }
  return prepared;
}

/** Files remain unpublished until the parent records the authoritative native receipt. */
export async function materializePreparedSource(job: RemotePlanJobV1, assigned: {
  admissionId: string; attemptSpecDigest: string; root: string; tarExecutable: string;
  settings: BusterPreparationSettings; version?: 'legacy' | 'v10'; signal: AbortSignal; onAllocated: () => void;
}): Promise<PreparedSource> {
  const { admissionId, attemptSpecDigest, root, tarExecutable, settings, version = 'legacy', signal, onAllocated } = assigned;
  const prepared = preparedSourceMetadata(job, admissionId, attemptSpecDigest, settings, version);
  const metadata = Buffer.from(JSON.stringify(prepared));
  signal.throwIfAborted();
  const directory = preparationSourceDirectory(root, admissionId);
  await fs.mkdir(directory, { mode: 0o700 });
  onAllocated();
  await writeExclusive(path.join(directory, 'owner.json'), Buffer.from(JSON.stringify({
    schemaVersion: 'buster-preparation-owner.v1', admissionId, attemptSpecDigest,
    claimId: `claim-${admissionId}`, generation: 1,
  })));
  const repository = path.join(directory, 'repository');
  await ensureDirectoryDurable(repository);
  const archive = path.join(directory, 'repository.tar.gz');
  await writeExclusive(archive, repositoryArchiveBytes(job.repositoryArchive));
  await safeExtract(tarExecutable, archive, repository, settings, signal, version);
  await synchronizeRepository(repository, signal);
  await writeExclusive(path.join(directory, 'source.json'), metadata);
  await fs.chmod(path.join(directory, 'source.json'), 0o444);
  await fs.chmod(directory, 0o755);
  for (const item of [directory, path.dirname(directory)]) {
    const handle = await fs.open(item, 'r');
    try { await handle.sync(); } finally { await handle.close(); }
  }
  return prepared;
}

async function synchronizeRepository(directory: string, signal: AbortSignal): Promise<void> {
  const entries = await fs.opendir(directory);
  for await (const entry of entries) {
    signal.throwIfAborted();
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) await synchronizeRepository(file, signal);
    else if (entry.isFile()) {
      const handle = await fs.open(file, 'r');
      try {
        const stat = await handle.stat();
        await handle.chmod(0o644 | (stat.mode & 0o111 ? 0o111 : 0));
        await handle.sync();
      } finally { await handle.close(); }
    } else throw new Error('BUSTER_REMOTE_ARCHIVE_TYPE_DENIED');
  }
  const handle = await fs.open(directory, 'r');
  try { await handle.chmod(0o755); await handle.sync(); } finally { await handle.close(); }
}
