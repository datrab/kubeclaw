import fs from 'node:fs';
import path from 'node:path';
import { gzipSync, gunzipSync } from 'node:zlib';
import { createHash, randomUUID } from 'node:crypto';
import { readNativeWorkerNodeIdentity, requireNativeWorkerRuntimeIdentity, NativeWorkerResourceScope, FileWorkerOwnershipStore,
  observeNativeWorkerResources, type WorkerOwnershipRecord, type WorkerOwnershipIdentity,
  type NativeAttemptBootAssociation } from '@kubeclaw/worker-core';
import { sha256Digest, validateWorkerResourceContractV3, type WorkerAttemptEnvelopeV3 } from '@kubeclaw/pipeline-worker-core-contract';
import { portableJson } from '@kubeclaw/plugin-sdk/values';
import { readWorkerCorePolicyCapture, captureWorkerCorePolicy, validateWorkerCoreV3Author } from '@kubeclaw/plugin-foundation/config/worker-core-policy';
import { readPipelineServiceSelection } from '@kubeclaw/plugin-foundation/config/pipeline-generation';
import { assertBusterLifetimeDescriptor, type BusterLifetimeDescriptor } from '@kubeclaw/plugin-foundation/config/buster-lifetime.mjs';
import { readBusterStartupHandoff, type BusterStartupHandoff } from '@kubeclaw/plugin-foundation/config/buster-startup';
import { readBusterBootSourceArchive, materializeBusterBootSourceArchive, prepareBusterBootSourceClosure,
  assertPipelineBootCapture, type PipelineBootCapture, type publishBusterBootSourceClosure } from '@kubeclaw/plugin-foundation/config/pipeline-boot.mjs';
import { assertOriginalBusterNativeBootFacts, type captureOriginalBusterNativeBootFacts } from './preparation-boot-closure.ts';
import { retainInitialPreparationStores, retainUninitializedOwnershipDirectory } from './preparation-empty-directory.ts';
import { preparationStateRoot } from './preparation-config.ts';
import { originalBootMetadataBytes } from './preparation-boot-metadata.ts';

type Facts = ReturnType<typeof captureOriginalBusterNativeBootFacts>;
type SourceArchive = ReturnType<typeof publishBusterBootSourceClosure>;
export interface PreparationOriginalBootArchive {
  readonly schemaVersion: 'buster-original-native-boot-archive-reference.v1';
  readonly parentBootId: string;
  readonly digest: string;
  readonly byteLength: number;
  readonly contentByteLength: number;
}
interface Capsule {
  readonly schemaVersion: 'buster-original-native-boot-capsule.v1' | 'buster-original-native-boot-capsule.v2';
  readonly handoff: BusterStartupHandoff;
  readonly sourceArchive: SourceArchive;
  readonly facts: Facts;
}
interface Association {
  readonly schemaVersion: 'buster-original-native-owner-boot.v1';
  readonly scopeName: string;
  readonly identity: WorkerOwnershipRecord['identity'];
  readonly originalBoot: PreparationOriginalBootArchive;
}
interface ActiveBoot {
  readonly schemaVersion: 'buster-original-native-active-boot.v1';
  readonly originalBoot: PreparationOriginalBootArchive;
}
// Closed v1 canonical wire maximum, derived from its actual codec fields. This
// is NOT an operational quota/default read from current B before original A.
export const originalActiveBootWireMaximumBytes = Buffer.byteLength(`${portableJson({
  schemaVersion: 'buster-original-native-active-boot.v1', originalBoot: {
    schemaVersion: 'buster-original-native-boot-archive-reference.v1',
    parentBootId: 'ffffffff-ffff-4fff-bfff-ffffffffffff', digest: `sha256:${'f'.repeat(64)}`,
    byteLength: Number.MAX_SAFE_INTEGER, contentByteLength: Number.MAX_SAFE_INTEGER,
  },
})}\n`);
const verifiedRecoveryContexts = new WeakSet<object>();
function freezeJson<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const member of Object.values(value)) freezeJson(member);
    Object.freeze(value);
  }
  return value;
}
export function assertOriginalBusterRecoveryContext(value: unknown): asserts value is ReturnType<PreparationOriginalBootStore['recoveryContext']> {
  if (!value || typeof value !== 'object' || !verifiedRecoveryContexts.has(value)) throw new Error('BUSTER_ORIGINAL_VERIFIED_RECOVERY_CONTEXT_REQUIRED');
  (value as ReturnType<PreparationOriginalBootStore['recoveryContext']>).assertCurrent();
}
interface AttemptAssociation {
  readonly schemaVersion: 'buster-original-native-attempt-boot.v1';
  readonly identity: WorkerOwnershipIdentity;
  readonly envelopeDigest: string;
  readonly originalBoot: PreparationOriginalBootArchive;
}
function attemptIdentity(envelope: WorkerAttemptEnvelopeV3): WorkerOwnershipIdentity {
  return { workerId: envelope.claim.workerId, attemptId: envelope.attemptId, claimId: envelope.claim.claimId,
    generation: envelope.claim.generation, profileDigest: envelope.profile.profileDigest, attemptSpecDigest: envelope.attemptSpecDigest };
}
const hash = (bytes: Uint8Array): string => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const bootPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u;
const digestPattern = /^sha256:[a-f0-9]{64}$/u;
function exact(value: unknown, keys: readonly string[]): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).sort().join(',') !== [...keys].sort().join(',')) throw new Error('BUSTER_ORIGINAL_BOOT_RECORD_INVALID');
}
function reference(value: unknown): asserts value is PreparationOriginalBootArchive {
  exact(value, ['schemaVersion', 'parentBootId', 'digest', 'byteLength', 'contentByteLength']);
  if (value.schemaVersion !== 'buster-original-native-boot-archive-reference.v1'
    || typeof value.parentBootId !== 'string' || !bootPattern.test(value.parentBootId)
    || typeof value.digest !== 'string' || !digestPattern.test(value.digest)
    || [value.byteLength, value.contentByteLength].some(size => !Number.isSafeInteger(size) || Number(size) < 1)) {
    throw new Error('BUSTER_ORIGINAL_BOOT_RECORD_INVALID');
  }
}

/** Root-only boot association storage under the existing ownership namespace.
 * It does not infer quiescence or retirement from an archive, a row or fd9.
 * The trusted coordinator holds its real native supervisor lock as well.
 */
export class PreparationOriginalBootStore {
  readonly #root: string;
  readonly #lifetime: BusterLifetimeDescriptor;
  readonly #maximumAssociationBytes: number;
  constructor(ownershipRoot: string, lifetime: BusterLifetimeDescriptor, maximumAssociationBytes: number) {
    assertBusterLifetimeDescriptor(lifetime);
    if (!path.isAbsolute(ownershipRoot) || path.resolve(ownershipRoot) !== ownershipRoot || ownershipRoot === '/'
      || !Number.isSafeInteger(maximumAssociationBytes) || maximumAssociationBytes < 1) throw new Error('BUSTER_ORIGINAL_BOOT_STORE_CONFIG_INVALID');
    this.#root = path.join(ownershipRoot, 'original-boots');
    this.#lifetime = lifetime;
    this.#maximumAssociationBytes = maximumAssociationBytes;
  }

  /** Current A must be genuine before its first admission; never call to fill a
   * missing association for a previous record. Existing capsules never change.
   */
  async publish(handoffValue: BusterStartupHandoff, sourceArchive: SourceArchive, facts: Facts): Promise<PreparationOriginalBootArchive> {
    const publication = this.#capsulePublication(handoffValue, sourceArchive, facts);
    const source = readBusterBootSourceArchive(sourceArchive);
    if (source.schemaVersion !== 'buster-boot-source-closure.v2'
      || source.expectedReceipt.generationDigest !== facts.generationDigest
      || source.expectedReceipt.selectionDigest !== facts.selectionDigest
      || source.expectedReceipt.imageReceiptDigest !== facts.imageReceiptDigest
      || source.expectedReceipt.packageReceiptDigest !== facts.packageReceiptDigest) throw new Error('BUSTER_ORIGINAL_BOOT_JOIN_MISMATCH');
    await this.#accountingStore(publication.capsule).withMetadataReservation(publication.bytes.byteLength, () => {
      this.#publicationSlots(facts.preparation.maximumRecords, false);
      readBusterBootSourceArchive(sourceArchive);
      this.#write(this.#archiveFile(publication.reference), publication.bytes);
    });
    return publication.reference;
  }

  /** Prepare authentic A in memory, then charge SOURCE+CAPSULE together before
   * the first filesystem write. A crash between writes leaves counted original
   * residue; it never authorizes a current-B repair or fresh activation.
   */
  async publishBootClosure(boot: PipelineBootCapture, handoff: BusterStartupHandoff, facts: Facts): Promise<PreparationOriginalBootArchive> {
    this.#lifetime.assertCurrent(); assertOriginalBusterNativeBootFacts(facts);
    assertPipelineBootCapture(boot, 'buster-preparation');
    if (boot.selectionReceipt.digest !== facts.selectionDigest || boot.selectionReceipt.generationDigest !== facts.generationDigest) {
      throw new Error('BUSTER_ORIGINAL_BOOT_JOIN_MISMATCH');
    }
    // INITIAL-only until genuine original retirement is implemented. Capture
    // BEFORE Core creates its fence; recheck INSIDE that same metadata fence
    // before either source/capsule write. Missing A with retained residue denies.
    const pristine = [retainUninitializedOwnershipDirectory(path.dirname(this.#root))];
    try {
      pristine.push(retainInitialPreparationStores(path.dirname(preparationStateRoot)));
      const prepared = prepareBusterBootSourceClosure(boot, path.join(this.#root, 'sources'));
      const publication = this.#capsulePublication(handoff, prepared.receipt, facts);
      const addition = prepared.receipt.byteLength + publication.bytes.byteLength;
      await this.#accountingStore(publication.capsule).withMetadataReservation(addition, () => {
        for (const directory of pristine) directory.assertCurrent();
        this.#assertInitialKernel(facts);
        this.#publicationSlots(facts.preparation.maximumRecords, true);
        // Neither missing half of a prior publication may be filled from current
        // capture. Refuse BOTH existing destinations before writing either one.
        for (const file of [prepared.receipt.file, this.#archiveFile(publication.reference)]) {
          try { fs.lstatSync(file); throw Object.assign(new Error('BUSTER_ORIGINAL_BOOT_ALREADY_EXISTS'), { code: 'EEXIST' }); }
          catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
        }
        this.#trusted(path.join(this.#root, 'sources'), true);
        prepared.publish();
        readBusterBootSourceArchive(prepared.receipt);
        this.#write(this.#archiveFile(publication.reference), publication.bytes);
      });
      this.#assertInitialKernel(facts);
      return publication.reference;
    } finally { for (const directory of pristine) directory.close(); }
  }

  #capsulePublication(handoffValue: BusterStartupHandoff, sourceArchive: SourceArchive, facts: Facts) {
    this.#lifetime.assertCurrent();
    assertOriginalBusterNativeBootFacts(facts);
    const handoff = readBusterStartupHandoff(handoffValue);
    if (facts.generationDigest !== handoff.generationDigest || sourceArchive.generationDigest !== handoff.generationDigest
      || facts.packageReceiptDigest !== handoff.parentSelection.packageReceiptDigest
      || facts.selectionDigest !== handoff.parentSelection.digest || facts.imageReceiptDigest !== handoff.imageReceiptDigest
      || sourceArchive.file !== path.join(this.#root, 'sources', `${facts.generationDigest.slice(7)}.json.gz`)
      || facts.ownershipStore.file !== path.dirname(this.#root)) throw new Error('BUSTER_ORIGINAL_BOOT_JOIN_MISMATCH');
    const stat = fs.statSync(facts.ownershipStore.file, { bigint: true });
    if (String(stat.dev) !== facts.ownershipStore.device || String(stat.ino) !== facts.ownershipStore.inode) throw new Error('BUSTER_ORIGINAL_BOOT_STORE_CHANGED');
    const capsule: Capsule = { schemaVersion: facts.schemaVersion === 'buster-native-boot-facts.v2'
      ? 'buster-original-native-boot-capsule.v2' : 'buster-original-native-boot-capsule.v1', handoff, sourceArchive, facts };
    const content = Buffer.from(`${portableJson(capsule)}\n`), bytes = gzipSync(content);
    const result: PreparationOriginalBootArchive = Object.freeze({ schemaVersion: 'buster-original-native-boot-archive-reference.v1',
      parentBootId: handoff.parentBootId, digest: hash(bytes), byteLength: bytes.byteLength, contentByteLength: content.byteLength });
    return { capsule, bytes, reference: result };
  }

  #publicationSlots(maximumRecords: number, source: boolean): void {
    let names: string[] = [];
    try { this.#trusted(this.#root, false); names = fs.readdirSync(this.#root); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    if (names.filter(name => name.endsWith('.json.gz')).length + 1 > maximumRecords) throw new Error('BUSTER_ORIGINAL_BOOT_ASSOCIATION_CAPACITY');
    if (source) {
      let sources: string[] = [];
      try { this.#trusted(path.join(this.#root, 'sources'), false); sources = fs.readdirSync(path.join(this.#root, 'sources')); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
      if (sources.length + 1 > maximumRecords) throw new Error('BUSTER_ORIGINAL_BOOT_ASSOCIATION_CAPACITY');
    }
  }

  read(original: PreparationOriginalBootArchive): Capsule {
    this.#lifetime.assertCurrent(); reference(original);
    const bytes = this.#read(this.#archiveFile(original), original.byteLength);
    if (hash(bytes) !== original.digest || bytes.byteLength !== original.byteLength) throw new Error('BUSTER_ORIGINAL_BOOT_ARCHIVE_DIGEST_MISMATCH');
    const content = gunzipSync(bytes, { maxOutputLength: original.contentByteLength });
    if (content.byteLength !== original.contentByteLength) throw new Error('BUSTER_ORIGINAL_BOOT_ARCHIVE_SIZE_MISMATCH');
    const value: unknown = JSON.parse(content.toString('utf8'));
    exact(value, ['schemaVersion', 'handoff', 'sourceArchive', 'facts']);
    if (value.schemaVersion !== 'buster-original-native-boot-capsule.v1'
      && value.schemaVersion !== 'buster-original-native-boot-capsule.v2') {
      throw new Error('BUSTER_ORIGINAL_BOOT_RECORD_INVALID');
    }
    // Decode only the capsule's original source bytes. The current image's
    // handoff/reader decoder must not invalidate or recapture historical A.
    const capsule = value as unknown as Capsule;
    const selected = capsule.schemaVersion === 'buster-original-native-boot-capsule.v2';
    if (capsule.handoff?.parentBootId !== original.parentBootId
      || capsule.facts?.schemaVersion !== (selected ? 'buster-native-boot-facts.v2' : 'buster-native-boot-facts.v1')
      || (selected ? capsule.facts.native?.workerCore === undefined : capsule.facts.native?.workerCore !== undefined)) {
      throw new Error('BUSTER_ORIGINAL_BOOT_RECORD_INVALID');
    }
    if (selected) readWorkerCorePolicyCapture(capsule.facts.native.workerCore);
    const source = readBusterBootSourceArchive(capsule.sourceArchive);
    if (source.schemaVersion !== 'buster-boot-source-closure.v2'
      || source.expectedReceipt.generationDigest !== capsule.facts.generationDigest
      || source.expectedReceipt.selectionDigest !== capsule.handoff.parentSelection.digest
      || source.expectedReceipt.selectionDigest !== capsule.facts.selectionDigest
      || source.expectedReceipt.imageReceiptDigest !== capsule.facts.imageReceiptDigest
      || source.expectedReceipt.imageReceiptDigest !== capsule.handoff.imageReceiptDigest
      || source.expectedReceipt.packageReceiptDigest !== capsule.facts.packageReceiptDigest) throw new Error('BUSTER_ORIGINAL_BOOT_JOIN_MISMATCH');
    if (selected) {
      // Resolve ONLY retained A. A structurally valid capture is not evidence
      // that this was the policy selected by the original authenticated source.
      const member = (name: string): unknown => {
        const file = source.files.find(file => file.name === `generation/${name}`);
        if (!file) throw new Error('BUSTER_ORIGINAL_BOOT_CORE_SOURCE_MISMATCH');
        return JSON.parse(Buffer.from(file.bytes, 'base64').toString('utf8'));
      };
      const selection = readPipelineServiceSelection(member('selections/buster-preparation.json'), 'buster-preparation');
      const bindings = selection.bindings.filter(binding => binding.owner === 'worker-core');
      const root = member('pipeline.config.json') as { components?: Record<string, string>; bindings?: unknown[] };
      const owner = member('components/worker-core.config.json') as {
        profiles: Record<string, { settings: Parameters<typeof captureWorkerCorePolicy>[0] }>;
      };
      if (selection.digest !== source.expectedReceipt.selectionDigest
        || selection.generationDigest !== source.expectedReceipt.generationDigest
        || selection.packageReceiptDigest !== source.expectedReceipt.packageReceiptDigest
        || selection.serviceInstanceId !== source.expectedReceipt.serviceInstanceId
        || bindings.length !== 1 || root?.components?.['worker-core'] !== 'components/worker-core.config.json'
        || !Array.isArray(root.bindings) || !root.bindings.some(binding => portableJson(binding) === portableJson({ role: selection.role, ...bindings[0] }))
        || !validateWorkerCoreV3Author(owner) || !Object.hasOwn(owner.profiles, bindings[0]!.profileId)
        || portableJson(captureWorkerCorePolicy(owner.profiles[bindings[0]!.profileId]!.settings)) !== portableJson(capsule.facts.native.workerCore)) {
        throw new Error('BUSTER_ORIGINAL_BOOT_CORE_SOURCE_MISMATCH');
      }
    }
    this.#lifetime.assertCurrent();
    return capsule;
  }

  /** Persist BEFORE the first ledger/journal mutation, including phases with no
   * owner yet. This INITIAL-only path requires physical absence of all prior
   * state plus the original live kernel/store identities. Retained state needs
   * original-code recovery/accounted retirement, not this bootstrap API.
   * No replacement, unlink or retirement is authorized by this API.
   */
  async activate(originalBoot: PreparationOriginalBootArchive): Promise<void> {
    originalBoot = Object.freeze(structuredClone(originalBoot));
    this.#lifetime.assertCurrent(); reference(originalBoot);
    const capsule = this.#readBoundCapsule(originalBoot);
    const active: ActiveBoot = { schemaVersion: 'buster-original-native-active-boot.v1', originalBoot };
    const bytes = Buffer.from(`${portableJson(active)}\n`);
    if (bytes.byteLength > this.#maximumAssociationBytes) throw new Error('BUSTER_ORIGINAL_BOOT_ASSOCIATION_CAPACITY');
    const empty = [retainInitialPreparationStores(path.dirname(preparationStateRoot))];
    try {

      await this.#accountingStore(capsule).withMetadataReservation(bytes.byteLength, () => {
        this.#assertInitialOwnershipNamespace(originalBoot, capsule);
        for (const directory of empty) directory.assertCurrent();
        this.#readBoundCapsule(originalBoot);
        this.#assertInitialKernel(capsule.facts);
        this.#write(path.join(this.#root, 'active.json'), bytes);
      });
      // Publication is not permission to serve. A failed post-check preserves
      // the pointer as unresolved original state; never unlink/recapture B.
      for (const directory of empty) directory.assertCurrent();
      this.#readBoundCapsule(originalBoot);
      this.#assertInitialKernel(capsule.facts);
    } finally { for (const directory of empty) directory.close(); }
  }

  #assertInitialKernel(facts: Facts): void {
    this.#lifetime.assertCurrent();
    const workerCore = facts.native.workerCore === undefined ? undefined : readWorkerCorePolicyCapture(facts.native.workerCore);
    const ownership = fs.lstatSync(path.dirname(this.#root), { bigint: true });
    if (facts.ownershipStore.file !== path.dirname(this.#root)
      || String(ownership.dev) !== facts.ownershipStore.device || String(ownership.ino) !== facts.ownershipStore.inode) {
      throw new Error('BUSTER_ORIGINAL_BOOT_STORE_CHANGED');
    }
    if (facts.native.pool.nodeIdentityFile !== '/etc/kubeclaw/native-node-id'
      || facts.native.pool.runtimeIdentityFile !== '/etc/kubeclaw/native-runtime-identity.json'
      || readNativeWorkerNodeIdentity('/etc/kubeclaw/native-node-id', workerCore) !== facts.native.nodeIdentity) {
      throw new Error('BUSTER_ORIGINAL_BOOT_HOST_UNRESOLVED');
    }
    requireNativeWorkerRuntimeIdentity('/etc/kubeclaw/native-runtime-identity.json', workerCore);
    const pool = facts.kernel.pool;
    this.#trusted(pool.file, false);
    const stat = fs.lstatSync(pool.file, { bigint: true });
    const namespace = fs.statSync('/proc/self/ns/cgroup', { bigint: true });
    if (pool.file !== facts.native.pool.cgroupRoot
      || String(stat.dev) !== pool.device || String(stat.ino) !== pool.inode
      || fs.readFileSync('/proc/sys/kernel/random/boot_id', 'utf8').trim() !== facts.kernel.bootId
      || String(namespace.dev) !== facts.kernel.namespace.device
      || String(namespace.ino) !== facts.kernel.namespace.inode
      || NativeWorkerResourceScope.inventory(pool.file).length !== 0
      || observeNativeWorkerResources(pool.file).populated) throw new Error('BUSTER_INITIAL_STATE_KERNEL_UNRESOLVED');
    this.#lifetime.assertCurrent();
  }

  #assertInitialOwnershipNamespace(original: PreparationOriginalBootArchive, capsule: Capsule): void {
    this.#trusted(path.dirname(this.#root), false);
    const lock = (file: string) => {
      const stat = fs.lstatSync(file);
      if (!stat.isFile() || stat.uid !== 0 || stat.nlink !== 1 || stat.size !== 0 || (stat.mode & 0o777) !== 0o600) {
        throw new Error('BUSTER_INITIAL_STATE_PRIOR_STATE_UNACCOUNTED');
      }
    };
    for (const entry of fs.readdirSync(path.dirname(this.#root))) {
      if (entry === 'original-boots') continue;
      if (entry === '.write-lock') { lock(path.join(path.dirname(this.#root), entry)); continue; }
      if (entry === 'supervisor') {
        const directory = path.join(path.dirname(this.#root), entry);
        this.#trusted(directory, false);
        if (fs.readdirSync(directory).join(',') !== '.write-lock') throw new Error('BUSTER_INITIAL_STATE_PRIOR_STATE_UNACCOUNTED');
        lock(path.join(directory, '.write-lock')); continue;
      }
      // Even an empty owners.json/journal or crash artifact requires recovery.
      throw new Error('BUSTER_INITIAL_STATE_PRIOR_STATE_UNACCOUNTED');
    }
    const sourceDirectory = path.join(this.#root, 'sources');
    const sourceFile = `${capsule.facts.generationDigest.slice(7)}.json.gz`;
    if (capsule.sourceArchive.file !== path.join(sourceDirectory, sourceFile)) throw new Error('BUSTER_INITIAL_STATE_ARCHIVE_NAMESPACE_INVALID');
    this.#trusted(sourceDirectory, false);
    if (fs.readdirSync(sourceDirectory).join(',') !== sourceFile
      || fs.readdirSync(this.#root).sort().join(',') !== [path.basename(this.#archiveFile(original)), 'sources'].sort().join(',')) {
      throw new Error('BUSTER_INITIAL_STATE_PRIOR_STATE_UNACCOUNTED');
    }
  }

  /** Resolve the prior boot even when no owner was reserved before the crash.
   * Absence, corruption or a missing capsule fails closed without current-B
   * recapture. The returned capsule is evidence, NOT a quiescence certificate.
   */
  readActive(): { readonly originalBoot: PreparationOriginalBootArchive; readonly capsule: Capsule } {
    this.#lifetime.assertCurrent();
    const value: unknown = JSON.parse(this.#read(path.join(this.#root, 'active.json'), originalActiveBootWireMaximumBytes).toString('utf8'));
    exact(value, ['schemaVersion', 'originalBoot']);
    if (value.schemaVersion !== 'buster-original-native-active-boot.v1') throw new Error('BUSTER_ORIGINAL_BOOT_RECORD_INVALID');
    reference(value.originalBoot);
    const capsule = this.#readBoundCapsule(value.originalBoot);
    this.#lifetime.assertCurrent();
    return { originalBoot: value.originalBoot, capsule };
  }

  /** Bootstrap evidence only. No business-store decoder, native cleanup,
   * service activation or permission to execute under the current image B.
   * The actual original program/reader/native ABI must still be replayed.
   */
  recoveryContext() {
    const captured = this.readActive();
    const originalBoot = freezeJson(structuredClone(captured.originalBoot));
    const capsule = freezeJson(structuredClone(captured.capsule));
    const assertCurrent = () => {
      this.#lifetime.assertCurrent();
      if (portableJson(this.readActive().originalBoot) !== portableJson(originalBoot)) throw new Error('BUSTER_ORIGINAL_BOOT_ACTIVE_MISMATCH');
    };
    const context = Object.freeze({ schemaVersion: 'buster-original-native-recovery-context.v1' as const,
      originalBoot, capsule, assertCurrent,
      materialize: (destination: string) => {
        assertCurrent();
        const restored = this.restoreActive(destination);
        assertCurrent();
        return restored.replay;
      },
    });
    verifiedRecoveryContexts.add(context);
    return context;
  }

  /** Original-first inert restoration; missing A is never repaired from B.
   * No current generation/runtime/env input, native execution or retirement.
   */
  restoreActive(destination: string) {
    this.#lifetime.assertCurrent();
    const active = this.readActive();
    const replay = materializeBusterBootSourceArchive(active.capsule.sourceArchive, destination);
    if (portableJson(this.readActive().originalBoot) !== portableJson(active.originalBoot)) {
      throw new Error('BUSTER_ORIGINAL_BOOT_ACTIVE_MISMATCH');
    }
    this.#lifetime.assertCurrent();
    return { ...active, replay };
  }

  /** The SAME immutable attempt association precedes ledger, cleanup ledger,
   * journal blob/admission and native ownership. It never rewrites their codecs.
   * Publication/accounting of original archives remains coordinator-owned.
   */
  admissionBinding(originalBoot: PreparationOriginalBootArchive): NativeAttemptBootAssociation {
    this.#lifetime.assertCurrent(); reference(originalBoot);
    const retained = Object.freeze(structuredClone(originalBoot));
    return Object.freeze({
      bind: (envelope: WorkerAttemptEnvelopeV3) => this.bindAttempt(envelope, retained),
      verify: async (envelope: WorkerAttemptEnvelopeV3) => { this.verifyAttempt(envelope); },
    });
  }

  async bindAttempt(input: WorkerAttemptEnvelopeV3, originalValue: PreparationOriginalBootArchive): Promise<void> {
    const originalBoot = Object.freeze(structuredClone(originalValue));
    this.#lifetime.assertCurrent(); reference(originalBoot);
    const envelope = structuredClone(input);
    validateWorkerResourceContractV3('workerAttemptEnvelope', envelope);
    const active = this.readActive();
    if (portableJson(active.originalBoot) !== portableJson(originalBoot)) throw new Error('BUSTER_ORIGINAL_BOOT_ACTIVE_MISMATCH');
    const identity = attemptIdentity(envelope);
    const association: AttemptAssociation = { schemaVersion: 'buster-original-native-attempt-boot.v1',
      identity, envelopeDigest: sha256Digest(envelope), originalBoot };
    const file = this.#attemptFile(identity);
    const bytes = Buffer.from(`${portableJson(association)}\n`);
    if (bytes.byteLength > this.#maximumAssociationBytes) throw new Error('BUSTER_ORIGINAL_BOOT_ASSOCIATION_CAPACITY');
    await this.#publishAssociation(originalBoot, active.capsule, file, bytes);
  }

  /** Original-policy Core store: both native reservation/lifecycle writes and
   * association additions use its existing owners.json lock and byte ceiling.
   */
  ownershipStore(): FileWorkerOwnershipStore {
    return this.#accountingStore(this.readActive().capsule);
  }

  /** Read-only exact original join; intentionally does NOT require current B
   * or the current active boot to equal this retained historical admission.
   */
  verifyAttempt(envelope: WorkerAttemptEnvelopeV3): Capsule {
    this.#lifetime.assertCurrent();
    const association = this.#readAttempt(attemptIdentity(envelope));
    if (association.envelopeDigest !== sha256Digest(envelope)) throw new Error('BUSTER_ORIGINAL_BOOT_ATTEMPT_MISMATCH');
    return this.#readBoundCapsule(association.originalBoot);
  }

  /** Supplied to Core after its original durable reservation and before scope
   * creation. Never replaces a prior association, even for a new current boot.
   */
  async bind(recordValue: WorkerOwnershipRecord, originalValue: PreparationOriginalBootArchive): Promise<void> {
    const record = structuredClone(recordValue), originalBoot = Object.freeze(structuredClone(originalValue));
    this.#lifetime.assertCurrent(); reference(originalBoot);
    const active = this.readActive();
    if (portableJson(active.originalBoot) !== portableJson(originalBoot)) throw new Error('BUSTER_ORIGINAL_BOOT_ACTIVE_MISMATCH');
    if (record.phase !== 'reserved' || record.binding !== null) throw new Error('BUSTER_ORIGINAL_BOOT_BIND_TOO_LATE');
    const attempt = this.#readAttempt(record.identity);
    if (portableJson(attempt.originalBoot) !== portableJson(originalBoot)) throw new Error('BUSTER_ORIGINAL_BOOT_ATTEMPT_MISMATCH');
    const association: Association = { schemaVersion: 'buster-original-native-owner-boot.v1',
      scopeName: record.scopeName, identity: record.identity, originalBoot };
    const bytes = Buffer.from(`${portableJson(association)}\n`);
    if (bytes.byteLength > this.#maximumAssociationBytes) throw new Error('BUSTER_ORIGINAL_BOOT_ASSOCIATION_CAPACITY');
    await this.#publishAssociation(originalBoot, active.capsule, this.#associationFile(record.scopeName), bytes);
  }

  /** Read-only, before Core host binding/drain. Missing A is a denial, not an
   * invitation to attach current B. All record phases retain their original row.
   */
  verify(records: readonly WorkerOwnershipRecord[]): readonly Capsule[] {
    this.#lifetime.assertCurrent();
    const capsules = new Map<string, Capsule>();
    return records.map(record => {
      const value: unknown = JSON.parse(this.#read(this.#associationFile(record.scopeName), this.#maximumAssociationBytes).toString('utf8'));
      exact(value, ['schemaVersion', 'scopeName', 'identity', 'originalBoot']);
      if (value.schemaVersion !== 'buster-original-native-owner-boot.v1' || value.scopeName !== record.scopeName
        || portableJson(value.identity) !== portableJson(record.identity)) throw new Error('BUSTER_ORIGINAL_BOOT_OWNER_MISMATCH');
      reference(value.originalBoot);
      if (portableJson(this.#readAttempt(record.identity).originalBoot) !== portableJson(value.originalBoot)) {
        throw new Error('BUSTER_ORIGINAL_BOOT_ATTEMPT_MISMATCH');
      }
      const key = portableJson(value.originalBoot);
      let capsule = capsules.get(key);
      if (!capsule) {
        capsule = this.#readBoundCapsule(value.originalBoot);
        capsules.set(key, capsule);
      }
      return capsule;
    });
  }

  #readBoundCapsule(originalBoot: PreparationOriginalBootArchive): Capsule {
    const capsule = this.read(originalBoot);
    const store = fs.lstatSync(path.dirname(this.#root), { bigint: true });
    if (capsule.facts.ownershipStore.file !== path.dirname(this.#root)
      || String(store.dev) !== capsule.facts.ownershipStore.device || String(store.ino) !== capsule.facts.ownershipStore.inode) {
      throw new Error('BUSTER_ORIGINAL_BOOT_STORE_CHANGED');
    }
    // Only the policy retained by authentic original capture is eligible here;
    // absent legacy captures stay legacy, never refill from current B.
    const workerCore = capsule.facts.native.workerCore === undefined ? undefined
      : readWorkerCorePolicyCapture(capsule.facts.native.workerCore);
    // Historical node bytes are evidence, never proof that this machine is
    // that node. Only the existing immutable host-preparation mounts join it.
    if (capsule.facts.native.pool.nodeIdentityFile !== '/etc/kubeclaw/native-node-id'
      || capsule.facts.native.pool.runtimeIdentityFile !== '/etc/kubeclaw/native-runtime-identity.json'
      || readNativeWorkerNodeIdentity('/etc/kubeclaw/native-node-id', workerCore) !== capsule.facts.native.nodeIdentity) {
      throw new Error('BUSTER_ORIGINAL_BOOT_HOST_UNRESOLVED');
    }
    requireNativeWorkerRuntimeIdentity('/etc/kubeclaw/native-runtime-identity.json', workerCore);
    this.#lifetime.assertCurrent();
    return capsule;
  }

  #archiveFile(original: PreparationOriginalBootArchive): string {
    reference(original); return path.join(this.#root, `${original.parentBootId}.json.gz`);
  }
  #attemptFile(identity: WorkerOwnershipIdentity): string {
    return path.join(this.#root, 'attempts', `${sha256Digest([identity.workerId, identity.attemptId, identity.generation]).slice(7)}.json`);
  }
  #readAttempt(identity: WorkerOwnershipIdentity): AttemptAssociation {
    const value: unknown = JSON.parse(this.#read(this.#attemptFile(identity), this.#maximumAssociationBytes).toString('utf8'));
    exact(value, ['schemaVersion', 'identity', 'envelopeDigest', 'originalBoot']);
    if (value.schemaVersion !== 'buster-original-native-attempt-boot.v1'
      || portableJson(value.identity) !== portableJson(identity)
      || typeof value.envelopeDigest !== 'string' || !digestPattern.test(value.envelopeDigest)) throw new Error('BUSTER_ORIGINAL_BOOT_ATTEMPT_MISMATCH');
    reference(value.originalBoot);
    return value as unknown as AttemptAssociation;
  }
  #accountingStore(capsule: Capsule): FileWorkerOwnershipStore {
    const originalStore = capsule.facts.ownershipStore;
    return new FileWorkerOwnershipStore(originalStore.file, {
      maximumRecords: capsule.facts.preparation.maximumRecords,
      maximumBytes: capsule.facts.preparation.maximumOwnershipBytes,
    }, () => {
      this.#lifetime.assertCurrent(); this.#trusted(originalStore.file, false);
      const stat = fs.lstatSync(originalStore.file, { bigint: true });
      if (String(stat.dev) !== originalStore.device || String(stat.ino) !== originalStore.inode) throw new Error('BUSTER_ORIGINAL_BOOT_STORE_CHANGED');
      return this.#associationMetadataBytes(capsule);
    }, capsule.facts.native.workerCore);
  }
  async #publishAssociation(original: PreparationOriginalBootArchive, capsule: Capsule, file: string, bytes: Buffer): Promise<void> {
    let exists = false;
    await this.#accountingStore(capsule).withMetadataReservation(() => {
      const active = this.readActive();
      if (portableJson(active.originalBoot) !== portableJson(original)) throw new Error('BUSTER_ORIGINAL_BOOT_ACTIVE_MISMATCH');
      try { fs.lstatSync(file); exists = true; }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
      if (exists) {
        // Semantic equality tolerates prior canonical serialization, never a
        // changed envelope/claim/boot. Exact orphan retry consumes no new quota.
        if (portableJson(JSON.parse(this.#read(file, this.#maximumAssociationBytes).toString('utf8')))
          !== portableJson(JSON.parse(bytes.toString('utf8')))) throw new Error('BUSTER_ORIGINAL_BOOT_ATTEMPT_MISMATCH');
        return 0;
      }
      let count = 0;
      try { this.#trusted(path.dirname(file), false); count = fs.readdirSync(path.dirname(file)).length; }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
      if (count + 1 > capsule.facts.preparation.maximumRecords) throw new Error('BUSTER_ORIGINAL_BOOT_ASSOCIATION_CAPACITY');
      return bytes.byteLength;
    }, () => { if (!exists) this.#write(file, bytes); });
  }
  #associationMetadataBytes(capsule: Capsule): number {
    return originalBootMetadataBytes(this.#root, capsule.facts.preparation.maximumRecords,
      capsule.facts.preparation.maximumOwnershipBytes, this.#maximumAssociationBytes);
  }
  #associationFile(scopeName: string): string {
    if (!/^worker-[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/u.test(scopeName)) throw new Error('BUSTER_ORIGINAL_BOOT_SCOPE_INVALID');
    return path.join(this.#root, 'owners', `${scopeName}.json`);
  }
  #trusted(directory: string, create: boolean): void {
    if (process.getuid?.() !== 0) throw new Error('BUSTER_ORIGINAL_BOOT_SUPERVISOR_REQUIRED');
    let current = '/';
    for (const part of ['', ...directory.split('/').filter(Boolean)]) {
      if (part) current = path.join(current, part);
      // Only the new closed archive/association namespace may be initialized.
      if (create && (current === this.#root || ['owners', 'attempts', 'sources'].some(member => current === path.join(this.#root, member)))) {
        let created = false;
        try { fs.mkdirSync(current, { mode: 0o700 }); created = true; } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
        if (created) {
          const parent = fs.openSync(path.dirname(current), fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW);
          try { fs.fsyncSync(parent); } finally { fs.closeSync(parent); }
        }
      }
      const stat = fs.lstatSync(current);
      if (!stat.isDirectory() || stat.uid !== 0 || (stat.mode & 0o022) !== 0) throw new Error('BUSTER_ORIGINAL_BOOT_ANCESTOR_NOT_TRUSTED');
    }
  }
  #read(file: string, maximumBytes: number): Buffer {
    this.#trusted(path.dirname(file), false);
    const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
    try {
      const before = fs.fstatSync(fd, { bigint: true });
      if (!before.isFile() || before.uid !== 0n || before.nlink !== 1n || (before.mode & 0o777n) !== 0o444n
        || before.size > BigInt(maximumBytes)) throw new Error('BUSTER_ORIGINAL_BOOT_FILE_NOT_TRUSTED');
      const bytes = fs.readFileSync(fd);
      for (const stat of [fs.fstatSync(fd, { bigint: true }), fs.lstatSync(file, { bigint: true })]) {
        if (['dev', 'ino', 'mode', 'uid', 'gid', 'nlink', 'size', 'mtimeNs', 'ctimeNs'].some(key =>
          before[key as keyof fs.BigIntStats] !== stat[key as keyof fs.BigIntStats])) throw new Error('BUSTER_ORIGINAL_BOOT_FILE_CHANGED');
      }
      return bytes;
    } finally { fs.closeSync(fd); }
  }
  #write(file: string, bytes: Buffer): void {
    this.#lifetime.assertCurrent(); this.#trusted(path.dirname(file), true);
    try { fs.lstatSync(file); throw Object.assign(new Error('BUSTER_ORIGINAL_BOOT_ALREADY_EXISTS'), { code: 'EEXIST' }); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    const temporary = path.join(path.dirname(file), `.original-boot-${randomUUID()}`);
    const fd = fs.openSync(temporary, fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY | fs.constants.O_NOFOLLOW, 0o600);
    try {
      fs.writeFileSync(fd, bytes); fs.fchmodSync(fd, 0o444); fs.fsyncSync(fd);
      this.#trusted(path.dirname(file), false); this.#lifetime.assertCurrent();
      fs.linkSync(temporary, file); fs.unlinkSync(temporary);
      const directory = fs.openSync(path.dirname(file), fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW);
      try { fs.fsyncSync(directory); } finally { fs.closeSync(directory); }
    } finally {
      fs.closeSync(fd);
      try { fs.unlinkSync(temporary); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    }
  }
}
