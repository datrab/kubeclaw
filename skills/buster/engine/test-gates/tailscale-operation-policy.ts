import type { TailscaleExposureCapabilityInvokerOptions } from './tailscale-exposure-runtime.ts';

const MAX_TIMER_MS = 2_147_483_647;

export function validateTailscaleOperationPolicy(options: TailscaleExposureCapabilityInvokerOptions): void {
    if (!Number.isSafeInteger(options.shortCommandTimeoutMs) || options.shortCommandTimeoutMs < 1
      || options.shortCommandTimeoutMs > MAX_TIMER_MS || !Number.isSafeInteger(options.maximumCommandOutputBytes)
      || options.maximumCommandOutputBytes < 1 || !Number.isSafeInteger(options.pollIntervalMs)
      || options.pollIntervalMs < 10 || options.pollIntervalMs > options.maximumExecutionMs) {
      throw new Error('TAILSCALE_EXPOSURE_OPERATION_POLICY_INVALID');
    }
}
