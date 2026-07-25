import { cloneSerializable } from "../serialization.ts";
import {
  createDefaultLifecycleReadModels,
  recomputeProgression,
} from "./read-model-core.ts";
import { numberValue, objectRecord } from "./projection-support.ts";
import { applyWaitEventToReadModels } from "./projection-wait.ts";
import { applyResumeSignalToReadModels } from "./projection-resume.ts";
import { applyCooldownEventToReadModels } from "./projection-cooldown.ts";
import { applyGateCompletionEventToReadModels } from "./projection-gate.ts";
import { applyPipelineEvent } from "./projection-pipeline.ts";
import { applyRecoveryEvent } from "./projection-recovery.ts";
import { applyModuleEvent } from "./projection-module.ts";
import { applyAttemptEvent } from "./projection-attempt.ts";

export { deriveApprovalResolutionFromState } from "./projection-support.ts";

const WAIT_EVENTS = new Set(["wait.opened", "wait.closed"]);
const COOLDOWN_EVENTS = new Set([
  "rate_limit.cooldown_started",
  "rate_limit.cooldown_completed",
]);
const GATE_EVENTS = new Set([
  "gate_evaluation.passed",
  "gate_evaluation.failed",
  "gate_evaluation.blocked",
]);

function initializeReadModels(readModels: any, event: any): any {
  const cloned = objectRecord(cloneSerializable(readModels));
  const next =
    cloned ??
    createDefaultLifecycleReadModels({ _runId: event?.refs?.run_id ?? null });
  next.last_event_id = event.event_id;
  next.last_event_type = event.type;
  next.event_count = numberValue(next.event_count, 0) + 1;
  next.lifecycle_version = "pipeline_lifecycle.v1";
  return next;
}

function applyTypedEvent(next: any, event: any): void {
  applyPipelineEvent(next, event);
  if (WAIT_EVENTS.has(event.type)) applyWaitEventToReadModels(next, event);
  if (event.type === "resume_signal.received")
    applyResumeSignalToReadModels(next, event);
  if (COOLDOWN_EVENTS.has(event.type))
    applyCooldownEventToReadModels(next, event);
  if (GATE_EVENTS.has(event.type))
    applyGateCompletionEventToReadModels(next, event);
  applyRecoveryEvent(next, event);
  applyModuleEvent(next, event);
  applyAttemptEvent(next, event);
}

export function applyLifecycleEventToReadModels(
  readModels: any,
  event: any,
): any {
  const next = initializeReadModels(readModels, event);
  applyTypedEvent(next, event);
  recomputeProgression(next);
  return next;
}
