import { log } from "../core/logger.ts";
import { sleep } from "../timing.ts";
import { selectPresentValue } from "../value-boundary.ts";
import {
  appendCooldownLifecycleEvent,
  getLifecycleCooldown,
} from "./status-store.ts";
import { appendInvalidRateLimitCooldownResumeAtAlert } from "./rate-limit-exit.ts";
import { syncModuleRateLimitResume } from "./rate-limit-module-recovery.ts";

const RESUME_DETAIL = "Resumed after durable cooldown replay";

function cooldownResumeTime(cooldown: any) {
  if (typeof cooldown.resume_at !== "string" || !cooldown.resume_at.trim())
    return NaN;
  return new Date(cooldown.resume_at).getTime();
}

async function waitForCooldown(state: any) {
  const remaining = Math.max(0, state.resumeAtMs - Date.now());
  if (remaining <= 0) return;
  log(
    "WARN",
    `[cooldown-resume] ${state.step.type} ${state.step.id} is still cooling down for ${Math.ceil(remaining / 1000)}s`,
  );
  state.budget?.extendForRateLimit?.(remaining, {
    bufferMs: state.cooldownBufferMs,
    reason: "authorized_rate_limit_cooldown",
  });
  await state.sleepFn(
    remaining,
    state.budget ? { budget: state.budget } : undefined,
  );
}

async function resumeModuleCooldown(
  config: any,
  progress: any,
  step: any,
  cooldown: any,
) {
  if (step.type !== "module") return;
  const moduleDir = progress?.modules?.[step.id]?.dir;
  if (!moduleDir) return;
  const phase = cooldown.agent_type || null;
  await syncModuleRateLimitResume(
    config,
    moduleDir,
    {
      module_id: step.id,
      current_phase: phase,
    },
    { moduleId: step.id, phase },
  );
}

function completeCooldownLifecycle(config: any, step: any, cooldown: any) {
  appendCooldownLifecycleEvent(config, "rate_limit.cooldown_completed", {
    moduleId: step.type === "module" ? step.id : null,
    gateId: step.type === "gate" ? step.id : null,
    gateType: cooldown.gate_type || null,
    attempt: cooldown.attempt ?? null,
    pauseCount: cooldown.pause_count ?? null,
    maxPauses: cooldown.max_pauses ?? null,
    resumedAt: new Date().toISOString(),
    detail: selectPresentValue(cooldown.detail, RESUME_DETAIL),
  });
}

export async function resumeDurableCooldownForStep(
  config: any,
  progress: any,
  step: any,
  options: any = {},
) {
  if (!step?.type || !step?.id) return { resumed: false, cooldown: null };
  const cooldown = getLifecycleCooldown(config, {
    stepType: step.type,
    stepId: step.id,
  });
  if (!cooldown?.open) return { resumed: false, cooldown: cooldown || null };
  const resumeAtMs = cooldownResumeTime(cooldown);
  if (!Number.isFinite(resumeAtMs)) {
    appendInvalidRateLimitCooldownResumeAtAlert(
      config,
      step,
      cooldown,
      cooldown.resume_at,
    );
    log(
      "WARN",
      `[cooldown-resume] ${step.type} ${step.id} has invalid cooldown resume_at '${cooldown.resume_at}', leaving cooldown open`,
    );
    return {
      resumed: false,
      cooldown,
      error: "invalid_rate_limit_cooldown_resume_at",
    };
  }
  await waitForCooldown({
    step,
    resumeAtMs,
    budget: options.budget ?? null,
    cooldownBufferMs:
      options.cooldownBufferMs ?? config?.rate_limit?.cooldown_buffer_ms,
    sleepFn: options.sleepFn ?? sleep,
  });
  await resumeModuleCooldown(config, progress, step, cooldown);
  completeCooldownLifecycle(config, step, cooldown);
  log(
    "OK",
    `[cooldown-resume] ${step.type} ${step.id} cooldown complete, resuming work`,
  );
  return {
    resumed: true,
    cooldown: getLifecycleCooldown(config, {
      stepType: step.type,
      stepId: step.id,
    }),
  };
}
