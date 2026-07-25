import {
  selectDefinedValue,
  selectTruthyValue,
} from "../../optional-absence.ts";
import {
  cooldownIdentity,
  normalizedSignalKind,
  numericValue,
  objectRecord,
  referencedState,
  textValue,
  type RecordValue,
} from "./legality-values.ts";

type LegalityContext = {
  type: string;
  proposal: RecordValue;
  refs: RecordValue;
  waitState: RecordValue | null;
  gateState: RecordValue | null;
  cooldownKey: string | null;
  cooldownState: RecordValue | null;
  pipelineState: RecordValue | null;
  moduleState: RecordValue | null;
};
type LegalityHandler = (context: LegalityContext) => void;

const APPROVAL_SIGNAL_KINDS = new Set([
  "approve",
  "reject",
  "cancel",
  "timeout_continue",
  "timeout_block",
]);
const FIRST_ATTEMPT = 1;
const ZERO_ATTEMPT = 0;

function buildLegalityContext(
  readModels: RecordValue,
  proposal: RecordValue,
): LegalityContext {
  const refs = objectRecord(proposal.refs);
  const waitState = referencedState(readModels.waits?.by_ref, refs.wait_ref);
  const gateState = referencedState(readModels.gates, refs.gate_id);
  const cooldown = cooldownIdentity(refs);
  return {
    type: String(proposal.type ?? ""),
    proposal,
    refs,
    waitState,
    gateState,
    cooldownKey: cooldown.key,
    cooldownState: referencedState(
      readModels.cooldowns?.[cooldown.scope ?? ""],
      cooldown.key,
    ),
    pipelineState: readModels.pipeline ?? null,
    moduleState: referencedState(readModels.modules, refs.module_id),
  };
}

function validatePipelineStarted({
  pipelineState,
  refs,
}: LegalityContext): void {
  if (pipelineState?.status && pipelineState.run_id === refs.run_id) {
    throw new Error(
      `Illegal lifecycle append: pipeline run '${refs.run_id}' already started`,
    );
  }
}

function validatePipelineTerminal({
  pipelineState,
  refs,
}: LegalityContext): void {
  if (!pipelineState || pipelineState.run_id !== refs.run_id) {
    throw new Error(
      `Illegal lifecycle append: pipeline run '${refs.run_id}' has not started`,
    );
  }
  if (["COMPLETED", "HALTED"].includes(pipelineState.status)) {
    throw new Error(
      `Illegal lifecycle append: pipeline run '${refs.run_id}' is already terminal`,
    );
  }
}

function validateCheckpoint({ proposal }: LegalityContext): void {
  if (!proposal.data?.point)
    throw new Error(
      "Illegal lifecycle append: pipeline.checkpoint requires point",
    );
}

function validateWaitOpened({
  refs,
  waitState,
  gateState,
}: LegalityContext): void {
  if (!refs.wait_ref)
    throw new Error("Illegal lifecycle append: wait.opened requires wait_ref");
  if (waitState?.state === "OPEN")
    throw new Error(
      `Illegal lifecycle append: wait '${refs.wait_ref}' is already open`,
    );
  if (gateState?.wait_status === "OPEN")
    throw new Error(
      `Illegal lifecycle append: gate '${refs.gate_id}' already has an open wait`,
    );
  const requestedAttempt = numericValue(refs.attempt, FIRST_ATTEMPT);
  const currentAttempt = numericValue(gateState?.attempt, ZERO_ATTEMPT);
  if (
    gateState?.wait_status === "CLOSED" &&
    gateState.status &&
    requestedAttempt <= currentAttempt
  ) {
    throw new Error(
      `Illegal lifecycle append: gate '${refs.gate_id}' already resolved its wait`,
    );
  }
}

function validateResumeSignal(context: LegalityContext): void {
  const { proposal, refs, waitState } = context;
  if (!refs.resume_signal_ref)
    throw new Error(
      "Illegal lifecycle append: resume_signal.received requires resume_signal_ref",
    );
  if (!waitState || waitState.state !== "OPEN") {
    throw new Error(
      `Illegal lifecycle append: signal '${refs.resume_signal_ref}' has no open wait`,
    );
  }
  const gateType = (
    selectDefinedValue(
      () => textValue(refs.gate_type),
      () => "",
    ) ?? ""
  ).toLowerCase();
  const signalKind = normalizedSignalKind(proposal, refs);
  if (gateType === "approval" && !APPROVAL_SIGNAL_KINDS.has(signalKind)) {
    const kind = selectTruthyValue(
      () => signalKind,
      () => "missing_signal_kind",
    );
    throw new Error(
      `Illegal lifecycle append: approval signal '${kind}' is unsupported`,
    );
  }
}

function validateWaitClosed({
  proposal,
  refs,
  waitState,
}: LegalityContext): void {
  if (!waitState || waitState.state !== "OPEN") {
    throw new Error(
      `Illegal lifecycle append: wait '${refs.wait_ref ?? "missing_wait_ref"}' is not open`,
    );
  }
  if (!proposal.data?.close_reason) {
    throw new Error(
      `Illegal lifecycle append: wait '${refs.wait_ref}' close_reason is required`,
    );
  }
}

function validateCooldownStarted({
  cooldownState,
  cooldownKey,
}: LegalityContext): void {
  if (cooldownState?.open)
    throw new Error(
      `Illegal lifecycle append: cooldown already open for '${cooldownKey}'`,
    );
}

function validateCooldownCompleted({
  cooldownState,
  cooldownKey,
}: LegalityContext): void {
  if (!cooldownState?.open)
    throw new Error(
      `Illegal lifecycle append: cooldown is not open for '${cooldownKey}'`,
    );
}

function validateStaleRecovery({ proposal, refs }: LegalityContext): void {
  if (!refs.module_id && !refs.gate_id) {
    throw new Error(
      "Illegal lifecycle append: recovery.stale_reset requires module_id or gate_id",
    );
  }
  if (!proposal.data?.recovery_action)
    throw new Error(
      "Illegal lifecycle append: recovery.stale_reset requires recovery_action",
    );
  if (!proposal.data?.reason)
    throw new Error(
      "Illegal lifecycle append: recovery.stale_reset requires reason",
    );
}

function validateReadyForTesting({ refs, moduleState }: LegalityContext): void {
  const requestedAttempt = numericValue(refs.attempt, ZERO_ATTEMPT);
  if (!moduleState) {
    if (requestedAttempt !== FIRST_ATTEMPT) {
      throw new Error(
        `Illegal lifecycle append: module '${refs.module_id}' cannot open attempt ${refs.attempt} at READY_FOR_TESTING`,
      );
    }
    return;
  }
  const currentAttempt = numericValue(
    moduleState.current_attempt,
    ZERO_ATTEMPT,
  );
  if (requestedAttempt === currentAttempt) return;
  const canAdvance =
    requestedAttempt === currentAttempt + 1 &&
    ["FAIL", "BLOCKED", "READY_FOR_TESTING"].includes(moduleState.status);
  if (!canAdvance) {
    throw new Error(
      `Illegal lifecycle append: module '${refs.module_id}' attempt mismatch (${refs.attempt} != ${moduleState.current_attempt})`,
    );
  }
}

function validateModuleEvent(context: LegalityContext): void {
  const { type, refs, moduleState } = context;
  if (!refs.module_id) return;
  if (type === "module_attempt.started") {
    if (
      moduleState?.status &&
      moduleState.status !== "PASS" &&
      moduleState.current_attempt === refs.attempt &&
      moduleState.latest_event_type === type
    ) {
      throw new Error(
        `Illegal lifecycle append: module '${refs.module_id}' attempt ${refs.attempt} already started`,
      );
    }
    return;
  }
  if (type === "module_attempt.ready_for_testing")
    return validateReadyForTesting(context);
  if (!moduleState)
    throw new Error(
      `Illegal lifecycle append: module '${refs.module_id}' has no open attempt for ${type}`,
    );
  const currentAttempt = numericValue(
    moduleState.current_attempt,
    ZERO_ATTEMPT,
  );
  const requestedAttempt = numericValue(refs.attempt, ZERO_ATTEMPT);
  const bridge =
    requestedAttempt === currentAttempt + 1 &&
    ["FAIL", "BLOCKED", "READY_FOR_TESTING"].includes(moduleState.status);
  if (
    !bridge &&
    moduleState.current_attempt != null &&
    refs.attempt != null &&
    currentAttempt !== requestedAttempt
  ) {
    throw new Error(
      `Illegal lifecycle append: module '${refs.module_id}' attempt mismatch (${refs.attempt} != ${moduleState.current_attempt})`,
    );
  }
}

const EVENT_VALIDATORS: Record<string, LegalityHandler> = {
  "pipeline_run.started": validatePipelineStarted,
  "pipeline_run.completed": validatePipelineTerminal,
  "pipeline_run.halted": validatePipelineTerminal,
  "pipeline.checkpoint": validateCheckpoint,
  "wait.opened": validateWaitOpened,
  "resume_signal.received": validateResumeSignal,
  "wait.closed": validateWaitClosed,
  "rate_limit.cooldown_started": validateCooldownStarted,
  "rate_limit.cooldown_completed": validateCooldownCompleted,
  "recovery.stale_reset": validateStaleRecovery,
};

export function ensureLifecycleEventLegal(
  _config: any,
  readModels: RecordValue,
  proposal: RecordValue,
): void {
  const context = buildLegalityContext(readModels, proposal);
  const validator = EVENT_VALIDATORS[context.type];
  if (validator) validator(context);
  else validateModuleEvent(context);
}
