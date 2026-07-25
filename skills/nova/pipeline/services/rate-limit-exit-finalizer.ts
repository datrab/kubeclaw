import { log } from "../core/logger.ts";
import { appendDurableOperatorAlert } from "./telemetry.ts";
import { selectPresentValue } from "../value-boundary.ts";
import { buildSessionRateLimitExitResult } from "./rate-limit-exit-builders.ts";

function errorMessage(error: any) {
  return typeof error?.message === "string" && error.message.trim()
    ? error.message
    : String(error);
}

function nullable(value: any) {
  return value ?? null;
}

function legacyIdentity(primary: any, legacy: any) {
  return primary ? primary : legacy || null;
}

export function buildRateLimitOperatorAlertPayload(
  exit: any = {},
  reason: any = "rate_limit_exhausted",
  overrides: any = {},
) {
  return {
    module_id: legacyIdentity(exit.module_id, exit.module),
    gate_id: legacyIdentity(exit.gate_id, exit.gate),
    gate_type: exit.gate_type || null,
    attempt: nullable(exit.attempt),
    dispatch_id: exit.dispatch_id || null,
    gateway_label: exit.gateway_label || null,
    session_key: exit.session_key || null,
    terminal_status: "rate_limited",
    reason: selectPresentValue(exit.reason, reason),
    rate_limit_exhausted: true,
    max_rate_limit_pauses: nullable(exit.max_rate_limit_pauses),
    rate_limit_pauses: nullable(exit.rate_limit_pauses),
    rate_limit_status: exit.rate_limit_status || null,
    ...overrides,
  };
}

function appendDeliveryFailure(
  config: any,
  exit: any,
  reason: any,
  hookName: string,
  error: any,
) {
  if (!config) return;
  try {
    appendDurableOperatorAlert(
      config,
      "pipeline.operator_alert",
      buildRateLimitOperatorAlertPayload(exit, reason, {
        reason: "rate_limit_exhaustion_delivery_failed",
        failed_hook: hookName,
        error: errorMessage(error),
        original_reason: selectPresentValue(exit.reason, reason),
      }),
      {
        severity: "WARN",
        source: "rate_limit",
        emitter: "nova/pipeline/services/rate-limit-exit",
      },
    );
  } catch (alertError: any) {
    log(
      "WARN",
      `Rate-limit exhaustion ${hookName} delivery-failure alert write failed: ${errorMessage(alertError)}`,
    );
  }
}

async function runHook(
  config: any,
  exit: any,
  reason: any,
  hookName: string,
  hook: any,
) {
  if (typeof hook !== "function") return;
  try {
    await hook(exit);
  } catch (error: any) {
    appendDeliveryFailure(config, exit, reason, hookName, error);
    log(
      "WARN",
      `Rate-limit exhaustion ${hookName} hook failed after durable local evidence was written: ${errorMessage(error)}`,
    );
  }
}

export async function finalizeSessionRateLimitExhaustion(
  result: any = {},
  options: any = {},
) {
  const reason = options.reason ?? "rate_limit_exhausted";
  const exit = buildSessionRateLimitExitResult(result, reason, options);
  if (options.config) {
    appendDurableOperatorAlert(
      options.config,
      "pipeline.operator_alert",
      buildRateLimitOperatorAlertPayload(exit, reason),
      {
        severity: "CRITICAL",
        source: "rate_limit",
        emitter: "nova/pipeline/services/rate-limit-exit",
      },
    );
  }
  await runHook(
    options.config,
    exit,
    reason,
    "beforeReturn",
    options.beforeReturn,
  );
  await runHook(
    options.config,
    exit,
    reason,
    "emitRetryExhausted",
    options.emitRetryExhausted,
  );
  await runHook(
    options.config,
    exit,
    reason,
    "emitSummaryCompleted",
    options.emitSummaryCompleted,
  );
  await runHook(
    options.config,
    exit,
    reason,
    "sendDiscord",
    options.sendDiscord,
  );
  const message =
    typeof options.logMessage === "function"
      ? options.logMessage(exit)
      : options.logMessage;
  if (message) log(options.logLevel ?? "WARN", message);
  return exit;
}

export function appendInvalidRateLimitCooldownResumeAtAlert(
  config: any,
  step: any = {},
  cooldown: any = {},
  resumeAt: any = null,
) {
  appendDurableOperatorAlert(
    config,
    "pipeline.operator_alert",
    {
      module_id: step.type === "module" ? step.id : null,
      gate_id: step.type === "gate" ? step.id : null,
      gate_type: cooldown.gate_type || null,
      attempt: cooldown.attempt ?? null,
      dispatch_id: cooldown.dispatch_id || null,
      gateway_label: cooldown.gateway_label || null,
      session_key: cooldown.session_key || null,
      reason: "invalid_rate_limit_cooldown_resume_at",
      resume_at: resumeAt ?? null,
      step_type: step.type || null,
    },
    {
      severity: "WARN",
      source: "rate_limit",
      emitter: "nova/pipeline/services/rate-limit-exit",
    },
  );
}
