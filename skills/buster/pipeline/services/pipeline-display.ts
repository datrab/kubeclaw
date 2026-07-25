import { selectTruthyValue } from '../optional-absence.ts';

export function normalizeIdentityValue(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null;
  return String(value);
}

export function firstNonEmptyString(values: unknown[] = [], defaultValue: string | null = null): string | null {
  for (const value of values) {
    const normalized = normalizeIdentityValue(value);
    if (normalized !== null) return normalized;
  }
  return defaultValue;
}

export function displayValue(value: unknown, missing = '—'): string {
  const normalized = normalizeIdentityValue(value);
  return normalized === null ? missing : normalized;
}

export function truncatedDisplay(value: unknown, max = 1024, missing = '—'): string {
  const text = displayValue(value, missing);
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}
