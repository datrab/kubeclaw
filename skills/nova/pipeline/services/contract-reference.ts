export function canonicalRef(prefix: string, value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null;
  const normalized = String(value).trim();
  if (!normalized) return null;
  return normalized.startsWith(`${prefix}:`) ? normalized : `${prefix}:${normalized}`;
}

export function canonicalExplicitRef(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null;
  const normalized = String(value).trim();
  return normalized || null;
}
