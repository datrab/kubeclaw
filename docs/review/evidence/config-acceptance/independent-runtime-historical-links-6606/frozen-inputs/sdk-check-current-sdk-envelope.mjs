import assert from 'node:assert/strict';
import { validateContractValue } from '../../../../../../skills/common/plugin-runtime/foundation/registry/schema.ts';

const original = { schemaVersion: 'lifecycle-event.v2', eventId: 'event:c0-envelope',
  sequence: 1, type: 'stage.started', identity: { runId: 'run:c0-envelope', stageId: 'implement-api' },
  occurredAt: '2026-10-13T03:00:00.000Z', causationId: null,
  payload: { stageType: 'kubeclaw.agent.implementation' } };
const observations = [];
function accept(id, value, limits) {
  validateContractValue('lifecycleEvent', value);
  observations.push({ id, result: 'passed', observed: 'current contract accepts', limits });
}
function reject(id, value, instancePath, keyword) {
  let diagnostic;
  assert.throws(() => validateContractValue('lifecycleEvent', value), error => {
    diagnostic = error.details;
    return error.code === 'REGISTRY_RESULT_INVALID' && error.details.errors.some(item => item.instancePath === instancePath && item.keyword === keyword);
  });
  observations.push({ id, result: 'passed', observed: 'current contract rejects at intended boundary', diagnostic });
}
accept('SDK-CURRENT-STAGE-ENVELOPE', structuredClone(original), 'Schema validation only, no actual stage/observer action.');
reject('SDK-NEW-MODULE-TYPE-UNSUPPORTED', { ...original, type: 'module.binding.accepted' }, '/type', 'enum');
reject('SDK-NEW-MODULE-IDENTITY-UNSUPPORTED', { ...original, identity: { ...original.identity, moduleId: 'api' } }, '/identity', 'additionalProperties');
reject('SDK-TOPLEVEL-BINDING-UNSUPPORTED', { ...original, binding: { moduleId: 'api' } }, '', 'additionalProperties');
reject('SDK-INNER-SEQUENCE-ZERO', { ...original, sequence: 0 }, '/sequence', 'minimum');
accept('SDK-GENERIC-PAYLOAD-NOT-TYPED-BINDING', { ...original, payload: { binding: { unverified: true } } },
  'Generic payload acceptance does not validate owner/generation/membership/grant/quota or provide a module-binding event.');
console.log(JSON.stringify({ scope: 'actual existing SDK contract validator with synthetic JSON fixtures only', observations,
  limits: ['No new event/SDK/snapshot schema implemented', 'No Runner/FileJournal/observer/activation/recovery execution claimed',
    'Typed module carrier, versioned reader migration, task partition and metadata accounting remain open'] }, null, 2));
