import { closeTelemetryStreamRedis } from '../telemetry-stream.ts';

/**
 * Close the telemetry Redis connection gracefully.
 * Non-blocking — logs but does not throw on failure.
 * Safe to call even if Redis was never connected.
 */
async function closeTelemetryRedis() {
  await closeTelemetryStreamRedis();
}

export { closeTelemetryRedis };
