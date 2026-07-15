// services/status-store-lifecycle.ts — canonical lifecycle event log + read models

import {
  loadLifecycleReadModels as loadLifecycleReadModelsImpl,
  readLifecycleEvents as readLifecycleEventsImpl,
  rebuildLifecycleReadModels as rebuildLifecycleReadModelsImpl,
  recomputeProgression as recomputeProgressionImpl,
  saveLifecycleReadModels as saveLifecycleReadModelsImpl,
} from './status-store-lifecycle/read-models.ts';
import {
  appendCooldownLifecycleEvent as appendCooldownLifecycleEventImpl,
  appendLifecycleEvent as appendLifecycleEventImpl,
  appendModuleLifecycleEvent as appendModuleLifecycleEventImpl,
  appendPipelineLifecycleEvent as appendPipelineLifecycleEventImpl,
  appendStaleRecoveryLifecycleEvent as appendStaleRecoveryLifecycleEventImpl,
  appendWaitLifecycleEvent as appendWaitLifecycleEventImpl,
  applyGateCompletion as applyGateCompletionImpl,
  applyModuleCompletion as applyModuleCompletionImpl,
  getLifecycleCooldown as getLifecycleCooldownImpl,
  getLifecycleGateState as getLifecycleGateStateImpl,
  getLifecycleModuleState as getLifecycleModuleStateImpl,
  resetLifecycleStore as resetLifecycleStoreImpl,
} from './status-store-lifecycle/appenders.ts';
import { cloneSerializable as cloneSerializableValue } from './serialization.ts';

export {
  buildGateEvaluationRefs,
  buildModuleAttemptRefs,
  buildResumeSignalRefs,
  getActiveProgress,
  resolveModuleConfig,
} from './status-store-lifecycle/refs.ts';

export { deriveApprovalResolutionFromState } from './status-store-lifecycle/projections.ts';

export function loadLifecycleReadModels(config) {
  return loadLifecycleReadModelsImpl(config);
}

export function saveLifecycleReadModels(config, readModels) {
  return saveLifecycleReadModelsImpl(config, readModels);
}

export function readLifecycleEvents(config) {
  return readLifecycleEventsImpl(config);
}

export function rebuildLifecycleReadModels(config, events = readLifecycleEventsImpl(config)) {
  return rebuildLifecycleReadModelsImpl(config, events);
}

export function recomputeProgression(readModels) {
  return recomputeProgressionImpl(readModels);
}

export function cloneSerializable(value) {
  return cloneSerializableValue(value);
}

export function appendLifecycleEvent(config, proposal = {}) {
  return appendLifecycleEventImpl(config, proposal);
}

export function applyModuleCompletion(config, dir, status, completion = {}) {
  return applyModuleCompletionImpl(config, dir, status, completion);
}

export function applyGateCompletion(config, gateId, gate = {}, completion = {}) {
  return applyGateCompletionImpl(config, gateId, gate, completion);
}

export function appendPipelineLifecycleEvent(config, type, opts = {}) {
  return appendPipelineLifecycleEventImpl(config, type, opts);
}

export function appendWaitLifecycleEvent(config, type, opts = {}) {
  return appendWaitLifecycleEventImpl(config, type, opts);
}

export function appendCooldownLifecycleEvent(config, type, opts = {}) {
  return appendCooldownLifecycleEventImpl(config, type, opts);
}

export function appendStaleRecoveryLifecycleEvent(config, opts = {}) {
  return appendStaleRecoveryLifecycleEventImpl(config, opts);
}

export function appendModuleLifecycleEvent(config, dir, status, mutation = {}) {
  return appendModuleLifecycleEventImpl(config, dir, status, mutation);
}

export function getLifecycleGateState(config, gateId) {
  return getLifecycleGateStateImpl(config, gateId);
}

export function getLifecycleModuleState(config, moduleId) {
  return getLifecycleModuleStateImpl(config, moduleId);
}

export function getLifecycleCooldown(config, opts = {}) {
  return getLifecycleCooldownImpl(config, opts);
}

export function resetLifecycleStore(config) {
  return resetLifecycleStoreImpl(config);
}
