const PROVIDER_RESET_SAFETY_BUFFER_MS = 2 * 60 * 1000;
import { MONTH_INDEX_BY_LABEL } from "./rate-limit-months.ts";
function finiteNumberOrNull(value: any) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}
function validDateMsOrNull(value: any) {
  if (typeof value !== "string" || !value.trim()) return null;
  const milliseconds = new Date(value.trim()).getTime();
  return Number.isFinite(milliseconds) ? milliseconds : null;
}
function providerResetBufferMs(bufferMs: any) {
  return Math.max(
    PROVIDER_RESET_SAFETY_BUFFER_MS,
    finiteNumberOrNull(bufferMs) ?? 0,
  );
}
function candidateWithinWindow(candidateMs: number, nowMs: number) {
  if (!Number.isFinite(candidateMs)) return null;
  const deltaMs = candidateMs - nowMs;
  return deltaMs >= -60_000 && deltaMs <= 7 * 24 * 60 * 60 * 1000
    ? candidateMs
    : null;
}
function parseMonthDayUtcTimestamp(text: any, nowMs: number) {
  const match = String(text ?? "").match(
    /\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t|tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{1,2})(?:,)?\s+(?:at\s+)?(\d{1,2}):(\d{2})\s*(AM|PM)\s*UTC\b/i,
  );
  if (!match) return null;
  const monthIndex = MONTH_INDEX_BY_LABEL[String(match[1]).toLowerCase()];
  const day = Number(match[2]),
    hour12 = Number(match[3]),
    minute = Number(match[4]);
  if (
    monthIndex === undefined ||
    day < 1 ||
    day > 31 ||
    hour12 < 1 ||
    hour12 > 12 ||
    minute < 0 ||
    minute > 59
  )
    return null;
  const hour24 =
    (hour12 % 12) + (String(match[5]).toUpperCase() === "PM" ? 12 : 0);
  const year = new Date(nowMs).getUTCFullYear();
  return (
    candidateWithinWindow(
      Date.UTC(year, monthIndex, day, hour24, minute),
      nowMs,
    ) ??
    candidateWithinWindow(
      Date.UTC(year + 1, monthIndex, day, hour24, minute),
      nowMs,
    )
  );
}
function readFirstValue(source: any, keys: string[]) {
  for (const key of keys) {
    const value = source?.[key];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return null;
}
function hasProviderCooldownCommentary(value: any) {
  if (typeof value !== "string") return false;
  const normalized = value.trim().toLowerCase();
  if (
    !normalized ||
    [
      "rate_limited",
      "rate limit",
      "rate_limited_status",
      "rate-limit",
    ].includes(normalized)
  )
    return false;
  return ["limit", "quota", "reset", "retry", "provider"].some((word) =>
    normalized.includes(word),
  );
}
function hasRateLimitCooldownEvidence(status: any) {
  const direct = [
    "detail",
    "error_message",
    "reason",
    "rate_limit_reason",
    "transcript_detail",
    "lastDetail",
    "lastSummary",
  ].map((key) => status?.[key]);
  return [
    ...direct,
    status?.agent_ended?.error_message,
    status?.transcript?.lastDetail,
    status?.transcript?.lastSummary,
  ].some(hasProviderCooldownCommentary);
}
function durationFactor(unit: string) {
  const normalized = unit.toLowerCase();
  if (normalized.startsWith("ms") || normalized.startsWith("millisecond"))
    return 1;
  if (normalized.startsWith("m")) return 60_000;
  if (normalized.startsWith("h")) return 3_600_000;
  return 1000;
}
function parseDurationSeconds(text: any) {
  const matches = [
    ...String(text ?? "").matchAll(
      /(\d+(?:\.\d+)?)\s*(milliseconds?|ms|seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h)\b/gi,
    ),
  ];
  if (matches.length === 0) return null;
  const durationMs = matches.reduce((sum, match) => {
    const amount = Number(match[1]);
    return Number.isFinite(amount) && amount >= 0
      ? sum + amount * durationFactor(String(match[2]))
      : sum;
  }, 0);
  return durationMs > 0 ? Math.ceil(durationMs / 1000) : null;
}
function extractTextCooldown(text: string, nowMs: number): any {
  if (!text.trim()) return {};
  const humanResetAtMs = parseMonthDayUtcTimestamp(text, nowMs);
  if (humanResetAtMs != null)
    return {
      resumeAtMs: humanResetAtMs,
      source: "provider_status_reset_at_text",
      detail: "Provider status exposed human reset timestamp",
    };
  const timestamp = text.match(
    /\b(?:resume|resumes|reset|resets|retry|try again)(?:\s+(?:at|after|on))?[:\s]+(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)\b/i,
  );
  if (timestamp)
    return {
      resumeAtMs: validDateMsOrNull(timestamp[1]),
      source: "provider_status_resume_at",
      detail: "Provider status exposed reset timestamp",
    };
  const retry = text.match(
    /\b(?:retry[-\s]?after|try again in|resume in|next reset in|reset in|resets in)\s*:?\s*((?:\d+(?:\.\d+)?\s*(?:milliseconds?|ms|seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h)\b[\s,]*)+)/i,
  );
  const seconds = parseDurationSeconds(retry?.[1]);
  return seconds == null
    ? {}
    : {
        retryAfterSeconds: seconds,
        source: "provider_status_retry_after",
        detail: "Provider status exposed retry-after duration",
      };
}
function cooldownFromResumeAt(status: any, nowMs: number, bufferMs: number) {
  const value = readFirstValue(status, [
    "resume_at",
    "resumeAt",
    "reset_at",
    "resetAt",
    "rate_limit_reset_at",
    "rateLimitResetAt",
    "cooldown_resume_at",
    "cooldownResumeAt",
  ]);
  const directMs = validDateMsOrNull(value);
  if (directMs == null) return null;
  const resumeAtMs =
    Math.max(nowMs, directMs) + providerResetBufferMs(bufferMs);
  return {
    cooldownMs: Math.max(0, resumeAtMs - nowMs),
    resumeAt: new Date(resumeAtMs),
    cooldownSource: "provider_status_resume_at",
    cooldownSourceDetail: "Provider/status supplied cooldown reset time",
    retryAfterSeconds: Math.max(0, Math.ceil((directMs - nowMs) / 1000)),
    cooldownBufferMs: bufferMs,
  };
}
function cooldownFromRetry(status: any, nowMs: number, bufferMs: number) {
  const seconds = finiteNumberOrNull(
    readFirstValue(status, [
      "retry_after_seconds",
      "retryAfterSeconds",
      "retry_after",
      "retryAfter",
    ]),
  );
  if (seconds == null) return null;
  const cooldownMs = Math.ceil(seconds * 1000) + bufferMs;
  return {
    cooldownMs,
    resumeAt: new Date(nowMs + cooldownMs),
    cooldownSource: "provider_status_retry_after",
    cooldownSourceDetail: "Provider/status supplied retry-after duration",
    retryAfterSeconds: seconds,
    cooldownBufferMs: bufferMs,
  };
}
function statusText(status: any) {
  return [
    status?.detail,
    status?.error_message,
    status?.reason,
    status?.rate_limit_reason,
    status?.transcript_detail,
    status?.lastDetail,
    status?.lastSummary,
    status?.agent_ended?.error_message,
    status?.transcript?.lastDetail,
    status?.transcript?.lastSummary,
  ]
    .filter(Boolean)
    .join("\n");
}
function cooldownFromText(status: any, nowMs: number, bufferMs: number) {
  const parsed = extractTextCooldown(statusText(status), nowMs);
  if (parsed.resumeAtMs != null) {
    const resumeAtMs =
      Math.max(nowMs, parsed.resumeAtMs) + providerResetBufferMs(bufferMs);
    return {
      cooldownMs: Math.max(0, resumeAtMs - nowMs),
      resumeAt: new Date(resumeAtMs),
      cooldownSource: parsed.source,
      cooldownSourceDetail: parsed.detail,
      retryAfterSeconds: Math.max(
        0,
        Math.ceil((parsed.resumeAtMs - nowMs) / 1000),
      ),
      cooldownBufferMs: bufferMs,
    };
  }
  if (parsed.retryAfterSeconds == null) return null;
  const cooldownMs = Math.ceil(parsed.retryAfterSeconds * 1000) + bufferMs;
  return {
    cooldownMs,
    resumeAt: new Date(nowMs + cooldownMs),
    cooldownSource: parsed.source,
    cooldownSourceDetail: parsed.detail,
    retryAfterSeconds: parsed.retryAfterSeconds,
    cooldownBufferMs: bufferMs,
  };
}
function configuredCooldown(
  status: any,
  config: any,
  nowMs: number,
  bufferMs: number,
) {
  if (!hasRateLimitCooldownEvidence(status))
    throw new Error(
      "rate limit status did not include reset metadata or provider detail",
    );
  const hours = finiteNumberOrNull(config.cooldown_hours);
  if (hours == null)
    throw new Error(
      "rate_limit.cooldown_hours must be configured when provider cooldown metadata is unavailable",
    );
  const cooldownMs = Math.ceil(hours * 60 * 60 * 1000) + bufferMs;
  return {
    cooldownMs,
    resumeAt: new Date(nowMs + cooldownMs),
    cooldownSource: "config",
    cooldownSourceDetail: `Provider did not expose a usable reset time; using configured rate_limit.cooldown_hours=${hours}`,
    retryAfterSeconds: Math.round(cooldownMs / 1000),
    cooldownHours: hours,
    cooldownBufferMs: bufferMs,
  };
}
export function resolveRateLimitCooldown(
  status: any = {},
  rateLimitConfig: any = {},
  options: any = {},
) {
  const nowMs = Number.isFinite(options.nowMs)
    ? Number(options.nowMs)
    : Date.now();
  const bufferMs = finiteNumberOrNull(rateLimitConfig.cooldown_buffer_ms) ?? 0;
  for (const resolve of [
    cooldownFromResumeAt,
    cooldownFromRetry,
    cooldownFromText,
  ]) {
    const cooldown = resolve(status, nowMs, bufferMs);
    if (cooldown) return cooldown;
  }
  return configuredCooldown(status, rateLimitConfig, nowMs, bufferMs);
}
