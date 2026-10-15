import fs from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';

export interface CoreRuntimePolicy {
  readonly networkHttp: Readonly<{errorExcerptCharacters: number; maxRequestBytes: number; maxResponseBytes: number; timeoutMs: number}>;
  readonly operatorMessagingPayload: Readonly<{targetPayloadProfiles: Readonly<Record<string,Readonly<{maxPayloadBytes:number}>>>}>;
  readonly transportPublisherPayload: Readonly<{targetPayloadProfiles: Readonly<Record<string,Readonly<{maxPayloadBytes:number}>>>}>;
  readonly httpDispatch: Readonly<{targetByteProfiles: Readonly<Record<string,Readonly<{maxRequestBytes:number;maxResponseBytes:number}>>>}>;
  readonly openClawDispatch: Readonly<{ resultReadMaximumBytes: number; collectorWaitTimeoutSeconds: number; targetTimingProfiles: Readonly<Record<string, Readonly<{ spawnIntervalMs: number; pollMs: number; maxPollMs: number; maxPolls: number; sessionTimeoutMs: number }>>> }>;
  readonly operatorMessagingStore: Readonly<{ maximumDeliveryRecords: number; maximumDeliveryBytes: number }>;
  readonly transportPublisherStore: Readonly<{ maximumDeliveryRecords: number; maximumDeliveryBytes: number }>;
  readonly telemetryStore: Readonly<{ maxJsonDepth: number; maxJsonNodes: number; maxRecordBytes: number; maximumRecords: number; maximumStoreBytes: number }>;
  readonly stateStore: Readonly<{ maxEntryBytes: number; maximumRecords: number; maximumStoreBytes: number }>;
  readonly waitStore: Readonly<{ maxEntryBytes: number; maximumRecords: number; maximumStoreBytes: number }>;
  readonly artifactStore: Readonly<{ maxArtifactBytes: number; maximumRecords: number; maximumStoreBytes: number; maximumRecordBytes: number }>;
  readonly stageMemoryBytes: number;
  readonly observerMemoryBytes: number;
  readonly runMutationTtlMs: number;
  readonly runMutationRenewalMs: number;
  readonly journalAppendLockTimeoutMs: number;
  readonly maximumAuditResultBytes: number;
  readonly resourceLockMetadataTimeoutMs: number;
  readonly resourceLockProvisionalTtlMs: number;
  readonly effectJournalInlineResultBytes: number;
  readonly recovery: Readonly<{
    attempts: Readonly<{
      maximumEvidenceObjects: number; maximumEvidenceBytes: number; maximumEvidenceObjectBytes: number;
      maximumResults: number; maximumClosures: number; maximumMetadataBytes: number; maximumPendingEvidenceAgeMs: number;
    }>;
    admission: Readonly<{
      maximumIngressBytes: number; maximumRecords: number; maximumBytes: number;
      maximumQuarantineRecords: number; maximumQuarantineBytes: number;
    }>;
  }>;
}
const schema = JSON.parse(fs.readFileSync(new URL('./core-runtime-policy.schema.json', import.meta.url), 'utf8'));
const Constructor = Ajv2020 as unknown as new (options: object) => { compile(schema: object): ((value: unknown) => boolean) };
const validate = new Constructor({ strict: true, allErrors: true }).compile(schema);
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') { for (const item of Object.values(value)) freeze(item); Object.freeze(value); }
  return value;
}
/** Pure value validation/capture, including retained policies. No current-source I/O. */
export function captureCoreRuntimePolicy(value: unknown): CoreRuntimePolicy {
  if (!validate(value)) throw new Error('CORE_RUNTIME_POLICY_INVALID');
  const selected = structuredClone(value) as CoreRuntimePolicy;
  for (const timing of Object.values(selected.openClawDispatch.targetTimingProfiles)) {
    if (timing.maxPollMs < timing.pollMs || timing.sessionTimeoutMs < timing.pollMs) throw new Error('CORE_RUNTIME_POLICY_BUDGET_INVALID');
  }
  if (selected.artifactStore.maxArtifactBytes > selected.artifactStore.maximumStoreBytes
    || selected.artifactStore.maximumRecordBytes > selected.artifactStore.maximumStoreBytes
    || selected.runMutationRenewalMs >= selected.runMutationTtlMs
    || selected.recovery.attempts.maximumEvidenceObjectBytes > selected.recovery.attempts.maximumEvidenceBytes
    || selected.recovery.admission.maximumIngressBytes > selected.recovery.admission.maximumBytes) throw new Error('CORE_RUNTIME_POLICY_BUDGET_INVALID');
  return freeze(selected);
}
/** Explicit platform-selected source only; never CWD discovery/ENV/default selection. */
export function loadCoreRuntimePolicy(selection: Readonly<{file: string; profile: string}>): CoreRuntimePolicy {
  if (!selection || typeof selection.file !== 'string' || !selection.file.startsWith('/') || !selection.profile) throw new Error('CORE_RUNTIME_POLICY_SELECTION_REQUIRED');
  const document = JSON.parse(fs.readFileSync(fs.realpathSync(selection.file), 'utf8'));
  if (!document || Object.keys(document).sort().join(',') !== 'profiles,schemaVersion'
    || document.schemaVersion !== 'nova-core-runtime-policy.v1' || !document.profiles || typeof document.profiles !== 'object'
    || Array.isArray(document.profiles) || !Object.hasOwn(document.profiles,selection.profile)) throw new Error('CORE_RUNTIME_POLICY_DOCUMENT_INVALID');
  // All authored profiles remain complete; selecting one cannot hide a malformed sibling.
  const profiles = new Map<string, CoreRuntimePolicy>();
  for (const [name, profile] of Object.entries(document.profiles)) {
    if (!profile || typeof profile !== 'object' || Object.keys(profile).join(',') !== 'settings') throw new Error('CORE_RUNTIME_POLICY_PROFILE_INVALID');
    profiles.set(name, captureCoreRuntimePolicy((profile as {settings: unknown}).settings));
  }
  return profiles.get(selection.profile)!;
}
