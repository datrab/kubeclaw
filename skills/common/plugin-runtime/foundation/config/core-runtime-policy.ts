import path from 'node:path';
import {captureReviewPolicy,loadReviewPolicy,type ReviewPolicySelection,type ReviewPolicyCapture} from './review-owned-policy.ts';
import fs from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';

export interface ProjectCompilerRuntimePolicy {
  readonly schemaVersion: 'project-compiler-runtime.v1';
  readonly repairBudget: Readonly<{categories: Readonly<{lint: number; review: number; test: number}>; maximumOrchestratorOrders: number}>;
  readonly execution: Readonly<{maxTechnicalRetries: number; timeoutMs: number}>;
  readonly executionGroups: Readonly<{cumulative: Readonly<{timeoutMs: number}>; source: Readonly<{timeoutMs: number}>; demo: Readonly<{timeoutMs: number}>}>;
}
export interface CoreRuntimePolicy {
  readonly reviewPolicySelection?: ReviewPolicySelection;
  readonly reviewPolicyCapture?: ReviewPolicyCapture;
  readonly policyVersion?: 'nova-core-runtime-policy.v2' | 'nova-core-runtime-policy.v3';
  readonly projectCompiler?: ProjectCompilerRuntimePolicy;
  readonly repositoryRead: Readonly<{maxFileBytes:number; maxChangedPaths:number}>;
  readonly remoteTestGate: Readonly<{pollMilliseconds:number; maximumResponseBytes:number; maximumResultBytes:number; maximumArchiveBytes:number; maximumArchiveStoreBytes:number; maximumEvidenceBytes:number; maximumEvidenceStoreBytes:number; recordLimits:Readonly<{maximumRecords:number;maximumBytes:number;maximumRecordBytes:number}>}>;
  readonly demoHandoffStore: Readonly<{maximumRecords: number; maximumBytes: number; maximumRecordBytes: number}>;
  readonly isolationSession: Readonly<{maximumStderrBytes: number; stderrExcerptCharacters: number; terminationGraceMs: number; exitAcknowledgementMs: number}>;
  readonly commandCatalog: Readonly<{maximumEntries: number}>;
  readonly redisTransport: Readonly<{maximumPayloadBytes: number; maximumReplyBulkBytes: number; maximumReplyHeaderBytes: number}>;
  readonly commandProcessCleanup: Readonly<{cleanupPollIntervalMs: number; exitAcknowledgementMs: number; sandboxMinimumGraceMs: number}>;
  readonly remotePlanDispatch: Readonly<{cleanupMilliseconds: number}>;
  readonly sourceAcquisition: Readonly<{timeoutMs: number; maximumMetadataBytes: number; maximumStderrCharacters: number; cleanupTimeoutMs: number; forceKillAfterMs: number; pollIntervalMs: number}>;
  readonly prismDesignBudgets: Readonly<{maximumArchiveBytes: number; maximumArchiveFiles: number; maximumArchitectureBytes: number}>;
  readonly commandRunnerMonitoring: Readonly<{maximumOutputRecords: number; sampleIntervalMs: number}>;
  readonly notificationPresentation: Readonly<{maxMessageChars: number; maxLabelChars: number; maxTitleChars: number; maxReasonCodeChars: number; maxArtifactIdChars: number; maxArtifactDigestChars: number; maxArtifactMediaTypeChars: number; maxArtifactLogicalNameChars: number}>;
  readonly gitWorkspaceFailure: Readonly<{errorExcerptCharacters: number}>;
  readonly humanApproval: Readonly<{defaultTimeoutMinutes: number}>;
  readonly operatorMessagingFailure: Readonly<{failureExcerptCharacters: number}>;
  readonly resourceAcquisition: Readonly<{timeoutMs: number; pollIntervalMs: number}>;
  readonly transportPublisherStructure: Readonly<{maxJsonDepth: number}>;
  readonly transportPublisherFailure: Readonly<{failureExcerptCharacters: number}>;
  readonly agentEventSource: Readonly<{maxIdentityCharacters: number; maxObservedFields: number; maxObservedFieldCharacters: number; maxQueueEvents: number; maxQueueBytes: number; drainTimeoutMs: number}>;
  readonly networkHttp: Readonly<{errorExcerptCharacters: number; maxRequestBytes: number; maxResponseBytes: number; timeoutMs: number}>;
  readonly operatorMessagingPayload: Readonly<{payloadStructure?: Readonly<{maximumDepth:number;maximumArrayEntries:number;maximumObjectProperties:number}>; targetPayloadProfiles: Readonly<Record<string,Readonly<{maxPayloadBytes:number}>>>}>;
  readonly transportPublisherPayload: Readonly<{targetPayloadProfiles: Readonly<Record<string,Readonly<{maxPayloadBytes:number}>>>}>;
  readonly httpDispatch: Readonly<{payloadStructure: Readonly<{maximumDepth: number; maximumArrayEntries: number; maximumObjectProperties: number}>; targetByteProfiles: Readonly<Record<string,Readonly<{maxRequestBytes:number;maxResponseBytes:number}>>>}>;
  readonly openClawDispatch: Readonly<{ workspaceOwnerMaximumBytes: number; cleanupPollIntervalMs: number; sessionListMinimumRecentMinutes: number; sessionListPaddingMinutes: number; sessionListCacheTtlMs: number; resultReadMaximumBytes: number; collectorWaitTimeoutSeconds: number; targetTimingProfiles: Readonly<Record<string, Readonly<{ spawnIntervalMs: number; pollMs: number; maxPollMs: number; maxPolls: number; sessionTimeoutMs: number }>>> }>;
  readonly operatorMessagingStore: Readonly<{ maximumDeliveryRecords: number; maximumDeliveryBytes: number; maximumRecordBytes: number }>;
  readonly transportPublisherStore: Readonly<{ maximumDeliveryRecords: number; maximumDeliveryBytes: number; maximumRecordBytes: number }>;
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
  // Disjoint generations: v3 requires the new admission policy, while original
  // v1/v2 captures retain their exact bytes/shape and fixed protocol semantics.
  // Never complete an invalid v3 capture from current or historical defaults.
  if ((selected.policyVersion === 'nova-core-runtime-policy.v3') !== Object.hasOwn(selected.operatorMessagingPayload, 'payloadStructure')) throw new Error('CORE_RUNTIME_POLICY_VERSION_MISMATCH');
  for (const timing of Object.values(selected.openClawDispatch.targetTimingProfiles)) {
    if (timing.maxPollMs < timing.pollMs || timing.sessionTimeoutMs < timing.pollMs) throw new Error('CORE_RUNTIME_POLICY_BUDGET_INVALID');
  }
  if (selected.sourceAcquisition.forceKillAfterMs >= selected.sourceAcquisition.cleanupTimeoutMs
    || selected.sourceAcquisition.pollIntervalMs > selected.sourceAcquisition.cleanupTimeoutMs) throw new Error('CORE_RUNTIME_POLICY_BUDGET_INVALID');
  if (selected.artifactStore.maxArtifactBytes > selected.artifactStore.maximumStoreBytes
    || selected.artifactStore.maximumRecordBytes > selected.artifactStore.maximumStoreBytes
    || selected.runMutationRenewalMs >= selected.runMutationTtlMs
    || selected.recovery.attempts.maximumEvidenceObjectBytes > selected.recovery.attempts.maximumEvidenceBytes
    || selected.recovery.admission.maximumIngressBytes > selected.recovery.admission.maximumBytes) throw new Error('CORE_RUNTIME_POLICY_BUDGET_INVALID');
  if ((Object.hasOwn(selected,'reviewPolicySelection') && selected.reviewPolicySelection === undefined) || (Object.hasOwn(selected,'reviewPolicyCapture') && selected.reviewPolicyCapture === undefined)) throw new Error('CORE_RUNTIME_POLICY_INVALID');
  if (selected.reviewPolicyCapture !== undefined) {
    captureReviewPolicy(selected.reviewPolicyCapture);
    if(selected.reviewPolicyCapture.source.profile !== selected.reviewPolicySelection!.profile)throw new Error('REVIEW_POLICY_CAPTURE_SELECTION_MISMATCH');
  }
  return freeze(selected);
}
/** Explicit platform-selected source only; never CWD discovery/ENV/default selection. */
export function loadCoreRuntimePolicy(selection: Readonly<{file: string; profile: string}>): CoreRuntimePolicy {
  if (!selection || typeof selection.file !== 'string' || !selection.file.startsWith('/') || !selection.profile) throw new Error('CORE_RUNTIME_POLICY_SELECTION_REQUIRED');
  const document = JSON.parse(fs.readFileSync(fs.realpathSync(selection.file), 'utf8'));
  if (!document || Object.keys(document).sort().join(',') !== 'profiles,schemaVersion'
    || !['nova-core-runtime-policy.v1', 'nova-core-runtime-policy.v2', 'nova-core-runtime-policy.v3'].includes(document.schemaVersion) || !document.profiles || typeof document.profiles !== 'object'
    || Array.isArray(document.profiles) || !Object.hasOwn(document.profiles,selection.profile)) throw new Error('CORE_RUNTIME_POLICY_DOCUMENT_INVALID');
  // All authored profiles remain complete; selecting one cannot hide a malformed sibling.
  const profiles = new Map<string, CoreRuntimePolicy>();
  for (const [name, profile] of Object.entries(document.profiles)) {
    if (!profile || typeof profile !== 'object' || Object.keys(profile).join(',') !== 'settings') throw new Error('CORE_RUNTIME_POLICY_PROFILE_INVALID');
    const authored=(profile as {settings: Record<string,unknown>}).settings;
    if (!authored || typeof authored !== 'object' || Array.isArray(authored)) throw new Error('CORE_RUNTIME_POLICY_PROFILE_INVALID');
    if (Object.hasOwn(authored,'reviewPolicyCapture')) throw new Error('REVIEW_POLICY_CAPTURE_COMPETING_AUTHOR');
    const settings=captureCoreRuntimePolicy(Object.hasOwn(authored,'reviewPolicySelection')
      ? {...authored,reviewPolicyCapture:loadReviewPolicy(authored.reviewPolicySelection,path.dirname(fs.realpathSync(selection.file)))} : authored);
    if (settings.policyVersion !== (document.schemaVersion === 'nova-core-runtime-policy.v1' ? undefined : document.schemaVersion)) throw new Error('CORE_RUNTIME_POLICY_VERSION_MISMATCH');
    profiles.set(name, settings);
  }
  return profiles.get(selection.profile)!;
}
