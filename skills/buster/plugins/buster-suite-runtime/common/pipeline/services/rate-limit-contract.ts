import { selectDefinedValue, selectTruthyValue } from '../optional-absence.js';
type UnknownRecord = Record<string, any>;

function readIdentityValue(identity: UnknownRecord = {}, keys: string[] = []): unknown {
  for (const key of keys) {
    const value = identity?.[key];
    if (value != null && value !== '') return value;
  }
  return null;
}

function truncateForDiscord(text: unknown, maxLength = 1024): string {
  const value = String(selectDefinedValue(() => (text), () => ('')));
  return value.length <= maxLength
    ? value
    : `${value.slice(0, Math.max(0, maxLength - 1))}…`;
}

function assignIfPresent(target: UnknownRecord, key: string, value: unknown): void {
  if (selectTruthyValue(() => (value == null), () => (value === ''))) return;
  target[key] = value;
}

function normalizeCooldownMs(value: unknown): number | null {
  if (selectTruthyValue(() => (selectTruthyValue(() => (value === null), () => (value === undefined))), () => (value === ''))) return null;
  const normalized = Number(value);
  return Number.isFinite(normalized) && normalized >= 0 ? normalized : null;
}

function normalizeFiniteNumber(value: unknown): number | null {
  if (selectTruthyValue(() => (selectTruthyValue(() => (value === null), () => (value === undefined))), () => (value === ''))) return null;
  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : null;
}

export const RATE_LIMIT_PROVIDER_DEFAULT_POLICY = Object.freeze({
  provider: 'anthropic',
  reason: 'explicit_default_policy',
});

export function normalizeRateLimitProvider(provider: unknown, { allowAnthropicDefault = false }: { allowAnthropicDefault?: boolean } = {}): string | null {
  const normalized = typeof provider === 'string' ? provider.trim() : '';
  if (normalized) return normalized;
  return allowAnthropicDefault ? RATE_LIMIT_PROVIDER_DEFAULT_POLICY.provider : null;
}

export function buildRateLimitDetectedPayload(identity: UnknownRecord = {}, {
  provider = null,
  allowAnthropicDefault = false,
  pauseCount = null,
  maxPauses = null,
  cooldownMs = null,
  resumeAt = null,
  retryAfterSeconds = null,
  cooldownSource = null,
  detail = null,
}: UnknownRecord = {}): UnknownRecord {
  const payload: UnknownRecord = {};
  const resolvedProvider = normalizeRateLimitProvider(provider, { allowAnthropicDefault });
  assignIfPresent(payload, 'run_id', readIdentityValue(identity, ['run_id']));
  assignIfPresent(payload, 'module_id', readIdentityValue(identity, ['module_id']));
  assignIfPresent(payload, 'gate_id', readIdentityValue(identity, ['gate_id']));
  assignIfPresent(payload, 'gate_type', readIdentityValue(identity, ['gate_type']));
  assignIfPresent(payload, 'agent_type', readIdentityValue(identity, ['agent_type']));
  assignIfPresent(payload, 'attempt', normalizeFiniteNumber(readIdentityValue(identity, ['attempt'])));
  assignIfPresent(payload, 'dispatch_id', readIdentityValue(identity, ['dispatch_id']));
  assignIfPresent(payload, 'gateway_label', readIdentityValue(identity, ['gateway_label']));
  assignIfPresent(payload, 'session_key', readIdentityValue(identity, ['session_key']));
  assignIfPresent(payload, 'provider', resolvedProvider);

  const resolvedCooldownMs = normalizeCooldownMs(cooldownMs);
  const resolvedRetryAfterSeconds = retryAfterSecondsAuthority(retryAfterSeconds, resolvedCooldownMs);
  if (resolvedRetryAfterSeconds != null) payload.retry_after_seconds = resolvedRetryAfterSeconds;
  if (resolvedCooldownMs != null) payload.cooldown_ms = resolvedCooldownMs;
  if (resumeAt) payload.resume_at = resumeAt;
  assignIfPresent(payload, 'cooldown_source', cooldownSource);
  assignIfPresent(payload, 'pause_count', normalizeFiniteNumber(pauseCount));
  assignIfPresent(payload, 'max_pauses', normalizeFiniteNumber(maxPauses));
  assignIfPresent(payload, 'detail', detail);

  return payload;
}

export function formatRateLimitEmbed(context: UnknownRecord = {}, pauseCount: unknown, maxPauses: unknown, cooldownMs: unknown): UnknownRecord {
  const normalizedCooldownMs = normalizeCooldownMs(cooldownMs);
  const cooldownHours = normalizedCooldownMs == null ? null : normalizedCooldownMs / (60 * 60 * 1000);
  const cooldownDisplay = normalizedCooldownMs == null
    ? 'cooldown_missing'
    : cooldownHours !== null && cooldownHours >= 1
      ? `${cooldownHours}h`
      : `${Math.round(normalizedCooldownMs / 60000)}min`;
  const resumeAtDisplay = normalizedCooldownMs == null
    ? 'resume_time_missing'
    : new Date(Date.now() + normalizedCooldownMs).toISOString();

  const detail = selectDefinedValue(() => (context?.detail), () => (''));
  const cooldownSource = readIdentityValue(context, ['cooldownSource', 'cooldown_source']);
  const cooldownSourceDetail = readIdentityValue(context, ['cooldownSourceDetail', 'cooldown_source_detail']);
  let cause = /quota exceeded|usage limit/i.test(detail) ? 'Provider quota exceeded' : 'Provider rate limit';
  if (detail) cause = truncateForDiscord(`${cause} — ${detail}`, 200);

  return {
    title: `⏳ Rate Limited — Pause ${pauseCount}/${maxPauses}`,
    description: 'Pipeline paused — this does NOT consume a retry attempt.',
    fields: [
      { name: 'Cause', value: cause, inline: false },
      { name: 'Pause', value: `${pauseCount}/${maxPauses}`, inline: true },
      { name: 'Cooldown', value: cooldownDisplay, inline: true },
      { name: 'Resume at', value: resumeAtDisplay, inline: false },
      ...(cooldownSource ? [{ name: 'Cooldown source', value: truncateForDiscord(String(cooldownSourceDetailAuthority(cooldownSourceDetail, cooldownSource)), 300), inline: false }] : []),
    ],
  };
}

function retryAfterSecondsAuthority(retryAfterSeconds: unknown, resolvedCooldownMs: number | null): number | null {
  const normalizedRetryAfterSeconds = normalizeFiniteNumber(retryAfterSeconds);
  if (normalizedRetryAfterSeconds !== null) return normalizedRetryAfterSeconds;
  return resolvedCooldownMs == null ? null : Math.round(resolvedCooldownMs / 1000);
}

function cooldownSourceDetailAuthority(cooldownSourceDetail: unknown, cooldownSource: unknown): unknown {
  if (cooldownSourceDetail !== null && cooldownSourceDetail !== undefined) return cooldownSourceDetail;
  return cooldownSource;
}

export function resolveRateLimitRecoveryAction({ sessionAlive = false, gatewayUnreachable = false }: { sessionAlive?: boolean; gatewayUnreachable?: boolean } = {}): string {
  return [gatewayUnreachable === true, sessionAlive === true].some(Boolean)
    ? 'resume'
    : 'kill';
}
