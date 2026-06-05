import {
  AGENT_OBSERVABILITY_MASK_BASIC_API_KEY_PATTERN,
  AGENT_OBSERVABILITY_MASKING_PROFILE,
} from './constants.ts';
import type { AgentObservabilityJsonValue, AgentObservabilityMaskingV1 } from './types.ts';

const API_KEY_PATTERN = /\b((?:api[_-]?key|token|secret|authorization|bearer)\s*[:=]\s*)([A-Za-z0-9._~+/=-]{12,})\b/gi;
const SENSITIVE_KEY_PATTERN = /(?:^|[_-])(?:api[_-]?keys?|token|secret|authorization|bearer)(?:$|[_-])/i;
const MASK = '[REDACTED_API_KEY]';

export function createFullContentMinimalMasking(masked = false): AgentObservabilityMaskingV1 {
  return {
    profile: AGENT_OBSERVABILITY_MASKING_PROFILE,
    content: 'full',
    masked: masked ? [AGENT_OBSERVABILITY_MASK_BASIC_API_KEY_PATTERN] : [],
  };
}

function maskString(value: string): { value: string; masked: boolean } {
  let masked = false;
  const next = value.replace(API_KEY_PATTERN, (_match, prefix: string) => {
    masked = true;
    return `${prefix}${MASK}`;
  });
  return { value: next, masked };
}

function normalizeKeyName(key: string) {
  return String(key || '').replace(/([a-z0-9])([A-Z])/g, '$1_$2');
}

function isSensitiveKey(key: string) {
  return SENSITIVE_KEY_PATTERN.test(normalizeKeyName(key));
}

function maskJsonValue(value: AgentObservabilityJsonValue): { value: AgentObservabilityJsonValue; masked: boolean } {
  if (typeof value === 'string') return maskString(value);
  if (Array.isArray(value)) {
    let masked = false;
    const next = value.map((item) => {
      const result = maskJsonValue(item);
      masked ||= result.masked;
      return result.value;
    });
    return { value: next, masked };
  }
  if (value && typeof value === 'object') {
    let masked = false;
    const next: Record<string, AgentObservabilityJsonValue> = {};
    for (const [key, item] of Object.entries(value)) {
      const result = isSensitiveKey(key) ? redactSensitiveJsonValue(item) : maskJsonValue(item);
      masked ||= result.masked;
      next[key] = result.value;
    }
    return { value: next, masked };
  }
  return { value, masked: false };
}

function redactSensitiveJsonValue(value: AgentObservabilityJsonValue): { value: AgentObservabilityJsonValue; masked: boolean } {
  if (typeof value === 'string') return { value: MASK, masked: true };
  if (Array.isArray(value)) {
    let masked = false;
    const next = value.map((item) => {
      const result = redactSensitiveJsonValue(item);
      masked ||= result.masked;
      return result.value;
    });
    return { value: next, masked };
  }
  if (value && typeof value === 'object') {
    let masked = false;
    const next: Record<string, AgentObservabilityJsonValue> = {};
    for (const [key, item] of Object.entries(value)) {
      const result = redactSensitiveJsonValue(item);
      masked ||= result.masked;
      next[key] = result.value;
    }
    return { value: next, masked };
  }
  return { value, masked: false };
}

export function applyMinimalApiKeyMask<T extends AgentObservabilityJsonValue>(value: T): { value: T; masking: AgentObservabilityMaskingV1 } {
  const result = maskJsonValue(value);
  return {
    value: result.value as T,
    masking: createFullContentMinimalMasking(result.masked),
  };
}
