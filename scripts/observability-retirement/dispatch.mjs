import path from 'node:path';
import { portableJson, verifiedArtifactJsonText } from '../../skills/common/plugin-runtime/sdk/src/index.ts';
import { validateContractValue } from '../../skills/common/plugin-runtime/foundation/registry/schema.ts';
import { readRunEvidence } from '../../skills/nova/core/state/read-run-evidence.ts';
import { createRemotePlanJob } from '../../skills/nova/core/test-gates/remote-dispatch.ts';
import { repositoryArchiveBytes } from '../../contracts/pipeline-test-gate/v1/src/index.ts';
import { journal } from './journals.mjs';
import { recordSnapshot } from './stores.mjs';

const same = (left, right) => portableJson(left) === portableJson(right);
const fail = () => { throw new Error('NOVA_DISPATCH_RETENTION_CORE_AUTHORITY_REQUIRED'); };
const resolution = provenance => ({ ...provenance.package.package, registrationId: provenance.registrationId });

function pinnedProvider(selected, capability, pluginId, registrationId) {
  const provider = selected?.find(item => item.capability === capability)?.provider;
  if (provider?.package?.package?.pluginId !== pluginId || provider.registrationId !== registrationId) fail();
  return provider;
}

export function coreDispatchRoots(inventory, scope) {
  const snapshot = inventory.json(path.join(scope.intent.runRoot, 'run-snapshot.json'));
  const selected = snapshot.registry.selectedProviders;
  const remote = pinnedProvider(selected, 'test.plan.execute', 'kubeclaw.remote-test-gate', 'plan');
  const artifact = pinnedProvider(selected, 'artifacts.write', 'kubeclaw.artifact-store', 'artifact-store');
  const config = snapshot.registry.configuration?.adapters;
  if (config?.['kubeclaw.remote-test-gate:plan']?.stateRoot !== scope.stateRoot) fail();
  const artifactRoot = config?.['kubeclaw.artifact-store:artifact-store']?.artifactRoot;
  if (typeof artifactRoot !== 'string' || !path.isAbsolute(artifactRoot) || path.resolve(artifactRoot) !== artifactRoot) fail();
  inventory.root(artifactRoot, 'original-decision-artifacts');
  return { snapshot, remote, artifact, artifactRoot, config };
}

function effectResult(inventory, runRoot, entry) {
  if (entry.type === 'completed') return entry.receipt.result;
  const reference = entry.result;
  if (entry.type !== 'completed-reference' || reference?.schemaVersion !== 'effect-result-reference.v1'
    || !/^sha256:[a-f0-9]{64}$/u.test(reference.contentDigest)) fail();
  const file = path.join(runRoot, 'effect-results/sha256', reference.contentDigest.slice(7, 9), `${reference.contentDigest.slice(9)}.json`);
  const observed = inventory.files.get(file);
  if (observed?.hash !== reference.contentDigest || observed.bytes !== reference.bytes) fail();
  return inventory.json(file);
}
function selectedEffect(records, key) {
  const entries = records.filter(({ entry }) => (entry.request?.idempotencyKey ?? entry.receipt?.idempotencyKey) === key);
  if (entries.length !== 3 || entries[0].entry.type !== 'requested' || entries[1].entry.type !== 'accepted'
    || !['completed', 'completed-reference'].includes(entries[2].entry.type)) fail();
  validateContractValue('effectRequest', entries[0].entry.request);
  validateContractValue('effectRequest', entries[1].entry.request);
  validateContractValue('effectReceipt', entries[2].entry.receipt);
  return { request: entries[0].entry.request, completion: entries[2].entry, start: entries[0].sequence, end: entries[2].sequence };
}
function boundStage(job, context) {
  const stage = context.snapshot.graph.nodes.find(item => item.id === job.pipelineStageId);
  const configured = context.snapshot.registry.configuredStages.find(item => item.stageId === job.pipelineStageId);
  if (!stage || stage.type !== 'kubeclaw.test.quality-evaluation' || configured?.stageType !== stage.type
    || configured.owner?.package?.package?.pluginId !== 'kubeclaw.buster-quality-gate') fail();
  return { stage, configured };
}
function boundProviderPlan(job, payload, stage, context) {
  // Derived source-stage authority needs its original producer artifact linkage.
  // This bounded projection slice must not guess that missing ownership.
  if (typeof stage.input.providerPlan?.revision !== 'string' || stage.input.providerPlan.sourceStageId !== undefined) fail();
  for (const key of ['plan', 'repositoryRoot', 'repositoryId', 'grants', 'maximumConcurrency', 'submittedAt', 'timeoutMs']) {
    if (!same(payload[key], stage.input.providerPlan?.[key])) fail();
  }
  if (payload.gateId !== stage.input.gateId || job.sourceSnapshot.revision !== `git:${payload.revision}`
    || job.sourceSnapshot.creatorAuthority !== context.config['kubeclaw.remote-test-gate:plan'].sourceAuthority
    || (stage.input.providerPlan.revision !== undefined && payload.revision !== stage.input.providerPlan.revision)) fail();
}
function boundRequest(job, effect, context) {
  const { request, completion } = effect, payload = request.payload;
  const { stage, configured } = boundStage(job, context);
  if (request.capability !== 'test.plan.execute' || request.operation !== 'run' || request.resource.type !== 'test.resolved-plan'
    || request.resource.canonicalId !== payload.repositoryRoot || request.attempt.runId !== job.plan.runId
    || request.attempt.stageId !== job.pipelineStageId || completion.receipt.status !== 'completed'
    || !same(completion.receipt.adapter, resolution(context.remote))) fail();
  boundProviderPlan(job, payload, stage, context);
  const reconstructed = createRemotePlanJob({ idempotencyKey: request.idempotencyKey, pipelineStageId: request.attempt.stageId,
    plan: payload.plan, repositoryArchive: repositoryArchiveBytes(job.repositoryArchive), sourceSnapshot: job.sourceSnapshot,
    grants: new Map(Object.entries(payload.grants)), maximumConcurrency: payload.maximumConcurrency, submittedAt: payload.submittedAt });
  if (!same(reconstructed, job)) fail();
  return { stage, configured };
}
function boundAttempt(events, request, configured) {
  const attempt = request.attempt, entries = events.filter(({ entry }) => entry.identity.attemptId === attempt.attemptId);
  const created = entries.filter(({ entry }) => entry.type === 'attempt.created');
  const dispatched = entries.filter(({ entry }) => entry.type === 'attempt.dispatched');
  const completed = entries.filter(({ entry }) => entry.type === 'attempt.completed');
  if (created.length !== 1 || dispatched.length !== 1 || completed.length !== 1
    || !same(created[0].entry.payload.attempt.identity, attempt)
    || !same(created[0].entry.payload.attempt.owner, resolution(configured.owner))
    || created[0].sequence >= dispatched[0].sequence || dispatched[0].sequence >= completed[0].sequence) fail();
  const audit = entries.filter(({ entry }) => entry.identity.effectId === request.effectId);
  if (audit.map(({ entry }) => entry.type).join(',') !== 'effect.requested,effect.accepted,effect.completed'
    || dispatched[0].sequence >= audit[0].sequence || audit[2].sequence >= completed[0].sequence) fail();
  return completed[0].entry.payload.result;
}
function decisionWrite(effects, effect, decision, context) {
  const writes = effects.filter(({ entry }) => entry.type === 'requested' && entry.request.capability === 'artifacts.write'
    && same(entry.request.attempt, effect.request.attempt) && same(entry.request.payload.value, decision));
  if (writes.length !== 1 || writes[0].sequence <= effect.end) fail();
  const stored = selectedEffect(effects, writes[0].entry.request.idempotencyKey);
  if (stored.request.operation !== 'put_json' || stored.request.payload.namespace !== 'kubeclaw.buster-quality-gate'
    || stored.completion.receipt.status !== 'completed' || !same(stored.completion.receipt.adapter, resolution(context.artifact))) fail();
  return stored;
}
function boundDecisionArtifact(inventory, scope, context, effects, effect, result, decision) {
  const stored = decisionWrite(effects, effect, decision, context);
  const artifact = effectResult(inventory, scope.intent.runRoot, stored.completion)?.artifact;
  if (!artifact || !same(artifact.producer, effect.request.attempt) || !result.artifacts.some(item => same(item, artifact))) fail();
  const record = recordSnapshot(inventory, context.artifactRoot).find(item => item.stream === 'artifacts/kubeclaw.buster-quality-gate'
    && item.idempotencyKey === stored.request.idempotencyKey);
  if (!record || !same(record.payload, artifact)) fail();
  const file = path.join(context.artifactRoot, 'blobs/sha256', artifact.digest.slice(7, 9), artifact.digest.slice(9));
  const observed = inventory.files.get(file);
  if (observed?.hash !== artifact.digest || observed.bytes !== artifact.sizeBytes) fail();
  const jsonBytes = inventory.text(file), value = JSON.parse(jsonBytes);
  verifiedArtifactJsonText({ schemaVersion: 'artifact-json-bytes.v1', jsonBytes, value,
    digest: artifact.digest, sizeBytes: observed.bytes, artifact }, artifact);
  if (!same(value, decision)) fail();
}

/** Pure final check under run/import/dispatch fences; all bytes were bounded and pinned. */
export function assertCoreDispatch(inventory, scope, job, decision) {
  readRunEvidence({ runId: scope.intent.runId, journalHead: scope.intent.runJournalHead, snapshotDigest: scope.intent.snapshotDigest },
    { storageRoot: scope.novaStorageRoot, maximumBytes: scope.inventoryLimits.maximumTotalBytes, orchestratorIssuerId: scope.orchestratorIssuerId });
  const context = coreDispatchRoots(inventory, scope);
  const effects = journal(inventory, path.join(scope.intent.runRoot, 'effects.jsonl'));
  const effect = selectedEffect(effects, job.idempotencyKey);
  const { configured } = boundRequest(job, effect, context);
  if (!same(effectResult(inventory, scope.intent.runRoot, effect.completion), decision)) fail();
  const events = journal(inventory, path.join(scope.intent.runRoot, 'events.jsonl'));
  const result = boundAttempt(events, effect.request, configured);
  boundDecisionArtifact(inventory, scope, context, effects, effect, result, decision);
}
