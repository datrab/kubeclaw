import fs from 'node:fs/promises';
import path from 'node:path';
import { withDurableStoreLock, writeDurableState, readDurableState, ensureDirectoryDurable } from '@kubeclaw/plugin-foundation/observability/durable-delivery';
import { canonicalJson, sha256Digest } from './digest.ts';
import type { WorkerOwnershipRecord } from './ownership-store.ts';

export interface NativeJournalSupervisor { readonly kind: 'native-journal-supervisor' }
const authorities = new WeakMap<NativeJournalSupervisor, {root: string; records: () => Promise<readonly WorkerOwnershipRecord[]>}>();
/** The capability exists only while the SAME real supervisor flock is held. */
export async function withNativeJournalSupervisor<T>(root: string, records: () => Promise<readonly WorkerOwnershipRecord[]>, operation: (authority: NativeJournalSupervisor) => Promise<T>): Promise<T> {
  return withDurableStoreLock(path.join(root, 'supervisor', 'lifetime'), async () => {
    const authority = Object.freeze({kind: 'native-journal-supervisor' as const});
    authorities.set(authority, {root: path.resolve(root), records});
    try { return await operation(authority); } finally { authorities.delete(authority); }
  });
}
export interface NativeJournalRouting {
  readonly schemaVersion: 'native-journal-routing.v1';
  readonly root: Readonly<{path: string; device: string; inode: string}>;
  readonly epoch: number;
  readonly configGenerationDigest: string;
  readonly journalLockHexDigits: 1 | 2;
  readonly algorithm: 'sha256';
  readonly keyGrammar: 'json-array-workerId-attemptId-generation.v1';
  readonly routingDigest: string;
}
const conflict = (): never => {throw new Error('WORKER_NATIVE_JOURNAL_ROUTING_CONFLICT');};
const pointer = (root: string) => path.join(root, 'routing', 'current.json');
async function identity(root: string) {
  const stat = await fs.lstat(root, {bigint:true});
  if (!stat.isDirectory() || await fs.realpath(root) !== root) return conflict();
  return {path:root, device:String(stat.dev), inode:String(stat.ino)};
}
function validate(value: unknown): asserts value is NativeJournalRouting {
  const row = value as NativeJournalRouting;
  if (!row || typeof row !== 'object' || Object.keys(row).sort().join(',') !== 'algorithm,configGenerationDigest,epoch,journalLockHexDigits,keyGrammar,root,routingDigest,schemaVersion'
    || row.schemaVersion !== 'native-journal-routing.v1' || !Number.isSafeInteger(row.epoch) || row.epoch < 1
    || ![1,2].includes(row.journalLockHexDigits) || row.algorithm !== 'sha256' || row.keyGrammar !== 'json-array-workerId-attemptId-generation.v1'
    || !/^sha256:[a-f0-9]{64}$/u.test(row.configGenerationDigest)) conflict();
  const {routingDigest,...unsigned}=row;
  if (routingDigest !== sha256Digest(unsigned)) conflict();
}
export async function readNativeJournalRouting(root: string): Promise<NativeJournalRouting | undefined> {
  const value = await readDurableState<NativeJournalRouting | null>(pointer(root), null, 4096);
  if (value === null) return undefined;
  validate(value);
  if (canonicalJson(value.root) !== canonicalJson(await identity(root))) conflict();
  const retained = await readDurableState<NativeJournalRouting | null>(path.join(root,'routing','epochs',`${value.routingDigest.slice(7)}.json`),null,4096);
  if (canonicalJson(retained) !== canonicalJson(value)) conflict();
  return value;
}
/** Caller also holds journal admission. Transition is startup-only, under the
 * real supervisor lock, after recovery; no request or module can change routing. */
export async function publishNativeJournalRouting(root: string, authority: NativeJournalSupervisor,
  generation: string, width: 1 | 2, journalTerminal: boolean, transition: boolean): Promise<NativeJournalRouting> {
  const grant = authorities.get(authority);
  if (!grant) return conflict();
  if (path.dirname(root) !== grant.root || !/^sha256:[a-f0-9]{64}$/u.test(generation) || ![1,2].includes(width)) conflict();
  const current = await readNativeJournalRouting(root);
  if (current && (current.journalLockHexDigits === width || !transition)) return current;
  // Before sealing legacy pending rows, retain the known legacy width2. A
  // requested width1 is published only after all old work is terminal.
  const actual = !current && !journalTerminal ? 2 : width;
  if (current || actual !== 2) {
    const records = await grant.records();
    if (!journalTerminal || records.some(record => !['disposed','abandoned'].includes(record.phase))) conflict();
  }
  const unsigned = {schemaVersion:'native-journal-routing.v1' as const, root:await identity(root),
    epoch:(current?.epoch ?? 0)+1, configGenerationDigest:generation, journalLockHexDigits:actual,
    algorithm:'sha256' as const, keyGrammar:'json-array-workerId-attemptId-generation.v1' as const};
  const result = Object.freeze({...unsigned, routingDigest:sha256Digest(unsigned)});
  await ensureDirectoryDurable(path.join(root,'routing','epochs'));
  const epochFile = path.join(root,'routing','epochs',`${result.routingDigest.slice(7)}.json`);
  const retained = await readDurableState<NativeJournalRouting | null>(epochFile,null,4096);
  if (retained && canonicalJson(retained) !== canonicalJson(result)) conflict();
  if (!retained) await writeDurableState(epochFile,result);
  await writeDurableState(pointer(root),result);
  return result;
}

export async function verifyNativeJournalRoutingEpoch(root: string, digest: string): Promise<void> {
  if (!/^sha256:[a-f0-9]{64}$/u.test(digest)) conflict();
  const retained = await readDurableState<NativeJournalRouting | null>(path.join(root,'routing','epochs',`${digest.slice(7)}.json`),null,4096);
  validate(retained);
  if (retained.routingDigest !== digest || canonicalJson(retained.root) !== canonicalJson(await identity(root))) conflict();
}
