import {resolveAdmissionRetiredSnapshot} from '../../skills/common/plugin-runtime/foundation/observability/admission-retirement.ts';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertDurableRecordReplay } from '../../skills/common/plugin-runtime/foundation/observability/durable-records.ts';
import { assertAdmissionReplay } from '../../skills/common/plugin-runtime/foundation/observability/replay-validation.ts';
import { decodeAttemptState } from '../../skills/common/plugin-runtime/foundation/observability/attempt-projection.ts';
import { identityHash } from './files.mjs';
import { assertCompactedPlanJobRecord } from '../../skills/buster/engine/test-gates/remote-plan-compaction.ts';
import { remotePlanJobId } from '../../contracts/pipeline-test-gate/v1/src/index.ts';

const digestPattern = /^sha256:[a-f0-9]{64}$/u;
const broadLimits = {
  maximumIngressBytes: Number.MAX_SAFE_INTEGER, maximumRecords: Number.MAX_SAFE_INTEGER,
  maximumBytes: Number.MAX_SAFE_INTEGER, maximumQuarantineRecords: Number.MAX_SAFE_INTEGER,
  maximumQuarantineBytes: Number.MAX_SAFE_INTEGER, maximumMetadataBytes: Number.MAX_SAFE_INTEGER,
  maximumEvidenceObjects: Number.MAX_SAFE_INTEGER, maximumEvidenceBytes: Number.MAX_SAFE_INTEGER,
  maximumEvidenceObjectBytes: Number.MAX_SAFE_INTEGER, maximumResults: Number.MAX_SAFE_INTEGER,
  maximumClosures: Number.MAX_SAFE_INTEGER, maximumPendingEvidenceAgeMs: Number.MAX_SAFE_INTEGER,
};
function inventoryAttemptState(inventory,root) {
  const raw=inventory.json(path.join(root,'attempt-store.json'));
  return decodeAttemptState(raw,root,{...broadLimits,maximumMetadataBytes:inventory.limits.maximumSnapshotBytes},(file,maximumBytes,prefixBytes)=>{
    const bytes=Buffer.from(inventory.text(file));
    if(bytes.length>maximumBytes||bytes.length<prefixBytes)throw new Error('SNAPSHOT_BYTE_LIMIT');
    return bytes.subarray(0,prefixBytes);
  }).state;
}
// The planner's bounded inventory limits allocation. These validator limits do
// not pretend to be the live deployment's configured admission quotas.
function blobPath(root, hash) {
  if (!digestPattern.test(hash)) throw new Error('REFERENCE_DIGEST_INVALID');
  return path.join(root, 'blobs/sha256', hash.slice(7, 9), hash.slice(9));
}
export function recordSnapshot(inventory, root) {
  const file = path.join(root, 'records/store.json');
  const snapshot = inventory.json(file);
  assertDurableRecordReplay(snapshot);
  return snapshot.records;
}

export function recordRetirementSnapshot(inventory, root) {
  const snapshot = inventory.json(path.join(root, 'records/store.json'));
  assertDurableRecordReplay(snapshot);
  return (snapshot.retirements ?? []).map(entry => ({
    operationIdHash: identityHash(entry.intent.operationId), ownerRunId: entry.intent.owner,
    stream: entry.intent.stream, records: entry.intent.records.length,
    intentDigest: entry.intentDigest, releasedBytes: Number.parseInt(entry.releasedBytesHex,16),
    disposition: 'retain-idempotency-and-retirement-evidence',
  }));
}

function validArtifactRecord(record) {
  const artifact = record.payload;
  return typeof artifact?.producer?.runId === 'string' && record.stream === `artifacts/${artifact.namespace}`
    && typeof artifact.artifactId === 'string' && typeof artifact.namespace === 'string'
    && digestPattern.test(artifact.digest) && Number.isSafeInteger(artifact.sizeBytes) && artifact.sizeBytes >= 0;
}

export function inspectArtifacts(inventory, root, runId, references) {
  const records = recordSnapshot(inventory, root);
  const matching = [];
  const digestOwners = new Map();
  for (const record of records) {
    const artifact = record.payload;
    if (!validArtifactRecord(record)) {
      inventory.block('ARTIFACT_REFERENCE_UNKNOWN', identityHash(record.idempotencyKey)); continue;
    }
    const target = blobPath(root, artifact.digest);
    const observed = inventory.files.get(target);
    if (observed?.hash !== artifact.digest || observed.bytes !== artifact.sizeBytes) inventory.block('ARTIFACT_BLOB_MISSING_OR_CHANGED', target);
    const owners = digestOwners.get(artifact.digest) ?? new Set(); owners.add(artifact.producer.runId); digestOwners.set(artifact.digest, owners);
    const reference = { ownerRunId: artifact.producer.runId, namespace: artifact.namespace, artifactId: artifact.artifactId, digest: artifact.digest,
      bytes: artifact.sizeBytes, path: target, recordSequence: record.sequence, recordDigest: record.payloadDigest, idempotencyKeyHash: identityHash(record.idempotencyKey), disposition: 'retain' };
    references.push(reference);
    if (artifact.producer.runId === runId) matching.push(reference);
  }
  for (const item of matching) {
    if (digestOwners.get(item.digest).size > 1) inventory.block('ARTIFACT_SHARED_WITH_OTHER_RUN', item.digest);
  }
  return { root, records: records.length, targetRecords: matching.length };
}

export function inspectAdmission(inventory, root, runId) {
  const file = path.join(root, 'admission.json');
  const state = inventory.json(file);
  assertAdmissionReplay(state, broadLimits);
  for (const item of [...state.unresolvedItems, ...state.overflowUnresolvedItems]) {
    if (item.pipelineRunId === runId) inventory.block('OBSERVABILITY_UNRESOLVED', identityHash(item.itemId));
  }
  for (const gap of state.gaps) {
    if (gap.pipelineRunId === runId && gap.state !== 'restored') inventory.block('PRODUCER_GAP_UNRESOLVED', identityHash([gap.producer.producerId, gap.fromSequence, gap.toSequence]));
  }
  if (state.quarantine.length || state.quarantineOverflow) inventory.block('QUARANTINE_OWNERSHIP_UNKNOWN', root);
  const retired=(state.retiredEntries??[]).filter(item=>item.acknowledgement.pipelineRunId===runId);
  for(const entry of retired) {
    if(!inventory.files.has(entry.source.file)){inventory.block('ADMISSION_COMPLETION_REFERENCE_UNKNOWN',entry.source.file);continue;}
    const source=inventoryAttemptState(inventory,path.dirname(entry.source.file));
    resolveAdmissionRetiredSnapshot(entry,source);
  }
  return { root, nextCursor: state.nextCursor, retiredCompletions:retired.map(entry=>({
    recordId:entry.acknowledgement.recordId,cursor:entry.acknowledgement.canonicalCursor,digest:entry.acknowledgement.recordDigest,
    source:entry.source.file,resultDigest:entry.source.resultDigest,closureDigest:entry.source.closureDigest,disposition:'retain-completion-source-and-idempotency-reference',
  })), records: state.entries.filter(item => item.record.correlation.pipelineRunId === runId).map(item => ({
    recordId: item.record.recordId, cursor: item.canonicalCursor, sequence: item.record.sequence, digest: item.record.recordDigest,
    producerId: item.record.producer.producerId, bytes: Buffer.byteLength(item.bytes), disposition: 'retain',
  })) };
}

export function inspectAttempts(inventory, root, runId, references) {
  const state = inventoryAttemptState(inventory,root);
  const results = state.results.filter(result => result.pipelineRunId === runId);
  for (const item of results) {
    if (!item.storedAt || !item.completionIntent || item.result.state === 'uncertain') inventory.block('ATTEMPT_COMPLETION_UNCONFIRMED', identityHash(item.attemptId));
  }
  for (const item of state.evidence) {
    if (item.pipelineRunId === runId && !results.some(result => result.attemptId === item.attemptId
      && result.claimGeneration === item.claimGeneration && result.result.evidence.some(ref => ref.evidenceId === item.evidenceId))) {
      inventory.block('EVIDENCE_RESULT_UNCONFIRMED', identityHash(item.evidenceId));
    }
    const target = fileURLToPath(item.artifact.storageUrl);
    const observed = inventory.files.get(target);
    if (observed?.hash !== item.artifact.contentDigest || observed.bytes !== item.artifact.sizeBytes) inventory.block('EVIDENCE_REFERENCE_UNKNOWN', identityHash(item.evidenceId));
    references.push({ ownerRunId: item.pipelineRunId, attemptId: item.attemptId, generation: item.claimGeneration, evidenceId: item.evidenceId,
      artifactId: item.artifact.artifactId, digest: item.artifact.contentDigest, bytes: item.artifact.sizeBytes, path: target, disposition: 'retain' });
  }
  return { root, results: results.map(item => ({ attemptId: item.attemptId, generation: item.claimGeneration, digest: item.result.resultDigest, state: item.result.state })),
    closures: state.closures.filter(item => item.pipelineRunId === runId).map(item => ({ closureId: item.closureId, digest: item.closureDigest })) };
}

function validJobVariant(payload) {
  if (payload?.schemaVersion === 'buster-plan-job-record.v1') return true;
  if (payload?.schemaVersion !== 'buster-plan-job-compacted-record.v1') return false;
  try { assertCompactedPlanJobRecord(payload); return true; } catch { return false; }
}
function validJobRecord(record) {
  const { job, status } = record.payload ?? {};
  return validJobVariant(record.payload) && typeof job?.plan?.runId === 'string'
    && job.idempotencyKey === record.idempotencyKey && remotePlanJobId(record.idempotencyKey) === job.jobId
    && digestPattern.test(job.requestDigest) && status?.jobId === job.jobId && status?.requestDigest === job.requestDigest;
}

function inspectJobResult(inventory, root, status) {
  if (status.result) {
    const target = blobPath(path.join(root, 'results'), status.result.contentDigest ?? status.result.digest);
    if (inventory.files.get(target)?.hash !== (status.result.contentDigest ?? status.result.digest) || inventory.files.get(target)?.bytes !== status.result.sizeBytes) inventory.block('JOB_RESULT_REFERENCE_UNKNOWN', target);
  }
}

export function inspectJobs(inventory, root, runtimeRoot, runId) {
  const records = recordSnapshot(inventory, root);
  const jobs = [];
  for (const record of records) {
    if (record.stream !== 'buster-plan-jobs') { inventory.block('JOB_STREAM_UNKNOWN', identityHash(record.stream)); continue; }
    const { job, status } = record.payload ?? {};
    if (!validJobRecord(record)) {
      inventory.block('JOB_IDENTITY_UNKNOWN', identityHash(record.idempotencyKey)); continue;
    }
    if (job.plan.runId !== runId) continue;
    const jobRoot = path.join(runtimeRoot, identityHash(job.jobId).slice(7));
    jobs.push({ jobId: job.jobId, requestDigest: job.requestDigest, idempotencyKeyHash: identityHash(record.idempotencyKey),
      recordSequence: record.sequence, recordDigest: record.payloadDigest, root: jobRoot, state: ['accepted', 'running', 'completed', 'failed', 'cancelled', 'uncertain'].includes(status.state) ? status.state : 'unknown', disposition: 'retain' });
    if (!['completed', 'failed', 'cancelled'].includes(status.state)) inventory.block('JOB_ACTIVE_OR_UNCERTAIN', identityHash(job.jobId));
    inventory.root(jobRoot, 'buster-job');
    if (!inventory.files.has(path.join(jobRoot, 'observability/attempts/attempt-store.json'))) inventory.block('JOB_EVIDENCE_SCOPE_UNKNOWN', jobRoot);
    inspectJobResult(inventory, root, status);
  }
  return { root, records: records.length, jobs };
}
