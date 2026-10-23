// Verbatim inspected arithmetic/string-only host helpers. Host parser definition only, not CLI invocation.
const MAX_TIMER_TIMEOUT_MS=2147000000; const NO_GATEWAY_TIMEOUT_MS=2147000000;
function normalizeNullableString(value) {
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	return trimmed ? trimmed : null;
}

function normalizeOptionalString(value) {
	return normalizeNullableString(value) ?? void 0;
}

function asFiniteNumber(value) {
	return typeof value === "number" && Number.isFinite(value) ? value : void 0;
}

function parseStrictInteger(value) {
	if (typeof value === "number") return Number.isSafeInteger(value) ? value : void 0;
	const normalized = normalizeOptionalString(value);
	if (!normalized || !/^[+-]?\d+$/.test(normalized)) return;
	const parsed = Number(normalized);
	return Number.isSafeInteger(parsed) ? parsed : void 0;
}

function parseStrictNonNegativeInteger(value) {
	const parsed = parseStrictInteger(value);
	return parsed !== void 0 && parsed >= 0 ? parsed : void 0;
}

function resolveTimerTimeoutMs(valueMs, fallbackMs, minMs = 1) {
	const value = asFiniteNumber(valueMs) ?? asFiniteNumber(fallbackMs);
	const min = Math.max(0, Math.floor(minMs));
	if (value === void 0) return min;
	return Math.min(Math.max(Math.floor(value), min), MAX_TIMER_TIMEOUT_MS);
}

function parseTimeoutSeconds(opts) {
	const raw = opts.timeout !== void 0 ? parseStrictNonNegativeInteger(opts.timeout) : opts.cfg.agents?.defaults?.timeoutSeconds ?? 600;
	if (raw === void 0) throw new Error(`Invalid --timeout. Use seconds as a non-negative integer, for example --timeout 600. Use --timeout 0 to disable the timeout.`);
	return raw;
}

function resolveGatewayAgentTimeoutMs(timeoutSeconds) {
	if (timeoutSeconds === 0) return NO_GATEWAY_TIMEOUT_MS;
	return resolveTimerTimeoutMs((timeoutSeconds + 30) * 1e3, 1e4, 1e4);
}
export {parseTimeoutSeconds,resolveGatewayAgentTimeoutMs};
