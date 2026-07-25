export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function nonEmptyText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized ? normalized : null;
}

export function firstNonEmptyText(...values: unknown[]): string | null {
  for (const value of values) {
    const normalized = nonEmptyText(value);
    if (normalized) return normalized;
  }
  return null;
}
