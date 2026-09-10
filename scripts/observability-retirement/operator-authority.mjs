import path from 'node:path';
import crypto from 'node:crypto';
import { portableJson } from '../../skills/common/plugin-runtime/sdk/src/index.ts';
import { validateContractValue } from '../../skills/common/plugin-runtime/foundation/registry/schema.ts';
import { payloadDigest } from '../../skills/common/plugin-runtime/foundation/observability/record-retirement.ts';
import { readRunEvidence } from '../../skills/nova/core/state/read-run-evidence.ts';
import { recoverWaitCreation } from '../../skills/nova/core/lifecycle/recovery.ts';
import { parseApprovalConfig, parseApprovalInput, parseApprovalGuidance, validateCreatedWait,
  pendingApprovalResult, resultForApprovalGuidance } from '../../skills/nova/plugins/human-approval/src/approval.ts';
import { journal } from './journals.mjs';

const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const same = (left, right) => portableJson(left) === portableJson(right);
const fail = () => { throw new Error('OPERATOR_RETENTION_CORE_AUTHORITY_REQUIRED'); };
const resolution = provenance => ({ ...provenance.package.package, registrationId: provenance.registrationId });
const select = (items, predicate) => { const selected = items.filter(predicate); if (selected.length !== 1) fail(); return selected[0]; };

function provider(snapshot, capability, pluginId, registrationId) {
  const selected = select(snapshot.registry.selectedProviders, item => item.capability === capability).provider;
  if (selected?.package?.package?.pluginId !== pluginId || selected.registrationId !== registrationId) fail();
  return resolution(selected);
}
export function operatorConfiguration(inventory, scope) {
  const snapshot = inventory.json(path.join(scope.intent.runRoot, 'run-snapshot.json'));
  const operator = provider(snapshot, 'operator.request', 'kubeclaw.operator-messaging', 'operator');
  const waits = provider(snapshot, 'signal.wait', 'kubeclaw.wait-store', 'waits');
  const config = snapshot.registry.configuration?.adapters;
  const delivery = config?.['kubeclaw.operator-messaging:operator'], wait = config?.['kubeclaw.wait-store:waits'];
  if (delivery?.deliveryRoot !== scope.intent.deliveryRoot || wait?.root !== scope.intent.waitRoot) fail();
  return { snapshot, operator, waits, delivery, wait,
    deliveryLimits: { maximumRecords: delivery.maximumDeliveryRecords ?? 100000, maximumBytes: delivery.maximumDeliveryBytes ?? 268435456,
      maximumRecordBytes: 2 * 1048576 + 65536 },
    waitLimits: { maximumRecords: wait.maximumRecords ?? 100000, maximumBytes: wait.maximumStoreBytes ?? 268435456,
      maximumRecordBytes: wait.maxEntryBytes ?? 1048576 } };
}
function selectedEffect(records, key, adapter) {
  const selected = records.filter(({ entry }) => (entry.request?.idempotencyKey ?? entry.receipt?.idempotencyKey) === key);
  if (selected.length !== 3 || selected[0].entry.type !== 'requested' || selected[1].entry.type !== 'accepted'
    || selected[2].entry.type !== 'completed') fail(); // externalized selected result unsupported in this bounded slice
  const request = selected[0].entry.request, receipt = selected[2].entry.receipt;
  validateContractValue('effectRequest', request); validateContractValue('effectRequest', selected[1].entry.request);
  validateContractValue('effectReceipt', receipt);
  if (!same(request, selected[1].entry.request) || receipt.status !== 'completed' || !same(receipt.adapter, adapter)
    || receipt.idempotencyKey !== request.idempotencyKey || receipt.effectId !== request.effectId || request.parent !== undefined) fail();
  return { request, receipt, start: selected[0].sequence, end: selected[2].sequence };
}
function attempt(events, identity, owner) {
  const own = events.filter(({ entry }) => entry.identity.attemptId === identity.attemptId);
  const created = select(own, ({ entry }) => entry.type === 'attempt.created');
  const dispatched = select(own, ({ entry }) => entry.type === 'attempt.dispatched');
  const completed = select(own, ({ entry }) => entry.type === 'attempt.completed');
  if (!same(created.entry.payload.attempt.identity, identity) || !same(created.entry.payload.attempt.owner, owner)
    || created.sequence >= dispatched.sequence || dispatched.sequence >= completed.sequence) fail();
  return { created, dispatched, completed, events: own };
}
function effectAudit(ownedAttempt, effect) {
  const audit = ownedAttempt.events.filter(({ entry }) => entry.identity.effectId === effect.request.effectId);
  if (audit.map(({ entry }) => entry.type).join(',') !== 'effect.requested,effect.accepted,effect.completed'
    || ownedAttempt.dispatched.sequence >= audit[0].sequence || audit[2].sequence >= ownedAttempt.completed.sequence
    || !same(audit[2].entry.payload.result, effect.receipt.result)) fail();
}
function humanStage(context, request) {
  const stage = select(context.snapshot.graph.nodes, node => node.id === request.attempt.stageId);
  const configured = select(context.snapshot.registry.configuredStages, item => item.stageId === stage.id);
  if (stage.type !== 'kubeclaw.decision.human-approval' || configured.stageType !== stage.type
    || configured.owner?.package?.package?.pluginId !== 'kubeclaw.human-approval'
    || configured.owner.registrationId !== 'approval') fail();
  const config = parseApprovalConfig(stage.config), input = parseApprovalInput(stage.input);
  jsonTarget(context, request, config);
  return { stage, configured, config, input };
}
function jsonTarget(context, request, config) {
  const target = context.delivery.targets?.[config.target];
  if (!target || (target.format !== undefined && target.format !== 'json') || request.deliveryId !== undefined
    || request.capability !== 'operator.request' || request.operation !== 'publish'
    || request.resource.type !== 'operator.target' || request.resource.canonicalId !== config.target) fail();
}
function selectedWait(effects, notification, context, human) {
  const record = select(effects, ({ entry }) => entry.type === 'requested' && entry.request.capability === 'signal.wait'
    && same(entry.request.attempt, notification.request.attempt));
  const effect = selectedEffect(effects, record.entry.request.idempotencyKey, context.waits);
  const approvalId = `approval:${notification.request.attempt.runId}:${human.stage.id}`, expiresAt = effect.request.payload.expiresAt;
  const issuer = { type: 'operator', id: human.config.issuerId };
  if (effect.end >= notification.start || effect.request.operation !== 'create'
    || !same(effect.request.resource, { type: 'signal.wait', canonicalId: approvalId })
    || !same(effect.request.payload, { kind: 'signal', signalType: 'approval.resolved', authorizedIssuer: issuer,
      expiresAt, request: { summary: human.input.summary } })) fail();
  const wait = validateCreatedWait(effect.receipt.result, { issuerId: human.config.issuerId, expiresAt, summary: human.input.summary });
  if (wait.waitId !== `wait:${hash(effect.request.idempotencyKey)}`
    || !same(notification.request.payload, { type: 'approval.requested', approvalId, waitId: wait.waitId,
      summary: human.input.summary, signalType: wait.signalType, authorizedIssuer: issuer, expiresAt })) fail();
  return { effect, wait };
}
function originalWaitValue(waitRecords, waiting) {
  const record = select(waitRecords, item => item.stream === 'waits/all' && item.idempotencyKey === waiting.effect.request.idempotencyKey);
  if (!same(record.payload, { schemaVersion: 'wait-value.v1', wait: waiting.wait })) fail();
  return record;
}
function historicalSignal(inventory, scope, events, waiting, first, human) {
  const definition = { schemaVersion: 'pipeline-definition.v2', id: human.graph.pipelineId,
    maxConcurrency: human.graph.maxConcurrency, stages: human.graph.nodes };
  const created = recoverWaitCreation(definition, events, scope.intent.runId, scope.orchestratorIssuerId, waiting.wait.waitId);
  if (!created || created.hash !== first.completed.hash || !same(first.completed.entry.payload.result, pendingApprovalResult(waiting.wait))) fail();
  const signals = journal(inventory, path.join(scope.intent.runRoot, 'signals.jsonl'));
  const signal = select(signals, ({ entry }) => entry.waitId === waiting.wait.waitId).entry;
  validateContractValue('resumeSignal', signal);
  const resolved = select(events, ({ entry }) => entry.type === 'wait.resolved' && entry.identity.waitId === waiting.wait.waitId);
  const guidance = parseApprovalGuidance(signal.payload, human.config.issuerId);
  if (guidance.decision !== 'approved' || !same(signal.issuer, waiting.wait.authorizedIssuer)
    || !same(signal.payload.issuer, signal.issuer) || signal.signalType !== waiting.wait.signalType
    || resolved.entry.identity.stageId !== human.stage.id || resolved.entry.causationId !== signal.signalId
    || !same(resolved.entry.payload.signal, signal) || created.sequence >= resolved.sequence) fail();
  historicalTimes(created.entry.occurredAt, signal.issuedAt, resolved.entry.occurredAt, waiting.wait.expiresAt);
  return { signal, resolved, guidance };
}
function historicalTimes(...values) {
  const times = values.map(Date.parse);
  if (times.some(value => !Number.isFinite(value)) || times[0] > times[1] || times[1] > times[2] || times[2] >= times[3]) fail();
}
function approvedAttempt(events, first, resolved, human) {
  const nextCreated = select(events, ({ entry }) => entry.type === 'attempt.created' && entry.identity.stageId === human.stage.id
    && entry.payload.attempt.identity.attemptNumber === first.created.entry.payload.attempt.identity.attemptNumber + 1);
  const next = attempt(events, nextCreated.entry.payload.attempt.identity, resolution(human.configured.owner));
  if (resolved.resolved.sequence >= next.created.sequence || !same(next.completed.entry.payload.result, resultForApprovalGuidance(resolved.guidance))) fail();
  const terminal = events.filter(({ entry }) => ['run.succeeded', 'run.failed', 'run.cancelled'].includes(entry.type)).at(-1);
  if (!terminal || next.completed.sequence >= terminal.sequence) fail();
  return next;
}

/** Pure selected original producer/consumer proof; caller owns run and wait fences. */
export function operatorAuthority(inventory, scope, context, waitRecords) {
  readRunEvidence({ runId: scope.intent.runId, journalHead: scope.intent.runJournalHead, snapshotDigest: scope.intent.snapshotDigest },
    { storageRoot: scope.novaStorageRoot, maximumBytes: scope.inventoryLimits.maximumTotalBytes, orchestratorIssuerId: scope.orchestratorIssuerId });
  const effects = journal(inventory, path.join(scope.intent.runRoot, 'effects.jsonl'));
  const notification = selectedEffect(effects, scope.intent.effectKey, context.operator);
  if (notification.request.attempt.runId !== scope.intent.runId) fail();
  const human = { ...humanStage(context, notification.request), graph: context.snapshot.graph };
  const events = journal(inventory, path.join(scope.intent.runRoot, 'events.jsonl'));
  const first = attempt(events, notification.request.attempt, resolution(human.configured.owner));
  effectAudit(first, notification);
  const waiting = selectedWait(effects, notification, context, human);
  effectAudit(first, waiting.effect);
  const waitRecord = originalWaitValue(waitRecords, waiting);
  const resolved = historicalSignal(inventory, scope, events, waiting, first, human);
  const next = approvedAttempt(events, first, resolved, human);
  return { request: notification.request, receipt: notification.receipt.result,
    digest: payloadDigest({ effect: notification, wait: waiting, waitRecordDigest: waitRecord.payloadDigest,
      signal: resolved.signal, firstAttempt: first.completed.hash, approvedAttempt: next.completed.hash }) };
}
