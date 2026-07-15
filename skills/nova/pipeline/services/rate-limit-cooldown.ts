import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';

const PROVIDER_RESET_SAFETY_BUFFER_MS = 2 * 60 * 1000;
const MONTH_INDEX_BY_LABEL = Object.freeze({
  jan: 0,
  january: 0,
  feb: 1,
  february: 1,
  mar: 2,
  march: 2,
  apr: 3,
  april: 3,
  may: 4,
  jun: 5,
  june: 5,
  jul: 6,
  july: 6,
  aug: 7,
  august: 7,
  sep: 8,
  sept: 8,
  september: 8,
  oct: 9,
  october: 9,
  nov: 10,
  november: 10,
  dec: 11,
  december: 11,
});

function finiteNumberOrNull(value) {
  if (selectTruthyValue(() => (selectTruthyValue(() => (value === null), () => (value === undefined))), () => (value === ''))) return null;
  const num = Number(value);
  return Number.isFinite(num) && num >= 0 ? num : null;
}

function validDateMsOrNull(value) {
  if (selectTruthyValue(() => (typeof value !== 'string'), () => (!value.trim()))) return null;
  const ms = new Date(value.trim()).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function providerResetBufferMs(bufferMs) {
  const normalizedBufferMs = finiteNumberOrNull(bufferMs);
  return Math.max(PROVIDER_RESET_SAFETY_BUFFER_MS, normalizedBufferMs ?? 0);
}

function parseMonthDayUtcTimestamp(text, nowMs) {
  const value = typeof text === 'string' ? text : '';
  if (!value.trim()) return null;
  const match = value.match(/\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t|tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{1,2})(?:,)?\s+(?:at\s+)?(\d{1,2}):(\d{2})\s*(AM|PM)\s*UTC\b/i);
  if (!match) return null;
  const monthIndex = MONTH_INDEX_BY_LABEL[match[1].toLowerCase()];
  const day = Number(match[2]);
  const hour12 = Number(match[3]);
  const minute = Number(match[4]);
  const meridiem = match[5].toUpperCase();
  if (selectTruthyValue(() => (monthIndex === undefined), () => (!Number.isFinite(day)))) return null;
  if (selectTruthyValue(() => (!Number.isFinite(hour12)), () => (!Number.isFinite(minute)))) return null;
  if (day < 1 || day > 31 || hour12 < 1 || hour12 > 12 || minute < 0 || minute > 59) return null;
  const hour24 = (hour12 % 12) + (meridiem === 'PM' ? 12 : 0);
  const now = new Date(nowMs);
  const candidateUtcMs = Date.UTC(now.getUTCFullYear(), monthIndex, day, hour24, minute, 0, 0);
  if (Number.isFinite(candidateUtcMs)) {
    const deltaMs = candidateUtcMs - nowMs;
    if (deltaMs >= -60_000 && deltaMs <= (7 * 24 * 60 * 60 * 1000)) return candidateUtcMs;
  }
  const nextYearCandidateUtcMs = Date.UTC(now.getUTCFullYear() + 1, monthIndex, day, hour24, minute, 0, 0);
  if (Number.isFinite(nextYearCandidateUtcMs)) {
    const deltaMs = nextYearCandidateUtcMs - nowMs;
    if (deltaMs >= -60_000 && deltaMs <= (7 * 24 * 60 * 60 * 1000)) return nextYearCandidateUtcMs;
  }
  return null;
}

function readFirstValue(source, keys = []) {
  for (const key of keys) {
    const value = source?.[key];
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return null;
}

function hasProviderCooldownCommentary(value) {
  if (typeof value !== 'string') return false;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return false;
  if (['rate_limited', 'rate limit', 'rate_limited_status', 'rate-limit'].includes(normalized)) return false;
  return normalized.includes('limit')
    || normalized.includes('quota')
    || normalized.includes('reset')
    || normalized.includes('retry')
    || normalized.includes('provider');
}

function hasRateLimitCooldownEvidence(status) {
  const textValues = [
    'detail',
    'error_message',
    'reason',
    'rate_limit_reason',
    'transcript_detail',
    'lastDetail',
    'lastSummary',
  ].map((key) => status?.[key]);
  return [
    ...textValues,
    status?.agent_ended?.error_message,
    status?.transcript?.lastDetail,
    status?.transcript?.lastSummary,
  ].some(hasProviderCooldownCommentary);
}

function durationFactor(unit) {
  if (selectTruthyValue(() => (typeof unit !== 'string'), () => (unit.trim() === ''))) {
    throw new Error('rate-limit duration parser requires explicit unit (seconds expected by default)');
  }
  const normalized = unit.toLowerCase();
  if (selectTruthyValue(() => (normalized.startsWith('ms')), () => (normalized.startsWith('millisecond')))) return 1;
  if (normalized.startsWith('m') && !normalized.startsWith('ms') && !normalized.startsWith('millisecond')) return 60_000;
  if (normalized.startsWith('h')) return 3_600_000;
  return 1000;
}

function parseDurationSeconds(text) {
  const value = typeof text === 'string' ? text : '';
  if (!value.trim()) return null;
  const durationMatches = [...value.matchAll(/(\d+(?:\.\d+)?)\s*(milliseconds?|ms|seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h)\b/gi)];
  if (durationMatches.length === 0) return null;
  const durationMs = durationMatches.reduce((sum, match) => {
    const amount = Number(match[1]);
    if (selectTruthyValue(() => (!Number.isFinite(amount)), () => (amount < 0))) return sum;
    return sum + (amount * durationFactor(match[2]));
  }, 0);
  return durationMs > 0 ? Math.ceil(durationMs / 1000) : null;
}

function extractTextCooldown(text, nowMs) {
  const value = typeof text === 'string' ? text : '';
  if (!value.trim()) return {};
  const humanResetAtMs = parseMonthDayUtcTimestamp(value, nowMs);
  if (humanResetAtMs != null) {
    return {
      resumeAtMs: humanResetAtMs,
      source: 'provider_status_reset_at_text',
      detail: 'Provider status exposed human reset timestamp',
    };
  }
  const timestampMatch = value.match(/\b(?:resume|resumes|reset|resets|retry|try again)(?:\s+(?:at|after|on))?[:\s]+(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)\b/i);
  if (timestampMatch) return { resumeAtMs: validDateMsOrNull(timestampMatch[1]), source: 'provider_status_resume_at', detail: 'Provider status exposed reset timestamp' };
  const retryAfterMatch = value.match(/\b(?:retry[-\s]?after|try again in|resume in|next reset in|reset in|resets in)\s*:?\s*((?:\d+(?:\.\d+)?\s*(?:milliseconds?|ms|seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h)\b[\s,]*)+)/i);
  const retryAfterSeconds = parseDurationSeconds(retryAfterMatch?.[1]);
  if (retryAfterSeconds == null) return {};
  return { retryAfterSeconds, source: 'provider_status_retry_after', detail: 'Provider status exposed retry-after duration' };
}

export function resolveRateLimitCooldown(status = {}, rateLimitConfig = {}, options = {}) {
  const nowMs = Number.isFinite(options.nowMs) ? Number(options.nowMs) : Date.now();
  const bufferMs = selectDefinedValue(() => (finiteNumberOrNull(rateLimitConfig.cooldown_buffer_ms)), () => (0));
  const directResumeAt = readFirstValue(status, [
    'resume_at',
    'resumeAt',
    'reset_at',
    'resetAt',
    'rate_limit_reset_at',
    'rateLimitResetAt',
    'cooldown_resume_at',
    'cooldownResumeAt',
  ]);
  const directResumeAtMs = validDateMsOrNull(directResumeAt);
  if (directResumeAtMs != null) {
    const resumeAtMs = Math.max(nowMs, directResumeAtMs) + providerResetBufferMs(bufferMs);
    return {
      cooldownMs: Math.max(0, resumeAtMs - nowMs),
      resumeAt: new Date(resumeAtMs),
      cooldownSource: 'provider_status_resume_at',
      cooldownSourceDetail: 'Provider/status supplied cooldown reset time',
      retryAfterSeconds: Math.max(0, Math.ceil((directResumeAtMs - nowMs) / 1000)),
      cooldownBufferMs: bufferMs,
    };
  }

  const directRetryAfterSeconds = finiteNumberOrNull(readFirstValue(status, [
    'retry_after_seconds',
    'retryAfterSeconds',
    'retry_after',
    'retryAfter',
  ]));
  if (directRetryAfterSeconds != null) {
    const cooldownMs = Math.ceil(directRetryAfterSeconds * 1000) + bufferMs;
    return {
      cooldownMs,
      resumeAt: new Date(nowMs + cooldownMs),
      cooldownSource: 'provider_status_retry_after',
      cooldownSourceDetail: 'Provider/status supplied retry-after duration',
      retryAfterSeconds: directRetryAfterSeconds,
      cooldownBufferMs: bufferMs,
    };
  }

  const textCooldown = extractTextCooldown([
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
  ].filter(Boolean).join('\n'), nowMs);
  if (textCooldown.resumeAtMs != null) {
    const resumeAtMs = Math.max(nowMs, textCooldown.resumeAtMs) + providerResetBufferMs(bufferMs);
    return {
      cooldownMs: Math.max(0, resumeAtMs - nowMs),
      resumeAt: new Date(resumeAtMs),
      cooldownSource: textCooldown.source,
      cooldownSourceDetail: textCooldown.detail,
      retryAfterSeconds: Math.max(0, Math.ceil((textCooldown.resumeAtMs - nowMs) / 1000)),
      cooldownBufferMs: bufferMs,
    };
  }
  if (textCooldown.retryAfterSeconds != null) {
    const cooldownMs = Math.ceil(textCooldown.retryAfterSeconds * 1000) + bufferMs;
    return {
      cooldownMs,
      resumeAt: new Date(nowMs + cooldownMs),
      cooldownSource: textCooldown.source,
      cooldownSourceDetail: textCooldown.detail,
      retryAfterSeconds: textCooldown.retryAfterSeconds,
      cooldownBufferMs: bufferMs,
    };
  }

  const configuredHours = finiteNumberOrNull(rateLimitConfig.cooldown_hours);
  if (!hasRateLimitCooldownEvidence(status)) {
    throw new Error('rate limit status did not include reset metadata or provider detail');
  }
  if (configuredHours == null) {
    throw new Error('rate_limit.cooldown_hours must be configured when provider cooldown metadata is unavailable');
  }
  const cooldownMs = Math.ceil(configuredHours * 60 * 60 * 1000) + bufferMs;
  return {
    cooldownMs,
    resumeAt: new Date(nowMs + cooldownMs),
    cooldownSource: 'config',
    cooldownSourceDetail: `Provider did not expose a usable reset time; using configured rate_limit.cooldown_hours=${configuredHours}`,
    retryAfterSeconds: Math.round(cooldownMs / 1000),
    cooldownHours: configuredHours,
    cooldownBufferMs: bufferMs,
  };
}
