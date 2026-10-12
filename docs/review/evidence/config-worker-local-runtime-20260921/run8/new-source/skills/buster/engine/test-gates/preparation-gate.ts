import { assertPreparationSlot, type PreparationSlot } from './preparation-slots.ts';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { WorkerAttemptEnvelopeV3 } from '@kubeclaw/pipeline-worker-core-contract';
import { preparationSourceDirectory } from './preparation-source.ts';
import { preparationDigest } from './preparation-header.ts';

export interface PreparationGateBinding {
  readonly preparationUid: PreparationSlot;
  readonly device: number;
  readonly inode: number;
  readonly markerDigest: string;
}

async function syncDirectory(directory: string): Promise<void> {
  const handle = await fs.open(directory, 'r');
  try { await handle.sync(); } finally { await handle.close(); }
}

/** An existing directory is never adopted after an exclusive-create failure. */
export async function createPreparationGate(sourceRoot: string, admissionId: string,
  envelope: WorkerAttemptEnvelopeV3): Promise<PreparationGateBinding> {
  const preparationUid = envelope.operation.values.preparationUid;
  assertPreparationSlot(preparationUid);
  const gate = path.dirname(preparationSourceDirectory(sourceRoot, admissionId));
  await fs.mkdir(gate, { mode: 0o1770 });
  await fs.chown(gate, 0, preparationUid);
  await fs.chmod(gate, 0o1770);
  const marker = Buffer.from(JSON.stringify({ schemaVersion: 'buster-preparation-gate.v1',
    admissionId, envelopeDigest: preparationDigest(envelope) }));
  const handle = await fs.open(path.join(gate, 'gate.json'), 'wx', 0o400);
  try { await handle.writeFile(marker); await handle.sync(); } finally { await handle.close(); }
  await syncDirectory(gate);
  await syncDirectory(sourceRoot);
  const stat = await fs.lstat(gate);
  return { preparationUid, device: stat.dev, inode: stat.ino, markerDigest: preparationDigest(JSON.parse(marker.toString('utf8'))) };
}

export async function verifyPreparationGate(sourceRoot: string, admissionId: string,
  binding: PreparationGateBinding): Promise<string> {
  const gate = path.dirname(preparationSourceDirectory(sourceRoot, admissionId));
  const stat = await fs.lstat(gate);
  if (!stat.isDirectory() || stat.uid !== 0 || stat.dev !== binding.device || stat.ino !== binding.inode
    || !gatePermissions(stat.gid, stat.mode, binding.preparationUid)) throw new Error('BUSTER_PREPARATION_GATE_CHANGED');
  const file = path.join(gate, 'gate.json');
  const marker = await fs.lstat(file);
  if (!marker.isFile() || marker.uid !== 0 || marker.nlink !== 1 || marker.size > 1024
    || (marker.mode & 0o777) !== 0o400) throw new Error('BUSTER_PREPARATION_GATE_MARKER_CHANGED');
  const value: unknown = JSON.parse(await fs.readFile(file, 'utf8'));
  if (preparationDigest(value) !== binding.markerDigest) throw new Error('BUSTER_PREPARATION_GATE_MARKER_CHANGED');
  return gate;
}

/** Call only after durable root-ledger publication and actual native tree quiescence. */
export async function publishPreparationGate(sourceRoot: string, admissionId: string,
  binding: PreparationGateBinding): Promise<void> {
  const gate = await verifyPreparationGate(sourceRoot, admissionId, binding);
  // Revoke first: no intermediate group change ever gives the service write permission.
  await fs.chmod(gate, 0o700);
  await fs.chown(gate, 0, 1000);
  await fs.chmod(gate, 0o750);
  await syncDirectory(gate);
}

/** Original input is private to the parent after the staging owner's entire tree is quiescent. */
export async function retainPreparationGate(sourceRoot: string, admissionId: string,
  binding: PreparationGateBinding): Promise<void> {
  const gate = await verifyPreparationGate(sourceRoot, admissionId, binding);
  await fs.chmod(gate, 0o700);
  await fs.chown(gate, 0, 0);
  await syncDirectory(gate);
}

/** Metadata-only cleanup: never recurse and never remove a host-created data directory. */
export async function removeEmptyPreparationGate(sourceRoot: string, admissionId: string,
  binding: PreparationGateBinding): Promise<void> {
  const gate = path.dirname(preparationSourceDirectory(sourceRoot, admissionId));
  let stat;
  try { stat = await fs.lstat(gate); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw error;
  }
  if (!stat.isDirectory() || stat.uid !== 0 || stat.dev !== binding.device || stat.ino !== binding.inode) {
    throw new Error('BUSTER_PREPARATION_GATE_CHANGED');
  }
  const entries = await fs.readdir(gate);
  if (entries.length === 1 && entries[0] === 'gate.json') {
    await verifyPreparationGate(sourceRoot, admissionId, binding);
    await fs.unlink(path.join(gate, 'gate.json'));
    await syncDirectory(gate);
  } else if (entries.length !== 0) throw new Error('BUSTER_PREPARATION_GATE_NOT_EMPTY');
  await fs.rmdir(gate);
  await syncDirectory(sourceRoot);
}

function gatePermissions(gid: number, mode: number, preparationUid: PreparationSlot): boolean {
  const permissions = mode & 0o7777;
  if (permissions === 0o1770) return gid === preparationUid;
  if (permissions === 0o750) return gid === 1000;
  return permissions === 0o700 && [0, 1000, preparationUid].includes(gid);
}
