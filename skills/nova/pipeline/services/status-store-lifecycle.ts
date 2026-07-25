// services/status-store-lifecycle.ts — canonical lifecycle event log + read models

import {
  loadLifecycleReadModels as loadLifecycleReadModelsImpl,
  readLifecycleEvents as readLifecycleEventsImpl,
  rebuildLifecycleReadModels as rebuildLifecycleReadModelsImpl,
  recomputeProgression as recomputeProgressionImpl,
  saveLifecycleReadModels as saveLifecycleReadModelsImpl,
} from "./status-store-lifecycle/read-models.ts";
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
} from "./status-store-lifecycle/appenders.ts";
import { cloneSerializable as cloneSerializableValue } from "./serialization.ts";

export {
  buildGateEvaluationRefs,
  buildModuleAttemptRefs,
  buildResumeSignalRefs,
  getActiveProgress,
  resolveModuleConfig,
} from "./status-store-lifecycle/refs.ts";

export { deriveApprovalResolutionFromState } from "./status-store-lifecycle/projections.ts";

export function loadLifecycleReadModels(config: any) {
  return loadLifecycleReadModelsImpl(config);
}

export function saveLifecycleReadModels(config: any, readModels: any) {
  return saveLifecycleReadModelsImpl(config, readModels);
}

export function readLifecycleEvents(config: any) {
  return readLifecycleEventsImpl(config);
}

export function rebuildLifecycleReadModels(
  config: any,
  events: any = readLifecycleEventsImpl(config),
) {
  return rebuildLifecycleReadModelsImpl(config, events);
}

function recomputeProgression(readModels: any) {
  return recomputeProgressionImpl(readModels);
}

export function cloneSerializable(value: any) {
  return cloneSerializableValue(value);
}

export function appendLifecycleEvent(config: any, proposal: any = {}) {
  return appendLifecycleEventImpl(config, proposal);
}

export function applyModuleCompletion(
  config: any,
  dir: any,
  status: any,
  completion: any = {},
) {
  return applyModuleCompletionImpl(config, dir, status, completion);
}

export function applyGateCompletion(
  config: any,
  gateId: any,
  gate: any = {},
  completion: any = {},
) {
  return applyGateCompletionImpl(config, gateId, gate, completion);
}

export function appendPipelineLifecycleEvent(
  config: any,
  type: any,
  opts: any = {},
) {
  return appendPipelineLifecycleEventImpl(config, type, opts);
}

export function appendWaitLifecycleEvent(
  config: any,
  type: any,
  opts: any = {},
) {
  return appendWaitLifecycleEventImpl(config, type, opts);
}

export function appendCooldownLifecycleEvent(
  config: any,
  type: any,
  opts: any = {},
) {
  return appendCooldownLifecycleEventImpl(config, type, opts);
}

export function appendStaleRecoveryLifecycleEvent(config: any, opts: any = {}) {
  return appendStaleRecoveryLifecycleEventImpl(config, opts);
}

export function appendModuleLifecycleEvent(
  config: any,
  dir: any,
  status: any,
  mutation: any = {},
) {
  return appendModuleLifecycleEventImpl(config, dir, status, mutation);
}

export function getLifecycleGateState(config: any, gateId: any) {
  return getLifecycleGateStateImpl(config, gateId);
}

export function getLifecycleModuleState(config: any, moduleId: any) {
  return getLifecycleModuleStateImpl(config, moduleId);
}

export function getLifecycleCooldown(config: any, opts: any = {}) {
  return getLifecycleCooldownImpl(config, opts);
}

export function resetLifecycleStore(config: any) {
  return resetLifecycleStoreImpl(config);
}
