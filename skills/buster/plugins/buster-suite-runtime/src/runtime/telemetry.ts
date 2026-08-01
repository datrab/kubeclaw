export function requireTelemetryStreamMaxLen(
  value: unknown,
  label = 'config.telemetry.stream_max_len',
): number {
  if (!Number.isInteger(value) || Number(value) < 1) {
    throw new TypeError(`${label}: required positive integer in swarm.config.json`);
  }
  return Number(value);
}

export function requireTelemetryStreamMaxLenFromConfig(
  config: Record<string, any> = {},
): number {
  return requireTelemetryStreamMaxLen(config.telemetry?.stream_max_len);
}
