export function normalizeCompletionIdentityValue(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null;
  return String(value);
}

export function firstDefinedCompletionValue(...values: unknown[]): unknown | null {
  for (const value of values) {
    if (value !== undefined && value !== null) return value;
  }
  return null;
}
