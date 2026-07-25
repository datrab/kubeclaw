export * from './rate-limit-builders.ts';
export * from './rate-limit-builders/exhaustion-options.ts';
export * from './rate-limit-exit.ts';
export * from "./rate-limit-handler.ts";
export * from "./rate-limit-processing.ts";
export * from "./rate-limit-module-recovery.ts";
export * from "./rate-limit-durable-cooldown.ts";
export { resolveRateLimitCooldown } from "./rate-limit-cooldown.ts";

export function createRateLimitPauseState(initialCount: any = 0) {
  return { count: initialCount };
}
