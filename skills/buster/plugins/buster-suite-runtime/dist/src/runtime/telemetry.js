export function requireTelemetryStreamMaxLen(value, label = 'config.telemetry.stream_max_len') {
    if (!Number.isInteger(value) || Number(value) < 1) {
        throw new TypeError(`${label}: required positive integer in swarm.config.json`);
    }
    return Number(value);
}
export function requireTelemetryStreamMaxLenFromConfig(config = {}) {
    return requireTelemetryStreamMaxLen(config.telemetry?.stream_max_len);
}
